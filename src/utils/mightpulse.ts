/**
 * MightPulse API (https://api.mightpulse.com): alliance info + rosters straight from the game.
 * Server-only: the bearer token (MIGHTPULSE_API_TOKEN) must never reach the browser.
 * Only import this from route handlers / server code, e.g. /api/alliances/[kingdomId]/[tag].
 */

const DEFAULT_BASE_URL = 'https://api.mightpulse.com/v1';

export interface MightpulseAllianceInfo {
  aid: number;
  name: string;
  /** Tag, case-sensitive (fKn, FKN and Fkn are different alliances) */
  abbr: string;
  kid: number;
  power: number;
  count: number;
  leader_name?: string;
  leader_uid?: number;
  leader_governor_id?: number;
  flag_url?: string;
  power_rank?: number;
  permalink?: string;
}

export interface MightpulseMember {
  uid: number;
  /** In-game player id (player.playerId) */
  governor_id: number;
  fid: number;
  nick_name: string;
  power: number;
  town_center_level: number;
  kills?: number;
  alliance_rank?: number;
  alliance_rank_label?: string;
  kid: number;
  avatar_url?: string | null;
  last_active_at?: number | null;
  online?: boolean;
}

export interface MightpulseAllianceResponse {
  ok: true;
  aid: number;
  kid: number;
  tag: string;
  fresh?: boolean;
  cached_at?: number;
  age_seconds?: number;
  alliance: MightpulseAllianceInfo;
  members: MightpulseMember[];
}

/** An error from MightPulse with the HTTP status and its error code (e.g. "alliance_not_found") */
export class MightpulseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'MightpulseError';
  }
}

function getConfig() {
  const token = process.env.MIGHTPULSE_API_TOKEN;
  if (!token) throw new MightpulseError('MIGHTPULSE_API_TOKEN is not configured', 500, 'not_configured');
  const baseUrl = (process.env.MIGHTPULSE_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { token, baseUrl };
}

/** GET a MightPulse path (e.g. "/alliances/1010/fKn") and return its JSON */
export async function mightpulseGet<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
  const { token, baseUrl } = getConfig();
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (error) {
    throw new MightpulseError(
      `Couldn't reach MightPulse: ${error instanceof Error ? error.message : 'network error'}`,
      503,
      'unreachable',
    );
  }

  let body: { ok?: boolean; error?: string } & Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    throw new MightpulseError(`MightPulse returned an unexpected response (HTTP ${response.status})`, 502, 'bad_response');
  }

  if (!response.ok || body.ok === false) {
    throw new MightpulseError(body.error ?? `HTTP ${response.status}`, response.status || 502, body.error);
  }
  return body as T;
}

/**
 * An alliance and its members. `tag` is case-sensitive.
 * `wait` lets MightPulse refresh the data from the game for up to that many seconds.
 */
export function getMightpulseAlliance(kingdomId: number, tag: string, wait = 30) {
  return mightpulseGet<MightpulseAllianceResponse>(
    `/alliances/${encodeURIComponent(String(kingdomId))}/${encodeURIComponent(tag)}`,
    { wait },
  );
}
