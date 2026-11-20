'use client';

import { supabase } from './supabaseClient';
import { getAlliancesByKingdomId } from './allianceService';
import { AllianceCooldownError, fetchGameAlliance, importGameAlliance } from './allianceImport';
import { getNextGameSync } from './gameSync';
import { DEFAULT_REGISTERED_COMBATANTS, DEFAULT_REGISTERED_SUBSTITUTES } from './constants';
import { Alliance, EventOpponent, LegionResultKey, Player } from '@/types';

/** The event_opponent table doesn't exist yet (the migration wasn't run) */
export const isMissingOpponentTable = (error: unknown) =>
  /event_opponent/.test(error instanceof Error ? error.message : String((error as { message?: string })?.message ?? ''));

export async function getEventOpponents(eventId: number): Promise<EventOpponent[]> {
  const { data, error } = await supabase
    .from('event_opponent')
    .select('*')
    .eq('alliance_event_id', eventId)
    .order('id', { ascending: true });
  if (error) throw new Error(`Failed to load the opponents (event_opponent): ${error.message}`);
  return (data ?? []) as EventOpponent[];
}

export async function addEventOpponent(
  opponent: Omit<EventOpponent, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<EventOpponent> {
  const { data, error } = await supabase.from('event_opponent').insert([opponent]).select().single();
  if (error) throw new Error(`Failed to add the opponent (event_opponent): ${error.message}`);
  return data as EventOpponent;
}

export async function updateOpponentRegistration(
  id: number,
  changes: Partial<Pick<EventOpponent, 'registeredCombatants' | 'registeredSubstitutes'>>,
): Promise<void> {
  const { error } = await supabase
    .from('event_opponent')
    .update({ ...changes, updatedAt: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update the opponent: ${error.message}`);
}

export async function removeEventOpponent(id: number): Promise<void> {
  const { error } = await supabase.from('event_opponent').delete().eq('id', id);
  if (error) throw new Error(`Failed to remove the opponent: ${error.message}`);
}

export async function getAlliancesByIds(ids: number[]): Promise<Alliance[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('alliance').select('*').in('id', ids);
  if (error) throw new Error(`Failed to load the opponents' alliances: ${error.message}`);
  return (data ?? []) as Alliance[];
}

/** Every player currently in the alliance (any kingdom) */
export async function getAlliancePlayers(allianceId: number): Promise<Player[]> {
  const { data, error } = await supabase
    .from('player')
    .select('*')
    .eq('allianceId', allianceId)
    .order('power', { ascending: false });
  if (error) throw new Error(`Failed to load the opponent's players: ${error.message}`);
  return (data ?? []) as Player[];
}

export type OpponentLookupProgress = { kind: 'fetching' } | { kind: 'saving'; done: number; total: number };

/**
 * The opponent's alliance in the app, looked up in the game (Alliance lookup): the alliance
 * and its players are added / updated. An alliance pulled within the MightPulse cooldown is
 * used as it is (no pull). Throws AllianceNotFoundError when the game has no such alliance.
 */
export async function lookupOpponentAlliance(
  kingdomId: number,
  tag: string,
  onProgress?: (progress: OpponentLookupProgress) => void,
): Promise<Alliance> {
  // Tags are case-sensitive
  const existing = (await getAlliancesByKingdomId(kingdomId)).find((a) => a.nameTag === tag);
  if (existing && getNextGameSync(existing.gameSyncedAt)) return existing;

  onProgress?.({ kind: 'fetching' });
  let game;
  try {
    game = await fetchGameAlliance(kingdomId, tag);
  } catch (error) {
    // Pulled by someone else in the meantime: the saved alliance is fresh enough
    if (error instanceof AllianceCooldownError && existing) return existing;
    throw error;
  }

  onProgress?.({ kind: 'saving', done: 0, total: game.members.length });
  const result = await importGameAlliance(kingdomId, game, (done, total) =>
    onProgress?.({ kind: 'saving', done, total }),
  );
  if (result.failed.length > 0) {
    console.warn(`[opponents] ${result.failed.length} player(s) of [${tag}] couldn't be saved`, result.failed);
  }
  return result.alliance;
}

/**
 * Saves the opponents entered while creating an event (draft ones, see EventOpponents).
 * Returns how many couldn't be saved.
 */
export async function saveDraftOpponents(eventId: number, drafts: EventOpponent[]): Promise<number> {
  const results = await Promise.allSettled(
    drafts.map((draft) =>
      addEventOpponent({
        alliance_event_id: eventId,
        legion: draft.legion,
        kingdomId: draft.kingdomId,
        allianceTag: draft.allianceTag,
        allianceId: draft.allianceId,
        registeredCombatants: draft.registeredCombatants,
        registeredSubstitutes: draft.registeredSubstitutes,
      }),
    ),
  );
  results.forEach((r) => r.status === 'rejected' && console.error('Failed to save an opponent:', r.reason));
  return results.filter((r) => r.status === 'rejected').length;
}

export const newOpponent = (
  eventId: number,
  legion: LegionResultKey,
  alliance: Alliance,
  tag: string,
  registeredCombatants = DEFAULT_REGISTERED_COMBATANTS,
  registeredSubstitutes = DEFAULT_REGISTERED_SUBSTITUTES,
): Omit<EventOpponent, 'id' | 'createdAt' | 'updatedAt'> => ({
  alliance_event_id: eventId,
  legion,
  kingdomId: alliance.kingdomId,
  allianceTag: tag,
  allianceId: alliance.id,
  registeredCombatants,
  registeredSubstitutes,
});

/** An opponent with its alliance's label, for event cards and player histories */
export interface OpponentSummary {
  legion: LegionResultKey;
  kingdomId: number;
  allianceTag: string;
  alliance: Pick<Alliance, 'id' | 'name' | 'nameTag' | 'kingdomId'> | null;
}

/** "[fKn]Name" (or the tag as entered once the alliance is gone) */
export const formatOpponentLabel = (o: OpponentSummary) =>
  o.alliance ? `[${o.alliance.nameTag}]${o.alliance.name}` : `[${o.allianceTag}]`;

/**
 * Opponents of many events (event id -> opponents, oldest first). Empty when they can't be
 * read (e.g. before the event_opponent migration), so callers never fail because of them.
 */
export async function getOpponentsByEvent(eventIds: number[]): Promise<Map<number, OpponentSummary[]>> {
  const byEvent = new Map<number, OpponentSummary[]>();
  const ids = [...new Set(eventIds.filter((id) => id != null))];
  if (ids.length === 0) return byEvent;

  const { data, error } = await supabase
    .from('event_opponent')
    .select('id, alliance_event_id, legion, kingdomId, allianceTag, alliance(id, name, nameTag, kingdomId)')
    .in('alliance_event_id', ids)
    .order('id', { ascending: true });
  if (error) {
    console.warn('Opponents not available:', error.message);
    return byEvent;
  }

  type Row = Omit<OpponentSummary, 'alliance'> & {
    alliance_event_id: number;
    alliance: OpponentSummary['alliance'] | OpponentSummary['alliance'][];
  };
  ((data ?? []) as unknown as Row[]).forEach((row) => {
    const alliance = Array.isArray(row.alliance) ? row.alliance[0] ?? null : row.alliance;
    const list = byEvent.get(row.alliance_event_id) ?? [];
    list.push({ legion: row.legion, kingdomId: row.kingdomId, allianceTag: row.allianceTag, alliance });
    byEvent.set(row.alliance_event_id, list);
  });
  return byEvent;
}
