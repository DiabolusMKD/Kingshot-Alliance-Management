'use client';

import { supabase } from './supabaseClient';
import { getAllianceById } from './allianceService';
import { LegionSchedule, getLegionSchedules } from './legionSchedule';
import { getAllianceSlug } from './allianceSlug';
import { getEventSlug } from './eventSlug';
import { Alliance, AllianceEvent, EventPlayer, EventStatus, EventType, LegionResultKey } from '@/types';

/** alliance_event.eventId -> event type */
const EVENT_TYPES: Record<number, EventType> = { 1: 'swordland', 2: 'tri-alliance' };

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  swordland: 'Swordland',
  'tri-alliance': 'Tri Alliance',
};

/** One event a player was assigned to, from that player's point of view */
export interface PlayerEventEntry {
  allianceEventId: number;
  type: EventType;
  /** Alliance that ran the event (differs from the player's own for SSL) */
  alliance: Alliance | null;
  startsAt: string | null;
  status: EventStatus;
  isSsl: boolean;
  legion: LegionResultKey;
  isSubstitute: boolean;
  /** Swordland building / Tri Alliance team + leader/support/offense */
  position: string | null;
  positionRole: string | null;
  /** The player's alliance when the event happened */
  playerAlliance: Alliance | null;
  /** Power saved with the event (see powerType) */
  power: number | null;
  powerType: EventPlayer['powerType'];
  /** Powers just before the event: the saved power for its type, else the power history */
  swordlandPower: number | null;
  totalPower: number | null;
  /** null when the event has no score for this player */
  points: number | null;
  /** Completed events only: showed up = score > 0 (no attendance is stored yet) */
  attended: boolean | null;
  /** Result of the player's legion: win/lose or 1st/2nd/3rd */
  result: string | null;
  isMvp: boolean;
  schedule: LegionSchedule;
  /** Link to the event editor */
  href: string | null;
}

export interface PlayerEventSummary {
  type: EventType;
  assigned: number;
  completed: number;
  attended: number;
  /** attended / completed, 0-1; null without completed events */
  attendanceRate: number | null;
  totalPoints: number;
  /** Average over attended events */
  averagePoints: number | null;
  bestPoints: number | null;
  mvps: number;
  substitute: number;
  /** result -> count, e.g. { win: 3, lose: 1 } */
  results: Record<string, number>;
}

type EventPlayerWithEvent = EventPlayer & { alliance_event: AllianceEvent | null };

/** One recorded change of the player's powers (player_power_history) */
export interface PowerRecord {
  power: number | null;
  swordlandPower: number | null;
  recordedAt: string;
}

/** Latest record at or before `at` (records sorted oldest first) */
function recordAt(records: PowerRecord[], at: string | null | undefined): PowerRecord | null {
  if (!at) return null;
  const time = Date.parse(at);
  let found: PowerRecord | null = null;
  for (const record of records) {
    if (Date.parse(record.recordedAt) > time) break;
    found = record;
  }
  return found;
}

