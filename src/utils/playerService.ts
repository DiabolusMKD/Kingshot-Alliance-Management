'use client';

import { Alliance, Player } from '@/types';
import { supabase } from './supabaseClient';

/**
 * Get all active players from Supabase
 */
export async function getPlayers(allianceId: number, kingdomId: number): Promise<Player[]> {
  try {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('allianceId', allianceId) // Only fetch players in the specified alliance
      .eq('kingdomId', kingdomId) // Only fetch players from the specified kingdom
      .order('power', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch players: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching players:', error);
    throw error;
  }
}

/**
 * Get a single player by ID from Supabase
 */
export async function getPlayerById(id: string): Promise<Player | null> {
  try {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch player: ${error.message}`);
    }

    return data || null;
  } catch (error) {
    console.error('Error fetching player:', error);
    throw error;
  }
}

/**
 * Look up a player by their in-game player ID, regardless of alliance/kingdom.
 */
export async function getPlayerByPlayerId(playerId: string): Promise<Player | null> {
  try {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('playerId', playerId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch player: ${error.message}`);
    }

    return data || null;
  } catch (error) {
    console.error('Error fetching player by playerId:', error);
    throw error;
  }
}

/**
 * Create a new player in Supabase
 */
export async function createPlayer(
  playerData: Omit<Player, 'id' | 'created_at' | 'updated_at'>
): Promise<Player> {
  try {
    const { data, error } = await supabase
      .from('player')
      .insert([playerData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create player: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from create operation');
    }

    return data;
  } catch (error) {
    console.error('Error creating player:', error);
    throw error;
  }
}

/**
 * Update a player in Supabase
 */
export async function updatePlayer(
  id: string,
  playerData: Omit<Player, 'id' | 'created_at' | 'updated_at'>
): Promise<Player> {
  try {
    const { data, error } = await supabase
      .from('player')
      .update(playerData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update player: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from update operation');
    }

    return data;
  } catch (error) {
    console.error('Error updating player:', error);
    throw error;
  }
}

/**
 * Save new Swordland powers (entered by hand: the game API doesn't expose them).
 * One update per player, a few at a time; returns the ids that failed with their errors.
 */
export async function updateSwordlandPowers(
  changes: { id: string; swordlandPower: number }[]
): Promise<{ id: string; error: string }[]> {
  const failed: { id: string; error: string }[] = [];
  const BATCH_SIZE = 10;
  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    await Promise.all(
      changes.slice(i, i + BATCH_SIZE).map(async ({ id, swordlandPower }) => {
        const { error } = await supabase.from('player').update({ swordlandPower }).eq('id', id);
        if (error) failed.push({ id, error: error.message });
      })
    );
  }
  return failed;
}

/**
 * Remove player from alliance by setting allianceId to NULL
 */
export async function removePlayerFromAlliance(id: string): Promise<Player> {
  try {
    const { data, error } = await supabase
      .from('player')
      .update({ allianceId: null })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to remove player from alliance: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from update operation');
    }

    return data;
  } catch (error) {
    console.error('Error removing player from alliance:', error);
    throw error;
  }
}

/**
 * Deactivate a player (soft delete) in Supabase
 */
export async function deactivatePlayer(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('player')
      .update({ active: false })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to deactivate player: ${error.message}`);
    }
  } catch (error) {
    console.error('Error deactivating player:', error);
    throw error;
  }
}

/**
 * Delete a player permanently from Supabase
 */
export async function deletePlayer(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('player')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete player: ${error.message}`);
    }
  } catch (error) {
    console.error('Error deleting player:', error);
    throw error;
  }
}

export interface AllianceStats {
  power: number;
  count: number;
}

/**
 * Total power and player count per alliance for a whole kingdom, keyed by allianceId.
 * Only fetches the two columns needed, paging past Supabase's 1000-row limit.
 */
