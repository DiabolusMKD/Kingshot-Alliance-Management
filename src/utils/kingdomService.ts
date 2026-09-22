'use client';

import { Kingdom } from '@/types';
import { supabase } from './supabaseClient';

/**
 * Get the total number of kingdoms in Supabase, without fetching the rows.
 * Kingdom ids are sequential autoincremented values starting at 1, so the
 * count alone is enough to know which kingdom ids exist.
 */
export async function getKingdomCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('kingdom')
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw new Error(`Failed to fetch kingdom count: ${error.message}`);
    }

    return count || 0;
  } catch (error) {
    console.error('Error fetching kingdom count:', error);
    throw error;
  }
}

/**
 * Get a single kingdom by id from Supabase
 */
export async function getKingdomById(id: number): Promise<Kingdom | null> {
  try {
    const { data, error } = await supabase
      .from('kingdom')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch kingdom: ${error.message}`);
    }

    return data || null;
  } catch (error) {
    console.error('Error fetching kingdom:', error);
    throw error;
  }
}
