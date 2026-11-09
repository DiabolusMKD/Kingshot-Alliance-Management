import { getSetting, setSetting, SETTING_KEYS } from './settingsService';

// kingshot.net no longer exposes a plain REST player-info API. Player data is now
// only available through the Next.js Server Action backing the gift-code redeem
// page, so we call that action directly with the same wire format the browser uses.
//
// The `Next-Action` id is a hash generated at build time by kingshot.net and changes
// whenever they redeploy. It is resolved in this order:
//   1. in-memory cache (refreshed every few minutes)
//   2. `app_settings` row `kingshot_redeem_action_id` in Supabase
//   3. KINGSHOT_REDEEM_ACTION_ID env var
//   4. the hardcoded fallback below
// If the call returns 404 ("Server action not found"), we scrape the current id
// for the `lookupPlayer` action from kingshot.net's JS bundles, retry once, and
// save the new id back to Supabase (needs SUPABASE_SERVICE_ROLE_KEY).

export const KINGSHOT_REDEEM_URL = 'https://kingshot.net/gift-codes/redeem?code=VIP777';

const KINGSHOT_ORIGIN = 'https://kingshot.net';
const LOOKUP_ACTION_NAME = 'lookupPlayer';
const FALLBACK_ACTION_ID =
  process.env.KINGSHOT_REDEEM_ACTION_ID || '401816bdd6ebcfd1700fae80caafc02d3a0f16ba7b';
const CACHE_TTL_MS = 5 * 60 * 1000;

export type ActionIdSource = 'database' | 'env' | 'default' | 'discovered';

let cachedActionId: { id: string; source: ActionIdSource; fetchedAt: number } | null = null;
let discoveryInFlight: Promise<string | null> | null = null;

export async function getKingshotRedeemActionId(): Promise<{ id: string; source: ActionIdSource }> {
  if (cachedActionId && Date.now() - cachedActionId.fetchedAt < CACHE_TTL_MS) {
    return cachedActionId;
  }

  const fromDb = await getSetting<string>(SETTING_KEYS.kingshotRedeemActionId);
  const resolved =
    typeof fromDb === 'string' && fromDb
      ? { id: fromDb, source: 'database' as const }
      : { id: FALLBACK_ACTION_ID, source: process.env.KINGSHOT_REDEEM_ACTION_ID ? ('env' as const) : ('default' as const) };

  cachedActionId = { ...resolved, fetchedAt: Date.now() };
  return resolved;
}

/** Finds the current `lookupPlayer` Server Action id in kingshot.net's client JS bundles. */
async function discoverActionIdFromSite(): Promise<string | null> {
  const pageRes = await fetch(KINGSHOT_REDEEM_URL, { cache: 'no-store' });
  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const chunkPaths = [...new Set(html.match(/\/_next\/static\/chunks\/[^"'\s]+?\.js/g) ?? [])];
  // e.g. createServerReference)("4018...7b",l.callServer,void 0,l.findSourceMapURL,"lookupPlayer")
  const pattern = new RegExp(`"([0-9a-f]{40,})"[^"]{0,200}"${LOOKUP_ACTION_NAME}"`);

  const results = await Promise.all(
    chunkPaths.map(async (path) => {
      try {
        const res = await fetch(`${KINGSHOT_ORIGIN}${path}`);
        if (!res.ok) return null;
        return (await res.text()).match(pattern)?.[1] ?? null;
      } catch {
        return null;
      }
    })
  );
  return results.find((id): id is string => !!id) ?? null;
}

/** Concurrent 404s share a single discovery run. */
async function refreshActionId(): Promise<string | null> {
  discoveryInFlight ??= (async () => {
    try {
      const id = await discoverActionIdFromSite();
      if (id) {
        console.log('[kingshotRedeem] Discovered new action id:', id);
        cachedActionId = { id, source: 'discovered', fetchedAt: Date.now() };
        await setSetting(SETTING_KEYS.kingshotRedeemActionId, id);
      } else {
        console.error('[kingshotRedeem] Could not discover a new action id');
      }
      return id;
    } catch (error) {
      console.error('[kingshotRedeem] Action id discovery failed:', error);
      return null;
    } finally {
      discoveryInFlight = null;
    }
  })();
  return discoveryInFlight;
}

export interface KingshotRedeemAlliance {
  id: string;
  name: string;
  abbr: string;
}

export interface KingshotRedeemPlayerData {
  playerId: string;
  name: string;
  kingdom?: number;
  level?: number;
  levelLabel?: string; // e.g. "TG8"
  profilePhoto?: string;
  power?: string; // numeric string, e.g. "471080998"
  alliance?: KingshotRedeemAlliance | null;
  [key: string]: any;
}

export interface KingshotRedeemResponse {
  status: 'success' | 'fail';
  player?: KingshotRedeemPlayerData | null;
  message?: string;
  errorKey?: string;
}

/**
 * The action's response is streamed in Next.js's RSC "Flight" wire format
 * (one `<rowId>:<json>` line per row) rather than plain JSON. The row we
 * care about is whichever one carries a `status` field.
 */
export function parseKingshotFlightResponse(rawText: string): KingshotRedeemResponse | null {
  for (const line of rawText.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    try {
      const parsed = JSON.parse(line.slice(separatorIndex + 1));
      if (parsed && typeof parsed === 'object' && 'status' in parsed) {
        return parsed as KingshotRedeemResponse;
      }
    } catch {
      // Not every row is JSON (e.g. the reference row) - skip it.
    }
  }
  return null;
}

export interface KingshotRedeemFetchResult {
  httpResponse: Response;
  rawText: string;
  parsed: KingshotRedeemResponse | null;
  actionId: string;
  actionIdSource: ActionIdSource;
}

function postLookup(playerId: string, actionId: string): Promise<Response> {
  return fetch(KINGSHOT_REDEEM_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
      'Next-Action': actionId,
      Origin: KINGSHOT_ORIGIN,
      Referer: KINGSHOT_REDEEM_URL,
      'User-Agent': 'kingshot-alliance-management/1.0',
    },
    body: JSON.stringify([playerId]),
  });
}

export async function fetchKingshotPlayerViaRedeem(playerId: string): Promise<KingshotRedeemFetchResult> {
  let { id: actionId, source: actionIdSource } = await getKingshotRedeemActionId();
  let httpResponse = await postLookup(playerId, actionId);

  // 404 means the action id went stale. Find the new one and retry once.
  if (httpResponse.status === 404) {
    const newId = await refreshActionId();
    if (newId && newId !== actionId) {
      actionId = newId;
      actionIdSource = 'discovered';
      httpResponse = await postLookup(playerId, actionId);
    }
  }

  const rawText = await httpResponse.text();
  const parsed = httpResponse.ok ? parseKingshotFlightResponse(rawText) : null;

  return { httpResponse, rawText, parsed, actionId, actionIdSource };
}