export async function getAllianceStats(kingdomId: number): Promise<Map<string, AllianceStats>> {
  const PAGE_SIZE = 1000;
  const stats = new Map<string, AllianceStats>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('player')
      .select('allianceId, power')
      .eq('kingdomId', kingdomId)
      .not('allianceId', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch alliance stats: ${error.message}`);
    }

    for (const row of data ?? []) {
      const key = String(row.allianceId);
      const current = stats.get(key) ?? { power: 0, count: 0 };
      stats.set(key, { power: current.power + (Number(row.power) || 0), count: current.count + 1 });
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  return stats;
}

/**
 * Players in the kingdom that are not in any alliance, strongest first.
 */
export async function getUnassignedPlayers(kingdomId: number): Promise<Player[]> {
  const PAGE_SIZE = 1000;
  const players: Player[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('kingdomId', kingdomId)
      .is('allianceId', null)
      .order('power', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch players without alliance: ${error.message}`);
    }

    players.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return players;
}

/**
 * One page of the kingdom's players across all alliances (and none), strongest first,
 * plus the total count (for "View more").
 */
export async function getKingdomPlayers(
  kingdomId: number,
  offset: number,
  limit: number
): Promise<{ players: Player[]; total: number }> {
  const { data, error, count } = await supabase
    .from('player')
    .select('*', { count: 'exact' })
    .eq('kingdomId', kingdomId)
    .order('power', { ascending: false })
    .order('id')
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch kingdom players: ${error.message}`);
  }

  return { players: data ?? [], total: count ?? data?.length ?? 0 };
}

/**
 * Players by their database ids (e.g. other-alliance players saved in an SSL event).
 */
export async function getPlayersByIds(ids: (string | number)[]): Promise<Player[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('player').select('*').in('id', ids);
  if (error) {
    throw new Error(`Failed to fetch players: ${error.message}`);
  }
  return data ?? [];
}

/**
 * One page of the kingdom's players that are NOT in the given alliance (other alliances
 * and players without one), strongest first, plus the total count (for "Load more").
 */
export async function getKingdomPlayersOutsideAlliance(
  kingdomId: number,
  allianceId: number,
  offset: number,
  limit: number
): Promise<{ players: Player[]; total: number }> {
  const { data, error, count } = await supabase
    .from('player')
    .select('*', { count: 'exact' })
    .eq('kingdomId', kingdomId)
    // neq alone would also drop players without an alliance (NULL), so include them explicitly
    .or(`allianceId.is.null,allianceId.neq.${allianceId}`)
    .order('power', { ascending: false })
    .order('id')
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch kingdom players: ${error.message}`);
  }

  return { players: data ?? [], total: count ?? data?.length ?? 0 };
}

/**
 * Leader of each alliance (alliance.id -> player): the leader from the game
 * (alliance.leaderPlayerId), otherwise the alliance's player with the Leader rank.
 */
export async function getAllianceLeaders(alliances: Alliance[]): Promise<Map<number, Player>> {
  const leaders = new Map<number, Player>();
  if (alliances.length === 0) return leaders;

  const leaderIds = alliances.map((a) => a.leaderPlayerId).filter((id) => id != null).map(String);
  const [byGameId, byRank] = await Promise.all([
    leaderIds.length > 0
      ? supabase.from('player').select('*').in('playerId', leaderIds)
      : Promise.resolve({ data: [] as Player[], error: null }),
    supabase
      .from('player')
      .select('*')
      .eq('allianceRank', 'Leader')
      .in('allianceId', alliances.map((a) => a.id)),
  ]);
  if (byGameId.error) throw new Error(`Failed to fetch leaders: ${byGameId.error.message}`);
  if (byRank.error) throw new Error(`Failed to fetch leaders: ${byRank.error.message}`);

  const gameLeaders = new Map((byGameId.data as Player[]).map((p) => [String(p.playerId), p]));
  const rankLeaders = new Map((byRank.data as Player[]).map((p) => [String(p.allianceId), p]));
  alliances.forEach((a) => {
    const leader =
      (a.leaderPlayerId != null ? gameLeaders.get(String(a.leaderPlayerId)) : undefined) ??
      rankLeaders.get(String(a.id));
    if (leader) leaders.set(a.id, leader);
  });
  return leaders;
}
