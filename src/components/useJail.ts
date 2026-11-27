'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { JailEntry } from '@/types';
import { getJail } from '@/utils/jailService';
import { JailTrial } from '@/utils/jailTrials';

// One shared copy of each kingdom's jail for every component on the page (badges in tables,
// cards...), fetched once per kingdom and refreshed with `invalidateJail` after changes.

const jails = new Map<number, Map<string, JailTrial>>(); // kingdomId -> player.id -> trial
const loading = new Set<number>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version++;
  listeners.forEach((listener) => listener());
};

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

const store = (kingdomId: number, entries: JailEntry[]) => {
  jails.set(kingdomId, new Map(entries.map((e) => [String(e.playerId), e.trial])));
  notify();
};

async function load(kingdomId: number) {
  if (loading.has(kingdomId)) return;
  loading.add(kingdomId);
  try {
    store(kingdomId, await getJail(kingdomId));
  } catch (error) {
    console.error(`Failed to load the jail of kingdom ${kingdomId}:`, error);
  } finally {
    loading.delete(kingdomId);
  }
}

/** Refetch a kingdom's jail (after jailing / releasing someone), updating every badge. */
export async function invalidateJail(kingdomId: number) {
  jails.delete(kingdomId);
  await load(kingdomId);
}

/** Replace a kingdom's jail with entries already loaded (e.g. by the Jail page). */
export const setJailCache = store;

/** The trial a player is serving in their kingdom's jail, or null. */
export function useJailTrial(player: { id: string | number; kingdomId?: number | null } | null | undefined): JailTrial | null {
  const kingdomId = player?.kingdomId ?? null;
  useSyncExternalStore(subscribe, () => version, () => 0);

  useEffect(() => {
    if (kingdomId !== null && !jails.has(kingdomId)) load(kingdomId);
  }, [kingdomId]);

  if (!player || kingdomId === null) return null;
  return jails.get(kingdomId)?.get(String(player.id)) ?? null;
}
