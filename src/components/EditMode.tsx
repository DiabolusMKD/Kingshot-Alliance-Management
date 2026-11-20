'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

/**
 * View-only by default; `?mode=<edit key>` in the URL turns editing on in this browser.
 *
 * The key is checked by /api/edit-mode (EDIT_MODE_KEY stays on the server), which remembers it
 * in an httpOnly cookie; changing the key in the env turns editing off everywhere.
 *
 * This only hides the editing UI so people with a shared link don't change things by
 * accident. It is NOT security: the database still accepts writes from anyone with the
 * public Supabase key, so real protection needs authentication + RLS write policies.
 */

const ENDPOINT = '/api/edit-mode';

// One shared state for every component (asked from the server once per page load)
let enabled = false;
let checked = false;
const listeners = new Set<() => void>();

const setEnabled = (value: boolean) => {
  enabled = value;
  listeners.forEach((listener) => listener());
};

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

const request = async (init?: RequestInit) => {
  try {
    const response = await fetch(ENDPOINT, { cache: 'no-store', ...init });
    const data = (await response.json()) as { enabled?: boolean };
    setEnabled(!!data.enabled);
  } catch {
    setEnabled(false);
  }
};

/** Exit: back to view only */
export const disableEditMode = () => request({ method: 'DELETE' });

/** True when editing is on (always false on the server and until the server answered) */
export function useCanEdit(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => false);
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
