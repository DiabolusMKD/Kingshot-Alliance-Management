'use client';

import { Player } from '@/types';
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