/** Turns the player's event_player rows (with their event) into entries (pure, no requests) */
export function buildPlayerEntries(
  rows: EventPlayerWithEvent[],
  playerId: string,
  alliances: Map<number, Alliance>,
  powerRecords: PowerRecord[] = [],
): PlayerEventEntry[] {
  const entries: PlayerEventEntry[] = [];

  rows.forEach((row) => {
    const event = row.alliance_event;
    const type = event ? EVENT_TYPES[event.eventId] : undefined;
    if (!event || !type || event.id === undefined) return;

    const isLegion1 = row.legion === 'legion_1';
    const result = (isLegion1 ? event.legion1Result : event.legion2Result) ?? null;
    const mvp = (isLegion1 ? event.legion1Mvp : event.legion2Mvp) ?? null;
    const alliance = alliances.get(event.allianceId) ?? null;
    const isCompleted = event.status === 'completed';
    const record = recordAt(powerRecords, event.startsAt);
    const saved = (type: EventPlayer['powerType']) => (row.powerType === type ? row.powerAtEvent : null);

    entries.push({
      allianceEventId: event.id,
      type,
      alliance,
      startsAt: event.startsAt ?? null,
      status: event.status,
      isSsl: event.eventVariant === 'sls',
      legion: row.legion,
      isSubstitute: row.isSubstitute,
      position: row.position,
      positionRole: row.positionRole,
      playerAlliance: row.playerAllianceId != null ? alliances.get(row.playerAllianceId) ?? null : null,
      power: row.powerAtEvent,
      powerType: row.powerType,
      swordlandPower: saved('swordland') ?? record?.swordlandPower ?? null,
      totalPower: saved('power') ?? record?.power ?? null,
      points: row.score,
      // Showed up = score > 0 (stored as didShowUp; derived for rows saved without it)
      attended: isCompleted ? row.didShowUp ?? (row.score ?? 0) > 0 : null,
      result,
      isMvp: mvp != null && String(mvp) === String(playerId),
      schedule: getLegionSchedules(event)[row.legion],
      href: alliance
        ? `/${alliance.kingdomId}/${getAllianceSlug(alliance.id)}/events/${type}?event=${getEventSlug(event.id)}`
        : null,
    });
  });

  // Oldest first, events without a date last
  return entries.sort((a, b) => {
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
}

export function summarizeEntries(type: EventType, entries: PlayerEventEntry[]): PlayerEventSummary {
  const ofType = entries.filter((e) => e.type === type);
  const completed = ofType.filter((e) => e.status === 'completed');
  const attended = completed.filter((e) => e.attended);
  const scored = attended.map((e) => e.points ?? 0);
  const totalPoints = scored.reduce((sum, p) => sum + p, 0);

  const results: Record<string, number> = {};
  completed.forEach((e) => {
    if (e.result) results[e.result] = (results[e.result] ?? 0) + 1;
  });

  return {
    type,
    assigned: ofType.length,
    completed: completed.length,
    attended: attended.length,
    attendanceRate: completed.length ? attended.length / completed.length : null,
    totalPoints,
    averagePoints: attended.length ? totalPoints / attended.length : null,
    bestPoints: scored.length ? Math.max(...scored) : null,
    mvps: ofType.filter((e) => e.isMvp).length,
    substitute: ofType.filter((e) => e.isSubstitute).length,
    results,
  };
}

const EVENT_COLUMNS =
  'id, allianceId, eventId, startsAt, status, eventVariant, legion1Result, legion2Result, legion1Mvp, legion2Mvp, legion1StartTime, legion2StartTime';

/**
 * Every event the player took part in (event_player rows), across alliances and kingdoms:
 * the rows keep the player's alliance at the time, so moving never changes the history.
 */
export async function getPlayerEventHistory(playerId: string): Promise<PlayerEventEntry[]> {
  const { data, error } = await supabase
    .from('event_player')
    .select(`*, alliance_event(${EVENT_COLUMNS})`)
    .eq('playerId', playerId);
  if (error) throw new Error(`Failed to load the player's events: ${error.message}`);
  const rows = (data ?? []) as EventPlayerWithEvent[];

  // Alliances that ran these events (names + links) and the player's alliances at the time
  const allianceIds = [
    ...new Set(
      rows.flatMap((r) => [r.alliance_event?.allianceId, r.playerAllianceId]).filter((id): id is number => id != null),
    ),
  ];
  const found = await Promise.all(allianceIds.map((id) => getAllianceById(id).catch(() => null)));
  const alliances = new Map<number, Alliance>();
  found.forEach((a) => a && alliances.set(a.id, a));

  return buildPlayerEntries(rows, playerId, alliances, await getPowerRecords(playerId));
}

/** The player's power history, oldest first (empty when it can't be read) */
async function getPowerRecords(playerId: string): Promise<PowerRecord[]> {
  const { data, error } = await supabase
    .from('player_power_history')
    .select('power, swordlandPower, recordedAt')
    .eq('playerId', playerId)
    .order('recordedAt', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    console.warn('Power history not available:', error.message);
    return [];
  }
  const toNumber = (v: unknown) => (v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return (data ?? []).map((r: { power: unknown; swordlandPower: unknown; recordedAt: string }) => ({
    power: toNumber(r.power),
    swordlandPower: toNumber(r.swordlandPower),
    recordedAt: r.recordedAt,
  }));
}
