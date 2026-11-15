'use client';

import { supabase } from './supabaseClient';
import { AllianceEvent, Player } from '@/types';

/** A player's powers as recorded at some moment (player_power_history) */
export interface PowerSnapshot {
  power: number | null;
  swordlandPower: number | null;
  triAlliancePower: number | null;
  recordedAt: string;
}

interface PowerHistoryRow {
  playerId: number | string;
  power: number | string | null;
  swordlandPower: number | string | null;
  trialliancePower: number | string | null;
  recordedAt: string;
}

const toNumber = (value: number | string | null): number | null =>
  value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

/** bigint ids go to Postgres as numbers when they fit, else as strings */
const toDbId = (id: string | number) => {
  const n = Number(id);
  return /^\d+$/.test(String(id)) && Number.isSafeInteger(n) ? n : String(id);
};

/** The event has started: its players' powers are taken from just before the start */
export function hasEventStarted(event: Pick<AllianceEvent, 'startsAt'> | null | undefined, now = Date.now()) {
  const start = event?.startsAt ? Date.parse(event.startsAt) : NaN;
  return Number.isFinite(start) && start <= now;
}

/**
 * Latest recorded powers of the players at `at` (keyed by String(player.id)).
 * Players with nothing recorded before then are missing from the map.
 */
export async function getPowersAt(ids: (string | number)[], at: string): Promise<Map<string, PowerSnapshot>> {
  const unique = [...new Set(ids.map(String))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.rpc('get_player_power_at', {
    player_ids: unique.map(toDbId),
    at_time: at,
  });
  if (error) throw new Error(`Failed to load the power history: ${error.message}`);

  return new Map(
    ((data ?? []) as PowerHistoryRow[]).map((row) => [
      String(row.playerId),
      {
        power: toNumber(row.power),
        swordlandPower: toNumber(row.swordlandPower),
        triAlliancePower: toNumber(row.trialliancePower),
        recordedAt: row.recordedAt,
      },
    ]),
  );
}

/** Same as getPowersAt, but an empty map (current powers are used) when the history can't be read */
export async function getPowersAtOrNone(ids: (string | number)[], at: string) {
  try {
    return await getPowersAt(ids, at);
  } catch (error) {
    console.warn('Using current powers:', error);
    return new Map<string, PowerSnapshot>();
  }
}

/** Players with their recorded powers (unchanged objects for players without a snapshot) */
export function withPowersAt(players: Player[], snapshots: Map<string, PowerSnapshot> | null): Player[] {
  if (!snapshots || snapshots.size === 0) return players;
  return players.map((player) => {
    const snapshot = snapshots.get(String(player.id));
    if (!snapshot) return player;
    return {
      ...player,
      power: snapshot.power ?? player.power,
      swordlandPower: snapshot.swordlandPower ?? player.swordlandPower,
      trialliancePower: snapshot.triAlliancePower ?? player.trialliancePower,
    };
  });
}
