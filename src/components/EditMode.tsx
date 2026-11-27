'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

/**
 * View-only by default; `?mode=<edit key>` in the URL turns editing on in this browser.
 * `?mode=<King key>` (generated on the Kingdom page) turns on that kingdom's King features;
 * `?mode=<Leader key>` (alliance page) lets an alliance's Leader set its Discord channel.
 *
 * The key is checked by /api/edit-mode (EDIT_MODE_KEY stays on the server), which remembers it
 * in an httpOnly cookie; changing the key in the env turns editing off everywhere.
 *
 * This only hides the editing UI so people with a shared link don't change things by
 * accident. It is NOT security: the database still accepts writes from anyone with the
 * public Supabase key, so real protection needs authentication + RLS write policies.
 */

const ENDPOINT = '/api/edit-mode';

// One shared state for every component (asked from the server once per page load).
// `enabled` = god (EDIT_MODE_KEY); `kingOf` = kingdom whose King key this browser holds;
// `leaderOf` = alliance whose Leader key it holds.
let enabled = false;
let kingOf: number | null = null;
let leaderOf: number | null = null;
let checked = false;
const listeners = new Set<() => void>();

const setAccess = (god: boolean, king: number | null, leader: number | null) => {
  enabled = god;
  kingOf = king;
  leaderOf = leader;
  listeners.forEach((listener) => listener());
};

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

const request = async (init?: RequestInit) => {
  try {
    const response = await fetch(ENDPOINT, { cache: 'no-store', ...init });
    const data = (await response.json()) as { enabled?: boolean; kingOf?: number | null; leaderOf?: number | null };
    setAccess(
      !!data.enabled,
      typeof data.kingOf === 'number' ? data.kingOf : null,
      typeof data.leaderOf === 'number' ? data.leaderOf : null
    );
  } catch {
    setAccess(false, null, null);
  }
};

/** Exit: back to view only */
export const disableEditMode = () => request({ method: 'DELETE' });

/** True when editing is on (always false on the server and until the server answered) */
export function useCanEdit(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => false);
}

/** Kingdom id this browser is the King of (King key), or null */
export function useKingOf(): number | null {
  return useSyncExternalStore(subscribe, () => kingOf, () => null);
}

/**
 * King features of a kingdom (kingdom-wide gift codes, update every player, Jail, Discord):
 * that kingdom's King, or god. A High King has none.
 */
export function useCanRule(kingdomId: number): boolean {
  const god = useCanEdit();
  const king = useKingOf();
  return god || king === kingdomId;
}

/** Alliance id this browser is the Leader of (Leader key), or null */
export function useLeaderOf(): number | null {
  return useSyncExternalStore(subscribe, () => leaderOf, () => null);
}

/** The alliance's Leader, or god: may set the alliance's Discord channel. */
export function useCanLead(allianceId: number | null | undefined): boolean {
  const god = useCanEdit();
  const leader = useLeaderOf();
  return god || (allianceId != null && leader === Number(allianceId));
}

/**
 * Sends `?mode=` to the server on every page and removes it from the address bar, so a link
 * copied from the browser never carries it (sharing a page doesn't share editing).
 */
export function EditModeUrlWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    const url = new URL(window.location.href);
    const key = url.searchParams.get('mode');
    if (key !== null) {
      url.searchParams.delete('mode');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      checked = true;
      request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    } else if (!checked) {
      checked = true;
      request();
    }
  }, [pathname]);

  return null;
}
