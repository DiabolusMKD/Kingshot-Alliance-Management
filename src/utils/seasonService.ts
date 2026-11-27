'use client';

import { supabase } from './supabaseClient';
import { getPlayersByIds } from './playerService';
import { getEventPlayers, saveEventData, toEditorData } from './eventData';
import { getLegionSchedules } from './legionSchedule';
import { getPowerMode } from './powerMode';
import { isNoShow } from './reliability';
import { AllianceEvent, EventPlayer, LegionResultKey, PlayerAssignment, SwordlandSeason } from '@/types';

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

// ---------------- SEASON ROSTER ----------------
// The players who registered for the season: the ones of its first event, each with the legion
// they started in (substitutes too). Kept in swordland_season_player so they stay when a later
// event (or the first one) drops them; derived from the first event when nothing is stored yet.

/** player.id -> the legion they started the season in */
export type SeasonRoster = Map<string, LegionResultKey>;

/** First event of the season (by start) */
export function getFirstSeasonEvent(events: AllianceEvent[], seasonId: number): AllianceEvent | null {
  return (
    events
      .filter((e) => e.seasonId === seasonId)
      .sort((a, b) => startTime(a) - startTime(b) || (a.id ?? 0) - (b.id ?? 0))[0] ?? null
  );
}

type RosterRow = { seasonId: number; playerId: string; legion: LegionResultKey };

/** Adds players to the roster; ones already in it keep their starting legion */
export async function addToSeasonRoster(rows: RosterRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('swordland_season_player')
    .upsert(rows, { onConflict: 'seasonId,playerId', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to save the season roster: ${error.message}`);
}

/** Stored rosters of several seasons (empty when the table doesn't exist yet) */
async function getStoredRosters(seasonIds: number[]): Promise<Map<number, SeasonRoster>> {
  const rosters = new Map<number, SeasonRoster>();
  if (seasonIds.length === 0) return rosters;
  const { data, error } = await supabase
    .from('swordland_season_player')
    .select('seasonId, playerId, legion')
    .in('seasonId', seasonIds);
  if (error) {
    console.warn('Season roster not available:', error.message);
    return rosters;
  }
  ((data ?? []) as RosterRow[]).forEach((row) => {
    const roster = rosters.get(Number(row.seasonId)) ?? new Map();
    roster.set(String(row.playerId), row.legion);
    rosters.set(Number(row.seasonId), roster);
  });
  return rosters;
}

const rosterFromRows = (rows: EventPlayer[]): SeasonRoster =>
  new Map(rows.filter((r) => r.playerId != null).map((r) => [String(r.playerId), r.legion]));

/**
 * Rosters of the given seasons: stored ones, or (seasons saved before the roster existed) the
 * players of the season's first event, stored now so they're kept from here on.
 */
export async function getSeasonRosters(
  seasonIds: number[],
  events: AllianceEvent[],
): Promise<Map<number, SeasonRoster>> {
  const ids = [...new Set(seasonIds)];
  const rosters = await getStoredRosters(ids);
  await Promise.all(
    ids
      .filter((id) => !rosters.get(id)?.size)
      .map(async (seasonId) => {
        const first = getFirstSeasonEvent(events, seasonId);
        if (!first?.id) return;
        const roster = rosterFromRows(await getEventPlayers(first.id));
        if (roster.size === 0) return;
        rosters.set(seasonId, roster);
        await addToSeasonRoster(
          [...roster].map(([playerId, legion]) => ({ seasonId, playerId, legion })),
        ).catch((error) => console.warn('Season roster not stored:', error));
      }),
  );
  return rosters;
}

/** After saving the season's first event: its players join the roster (nobody is removed) */
export async function registerFirstEventPlayers(
  seasonId: number,
  assignments: PlayerAssignment[],
): Promise<void> {
  const rows = assignments
    .map((a) => {
      const legion = String(a.legion).toLowerCase().endsWith('legion1') ? 'legion_1' : 'legion_2';
      return { seasonId, playerId: String(a.playerId), legion: legion as LegionResultKey };
    });
  await addToSeasonRoster(rows);
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
