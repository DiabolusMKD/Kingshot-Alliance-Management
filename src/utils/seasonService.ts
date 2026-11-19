'use client';

import { supabase } from './supabaseClient';
import { getPlayersByIds } from './playerService';
import { getEventPlayers, saveEventData, toEditorData } from './eventData';
import { getLegionSchedules } from './legionSchedule';
import { getPowerMode } from './powerMode';
import { isNoShow } from './reliability';
import { AllianceEvent, EventPlayer, PlayerAssignment, SwordlandSeason } from '@/types';

// ---------------- SEASONS ----------------

export async function getSeasons(allianceId: number): Promise<SwordlandSeason[]> {
  const { data, error } = await supabase
    .from('swordland_season')
    .select('*')
    .eq('allianceId', allianceId)
    .order('createdAt', { ascending: true });
  if (error) throw new Error(`Failed to load seasons: ${error.message}`);
  return (data ?? []) as SwordlandSeason[];
}

export async function createSeason(allianceId: number, name: string): Promise<SwordlandSeason> {
  const { data, error } = await supabase
    .from('swordland_season')
    .insert([{ allianceId, name: name.trim() }])
    .select()
    .single();
  if (error) throw new Error(`Failed to create season: ${error.message}`);
  return data as SwordlandSeason;
}

/** "Season 3" when there are 2 seasons already */
export const getNextSeasonName = (seasons: SwordlandSeason[]) => `Season ${seasons.length + 1}`;

const startTime = (event: AllianceEvent) => (event.startsAt ? new Date(event.startsAt).getTime() : 0);

/** Latest event of the season (by start), optionally only those starting before `before` */
export function getLastSeasonEvent(
  events: AllianceEvent[],
  seasonId: number,
  before?: AllianceEvent,
): AllianceEvent | null {
  const candidates = events
    .filter((e) => e.seasonId === seasonId && e.id !== before?.id)
    .filter((e) => !before || startTime(e) < startTime(before))
    .sort((a, b) => startTime(b) - startTime(a));
  return candidates[0] ?? null;
}

// ---------------- ASSIGNMENTS FROM THE LAST EVENT ----------------

/**
 * Copies the source event's assignments (legions, substitutes, buildings, start times,
 * power mode) into a new event, with each player's current power. Points aren't copied.
 * Returns the saved target event.
 */
export async function copyAssignmentsFromEvent(
  source: AllianceEvent,
  target: AllianceEvent,
): Promise<AllianceEvent> {
  const { assignments } = toEditorData(source, await getEventPlayers(source.id!));
  if (assignments.length === 0) return target;

  // Deleted players can't be added again
  const players = await getPlayersByIds(assignments.map((a) => a.playerId));
  const byId = new Map(players.map((p) => [String(p.id), p]));

  const copied: PlayerAssignment[] = assignments
    .filter((a) => byId.has(String(a.playerId)))
    .map((a) => {
      const player = byId.get(String(a.playerId))!;
      return {
        playerId: a.playerId,
        legion: a.legion,
        name: player.name,
        power: player.swordlandPower,
        swordlandPower: player.swordlandPower,
        totalPower: player.power,
        ...(a.position ? { position: a.position } : {}),
        ...(a.positionRole ? { positionRole: a.positionRole } : {}),
      };
    });

  return saveEventData(target, {
    status: target.status,
    assignments: copied,
    powerMode: getPowerMode(source),
    legionSchedules: getLegionSchedules(source),
    notes: target.notes ?? '',
  });
}

// ---------------- NO-SHOWS OF THE LAST EVENT ----------------

/** player.ids assigned to a building in a completed event who scored 0 */
export async function getNoShowIds(event: AllianceEvent): Promise<Set<string>> {
  if (event.status !== 'completed') return new Set();
  const rows = await getEventPlayers(event.id!);
  return new Set(rows.filter((row) => row.playerId != null && isNoShow(row)).map((row) => String(row.playerId)));
}

// ---------------- STATISTICS ----------------

/** event_player rows of the given events */
export async function getEventPlayersOfEvents(eventIds: number[]): Promise<EventPlayer[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from('event_player')
    .select('*')
    .in('alliance_event_id', eventIds);
  if (error) throw new Error(`Failed to load event players: ${error.message}`);
  return (data ?? []) as EventPlayer[];
}

/** Removes a season (its events stay, without a season) */
export async function deleteSeason(id: number): Promise<void> {
  const { error } = await supabase.from('swordland_season').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete season: ${error.message}`);
}
