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

async function apiJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status !== 'success') throw new Error(body?.error || `Request failed (HTTP ${res.status})`);
  return body.data as T;
}

export type KingdomRulerChange = { kingPlayerId: number } | { highKingPlayerId: number } | { clear: true };

/** Set the King or the High King (god only). Revokes the current King key. */
export async function setKingdomRuler(kingdomId: number, change: KingdomRulerChange): Promise<Kingdom> {
  return apiJson(
    await fetch(`/api/kingdoms/${kingdomId}/king`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(change),
    })
  );
}

/** New King key for the current King (god only); the previous key stops working. */
export async function generateKingKey(kingdomId: number): Promise<string> {
  const data = await apiJson<{ key: string }>(await fetch(`/api/kingdoms/${kingdomId}/king`, { method: 'POST' }));
  return data.key;
}
