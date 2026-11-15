'use client';

import { supabase } from './supabaseClient';
import { getPlayersByIds } from './playerService';
import { LegionSchedules } from './legionSchedule';
import { PowerMode } from './powerMode';
import { getPowersAtOrNone, hasEventStarted, PowerSnapshot } from './powerHistory';
import {
  AllianceEvent,
  EventPlayer,
  EventResults,
  EventStatus,
  LegionResultKey,
  PlayerAssignment,
} from '@/types';

const LEGION_KEYS: LegionResultKey[] = ['legion_1', 'legion_2'];
const TRI_ALLIANCE_EVENT_ID = 2;

/** Editor legion key: Swordland substitute_legion1, Tri Alliance substituteLegion1 */
function toEditorLegion(eventTypeId: number, legion: LegionResultKey, isSubstitute: boolean): string {
  const n = legion === 'legion_1' ? 1 : 2;
  if (!isSubstitute) return `legion${n}`;
  return eventTypeId === TRI_ALLIANCE_EVENT_ID ? `substituteLegion${n}` : `substitute_legion${n}`;
}

/** legion1 / substitute_legion1 / substituteLegion1 -> legion_1 + substitute flag */
export function parseEditorLegion(legion: string): { legion: LegionResultKey; isSubstitute: boolean } | null {
  const normalized = legion.toLowerCase().replace(/_/g, '');
  const isSubstitute = normalized.startsWith('substitute');
  if (normalized.endsWith('legion1')) return { legion: 'legion_1', isSubstitute };
  if (normalized.endsWith('legion2')) return { legion: 'legion_2', isSubstitute };
  return null;
}

// ---------------- LOAD ----------------

export async function getEventPlayers(allianceEventId: number): Promise<EventPlayer[]> {
  const { data, error } = await supabase
    .from('event_player')
    .select('*')
    .eq('alliance_event_id', allianceEventId);
  if (error) throw new Error(`Failed to load event players: ${error.message}`);
  return (data ?? []) as EventPlayer[];
}

export interface EventEditorData {
  /** Saved assignments in the editor's format (points + building/team included) */
  assignments: PlayerAssignment[];
  /** Legion results, MVPs and points; null when nothing was entered yet */
  results: EventResults | null;
}

/** Builds the editor state from the event row + its event_player rows (pure) */
export function toEditorData(event: AllianceEvent, rows: EventPlayer[]): EventEditorData {
  const assignments: PlayerAssignment[] = rows
    .filter((row) => row.playerId != null)
    .map((row) => ({
      playerId: String(row.playerId),
      legion: toEditorLegion(event.eventId, row.legion, row.isSubstitute),
      name: row.playerName ?? '',
      power: row.powerAtEvent ?? 0,
      ...(row.position ? { position: row.position } : {}),
      ...(row.positionRole ? { positionRole: row.positionRole } : {}),
      ...(row.score !== null ? { points: row.score } : {}),
    }));

  // MVP ids as strings, like every other player id in the editor
  const mvpId = (id: string | number | null | undefined) => (id != null ? String(id) : null);
  const meta = {
    legion_1: { status: event.legion1Result ?? null, mvp: mvpId(event.legion1Mvp) },
    legion_2: { status: event.legion2Result ?? null, mvp: mvpId(event.legion2Mvp) },
  };
  const hasResults =
    LEGION_KEYS.some((key) => meta[key].status || meta[key].mvp) || rows.some((row) => row.score !== null);

  const results = hasResults
    ? (Object.fromEntries(
        LEGION_KEYS.map((key) => [
          key,
          {
            ...meta[key],
            players_points: rows
              .filter((row) => row.legion === key && row.playerId != null && row.score !== null)
              .map((row) => ({ [String(row.playerId)]: row.score! })),
          },
        ]),
      ) as EventResults)
    : null;

  return { assignments, results };
}

export async function loadEventEditorData(event: AllianceEvent): Promise<EventEditorData> {
  return toEditorData(event, await getEventPlayers(event.id!));
}

// ---------------- SAVE ----------------

