'use client';

import { Alliance } from '@/types';
import { supabase } from './supabaseClient';

/**
 * Get all alliances for a given kingdom from Supabase
 */
export async function getAlliancesByKingdomId(kingdomId: number): Promise<Alliance[]> {
  try {
    const { data, error } = await supabase
      .from('alliance')
      .select('*')
      .eq('kingdomId', kingdomId)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch alliances: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching alliances:', error);
    throw error;
  }
}

/**
 * Get a single alliance by id from Supabase
 */
export async function getAllianceById(id: number): Promise<Alliance | null> {
  try {
    const { data, error } = await supabase
      .from('alliance')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch alliance: ${error.message}`);
    }

    return data || null;
  } catch (error) {
    console.error('Error fetching alliance:', error);
    throw error;
  }
}

/**
 * Check whether a nameTag is already used by another alliance in the same
 * kingdom. Comparison is case-sensitive, so "RUR" and "rUR" are distinct.
 */
async function isNameTagTaken(kingdomId: number, nameTag: string, excludeId?: number): Promise<boolean> {
  let query = supabase
    .from('alliance')
    .select('id')
    .eq('kingdomId', kingdomId)
    .eq('nameTag', nameTag);

  if (excludeId !== undefined) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to validate alliance tag: ${error.message}`);
  }

  return (data || []).length > 0;
}

/**
 * Create a new alliance in Supabase. `id` is autoincremented by the database.
 */
export async function createAlliance(
  allianceData: Omit<Alliance, 'id' | 'created_at'>
): Promise<Alliance> {
  try {
    if (await isNameTagTaken(allianceData.kingdomId, allianceData.nameTag)) {
      throw new Error(`Alliance tag "${allianceData.nameTag}" is already in use in this kingdom`);
    }

    const { data, error } = await supabase
      .from('alliance')
      .insert([allianceData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create alliance: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from create operation');
    }

    return data;
  } catch (error) {
    console.error('Error creating alliance:', error);
    throw error;
  }
}

/**
 * Update an existing alliance in Supabase.
 */
export async function updateAlliance(
  id: number,
  allianceData: Omit<Alliance, 'id' | 'created_at'>
): Promise<Alliance> {
  try {
    if (await isNameTagTaken(allianceData.kingdomId, allianceData.nameTag, id)) {
      throw new Error(`Alliance tag "${allianceData.nameTag}" is already in use in this kingdom`);
    }

    const { data, error } = await supabase
      .from('alliance')
      .update(allianceData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update alliance: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from update operation');
    }

    return data;
  } catch (error) {
    console.error('Error updating alliance:', error);
    throw error;
  }
}
