'use client';

import { JailEntry } from '@/types';
import { JailTrial } from './jailTrials';
import { supabase } from './supabaseClient';

/** The kingdom's offenders (read straight from Supabase; kingdom_jail is publicly readable). */
export async function getJail(kingdomId: number): Promise<JailEntry[]> {
  const { data, error } = await supabase.from('kingdom_jail').select('*').eq('kingdomId', kingdomId);
  if (error) throw new Error(`Failed to fetch the jail: ${error.message}`);
  return data ?? [];
}

/** Put a player in a trial, or release it with `playerId: null` (King of the kingdom or god). */
export async function setJailTrial(kingdomId: number, trial: JailTrial, playerId: number | null): Promise<void> {
  const res = await fetch(`/api/kingdoms/${kingdomId}/jail`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trial, playerId }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status !== 'success') throw new Error(body?.error || `Request failed (HTTP ${res.status})`);
}