export interface EventSaveInput {
  status: EventStatus;
  assignments: PlayerAssignment[];
  /** Completed events only: legion results, MVPs and points */
  results?: EventResults;
  /** Swordland only */
  powerMode?: PowerMode;
  legionSchedules: LegionSchedules;
  notes: string;
}

/** Power saved with the assignment, in the power the event used */
function getPowerAtEvent(
  event: AllianceEvent,
  assignment: PlayerAssignment,
  powerMode?: PowerMode,
): Pick<EventPlayer, 'powerAtEvent' | 'powerType'> {
  if (event.eventId === TRI_ALLIANCE_EVENT_ID) {
    return {
      powerAtEvent: Number(assignment.triAlliancePower ?? assignment.power) || null,
      powerType: 'tri_alliance',
    };
  }
  if (powerMode === 'power' && assignment.totalPower !== undefined) {
    return { powerAtEvent: Number(assignment.totalPower) || null, powerType: 'power' };
  }
  return {
    powerAtEvent: Number(assignment.swordlandPower ?? assignment.power) || null,
    powerType: 'swordland',
  };
}

/** Power saved with the assignment, from the player's powers just before the event started */
function getPowerFromSnapshot(
  event: AllianceEvent,
  snapshot: PowerSnapshot,
  powerMode?: PowerMode,
): Pick<EventPlayer, 'powerAtEvent' | 'powerType'> | null {
  if (event.eventId === TRI_ALLIANCE_EVENT_ID) {
    return snapshot.triAlliancePower !== null
      ? { powerAtEvent: snapshot.triAlliancePower, powerType: 'tri_alliance' }
      : null;
  }
  if (powerMode === 'power') {
    return snapshot.power !== null ? { powerAtEvent: snapshot.power, powerType: 'power' } : null;
  }
  return snapshot.swordlandPower !== null
    ? { powerAtEvent: snapshot.swordlandPower, powerType: 'swordland' }
    : null;
}

/** { playerId: points } from the editor's results */
function getScores(results: EventResults): Map<string, number> {
  const scores = new Map<string, number>();
  LEGION_KEYS.forEach((key) =>
    results[key].players_points.forEach((entry) =>
      Object.entries(entry).forEach(([id, value]) => {
        if (typeof value === 'number' && Number.isFinite(value)) scores.set(id, Math.round(value));
      }),
    ),
  );
  return scores;
}

/**
 * Saves the event: its own columns (status, note, start times, results, power mode)
 * and one event_player row per assigned player. Rows of unassigned players are removed;
 * a player's alliance/kingdom/name are only written when the player is added.
 */
export async function saveEventData(event: AllianceEvent, input: EventSaveInput): Promise<AllianceEvent> {
  const eventId = event.id!;
  const now = new Date().toISOString();
  const isCompleted = input.status === 'completed';

  // 1. The event row
  const updates: Partial<AllianceEvent> = {
    status: input.status,
    updatedAt: now,
    notes: input.notes.trim() || null,
    legion1StartTime: input.legionSchedules.legion_1.time,
    legion2StartTime: input.legionSchedules.legion_2.time,
    ...(input.powerMode ? { powerMode: input.powerMode } : {}),
    ...(input.results
      ? {
          legion1Result: input.results.legion_1.status,
          legion2Result: input.results.legion_2.status,
          legion1Mvp: input.results.legion_1.mvp,
          legion2Mvp: input.results.legion_2.mvp,
        }
      : {}),
  };
  const { data: saved, error: eventError } = await supabase
    .from('alliance_event')
    .update(updates)
    .eq('id', eventId)
    .select()
    .single();
  if (eventError) throw new Error(`Failed to save event: ${eventError.message}`);

  // 2. Its players
  const existing = await supabase.from('event_player').select('playerId').eq('alliance_event_id', eventId);
  if (existing.error) throw new Error(`Failed to read event players: ${existing.error.message}`);
  // bigint ids arrive as numbers: compare them as strings
  const existingIds = new Set(
    (existing.data ?? [])
      .map((row: { playerId: number | string | null }) => row.playerId)
      .filter((id) => id != null)
      .map(String),
  );

  // Started events: each player's power just before the start (player_power_history)
  const startPowers =
    hasEventStarted(event) && event.startsAt
      ? await getPowersAtOrNone(
          input.assignments.map((a) => a.playerId),
          event.startsAt,
        )
      : null;
  const savedPower = (assignment: PlayerAssignment, playerId: string, isNew: boolean) => {
    const snapshot = startPowers?.get(playerId);
    const fromHistory = snapshot ? getPowerFromSnapshot(event, snapshot, input.powerMode) : null;
    if (fromHistory) return fromHistory;
    // No history: power is frozen once the event is completed (editing later keeps the power at the event)
    if (isCompleted && !isNew) return {};
    return getPowerAtEvent(event, assignment, input.powerMode);
  };

  const scores = input.results ? getScores(input.results) : null;
  const seen = new Set<string>();
  const mutableRows: Record<string, unknown>[] = [];
  const newRows: Record<string, unknown>[] = [];

  input.assignments.forEach((assignment) => {
    const playerId = String(assignment.playerId);
    const legionInfo = parseEditorLegion(String(assignment.legion));
    if (!legionInfo || seen.has(playerId)) return;
    seen.add(playerId);

    const row: Record<string, unknown> = {
      alliance_event_id: eventId,
      playerId,
      legion: legionInfo.legion,
      isSubstitute: legionInfo.isSubstitute,
      position: legionInfo.isSubstitute ? null : assignment.position ?? null,
      positionRole: legionInfo.isSubstitute ? null : assignment.positionRole ?? null,
      updatedAt: now,
      ...savedPower(assignment, playerId, !existingIds.has(playerId)),
      // Points only change when results are saved (completed events)
      ...(scores
        ? {
            score: scores.get(playerId) ?? null,
            didShowUp: isCompleted ? (scores.get(playerId) ?? 0) > 0 : null,
          }
        : {}),
    };

    if (existingIds.has(playerId)) mutableRows.push(row);
    else newRows.push(row);
  });

  // Rows of one upsert must have the same columns: group by the keys they set
  const groups = new Map<string, Record<string, unknown>[]>();
  mutableRows.forEach((row) => {
    const key = Object.keys(row).sort().join(',');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  for (const rows of groups.values()) {
    const { error } = await supabase
      .from('event_player')
      .upsert(rows, { onConflict: 'alliance_event_id,playerId' });
    if (error) throw new Error(`Failed to update event players: ${error.message}`);
  }

  if (newRows.length > 0) {
    // Snapshot of the player when added: alliance, kingdom, name
    const players = await getPlayersByIds(newRows.map((row) => row.playerId as string));
    const byId = new Map(players.map((p) => [String(p.id), p]));

    const inserts = newRows
      .filter((row) => byId.has(row.playerId as string))
      .map((row) => {
        const player = byId.get(row.playerId as string)!;
        return {
          score: null,
          didShowUp: null,
          ...row,
          playerName: player.name,
          playerAllianceId: player.allianceId != null && player.allianceId !== '' ? Number(player.allianceId) : null,
          playerKingdomId: player.kingdomId ?? null,
          createdAt: now,
        };
      });

    if (inserts.length > 0) {
      const { error } = await supabase.from('event_player').insert(inserts);
      if (error) throw new Error(`Failed to add event players: ${error.message}`);
    }
  }

  // Unassigned players leave the event
  const removedIds = [...existingIds].filter((id) => !seen.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase
      .from('event_player')
      .delete()
      .eq('alliance_event_id', eventId)
      .in('playerId', removedIds);
    if (error) throw new Error(`Failed to remove event players: ${error.message}`);
  }

  // The players now live in event_player: drop the legacy JSON copy (only once they're saved)
  if (event.assignments) {
    const { error } = await supabase.from('alliance_event').update({ assignments: null }).eq('id', eventId);
    if (error) console.warn('Could not clear the legacy assignments JSON:', error.message);
  }

  return { ...(saved as AllianceEvent), assignments: null };
}
