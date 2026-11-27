import { createHash } from 'node:crypto';
import type { GiftCodeReward, ItemQuantity } from '@/types';

// Server-only helpers for gift codes.
//
// 1. Active codes come from kingshot.net's public list:
//      GET https://kingshot.net/api/gift-codes
// 2. Redemption goes to Century Games' official redeem API (the backend of
//    https://ks-giftcode.centurygame.com). There is no login step for Kingshot;
//    the player is identified by fid + kid (kingdom id):
//      POST /api/gift_code  fid, cdk, kid, time  -> redeem one code
//    The request is form-encoded and carries
//      sign = md5(<params sorted by key as k=v&k=v> + SIGN_SALT)
//    with `time` in seconds.

const KINGSHOT_ORIGIN = 'https://kingshot.net';
const CENTURY_API = 'https://kingshot-giftcode.centurygame.com/api';
const CENTURY_ORIGIN = 'https://ks-giftcode.centurygame.com';
const SIGN_SALT = process.env.KINGSHOT_GIFTCODE_SIGN_SALT || 'mN4!pQs6JrYwV9';

export const PLAYER_ID_PATTERN = /^[1-9]\d{4,19}$/;
export const GIFT_CODE_PATTERN = /^[A-Za-z0-9_-]{3,50}$/;

// ---------------------------------------------------------------------------
// Active codes (kingshot.net)
// ---------------------------------------------------------------------------

export interface KingshotActiveGiftCode {
  id: number;
  code: string;
  expiresAt: string | null;
  createdAt: string;
}

export async function fetchActiveGiftCodes(): Promise<KingshotActiveGiftCode[]> {
  const res = await fetch(`${KINGSHOT_ORIGIN}/api/gift-codes`, {
    cache: 'no-store',
    headers: { 'User-Agent': 'kingshot-alliance-management/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as {
    status?: string;
    data?: { giftCodes?: KingshotActiveGiftCode[] };
  } | null;

  if (!res.ok || body?.status !== 'success' || !Array.isArray(body.data?.giftCodes)) {
    throw new Error(`Unexpected kingshot.net gift codes response (HTTP ${res.status})`);
  }

  const now = Date.now();
  return body.data.giftCodes.filter(
    (c) => typeof c.code === 'string' && (!c.expiresAt || new Date(c.expiresAt).getTime() > now)
  );
}

// ---------------------------------------------------------------------------
// Rewards (kingshot.net/gift-codes page)
// ---------------------------------------------------------------------------
//
// The JSON API above has no rewards, but the public gift codes page embeds them in
// its React Server Components payload, e.g.
//   {"code":"GOBBLE","reward":{"kind":"items","items":[{"item":"wood","amount":1000,"count":100}, ...]}, ...}
// `item` is an icon slug (see utils/items), `amount` the size of one item
// (1000 wood, 5 min speedup), `count` how many of them.

const SLUG_PATTERN = /^[a-z0-9-]{1,60}$/;

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Validate an untrusted reward object; null when it has nothing usable. */
function parseReward(raw: unknown): GiftCodeReward | null {
  if (!raw || typeof raw !== 'object') return null;
  const reward = raw as { kind?: unknown; items?: unknown; text?: unknown };

  if (reward.kind === 'items' && Array.isArray(reward.items)) {
    const items: ItemQuantity[] = [];
    for (const entry of reward.items as { item?: unknown; count?: unknown; amount?: unknown }[]) {
      if (typeof entry?.item !== 'string' || !SLUG_PATTERN.test(entry.item)) continue;
      items.push({
        item: entry.item,
        count: isPositiveNumber(entry.count) ? entry.count : 1,
        ...(isPositiveNumber(entry.amount) ? { amount: entry.amount } : {}),
      });
    }
    return items.length > 0 ? { kind: 'items', items } : null;
  }
  if (reward.kind === 'text' && typeof reward.text === 'string' && reward.text.trim()) {
    return { kind: 'text', text: reward.text.trim().slice(0, 200) };
  }
  return null;
}

/** The balanced {...} object starting at `start` (string-aware), or null. */
function sliceObject(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

/**
 * Rewards per code, scraped from kingshot.net/gift-codes. Codes the page lists without
 * rewards map to null. Throws when the page can't be fetched or has no reward data
 * (e.g. its markup changed), so callers can keep what they already stored.
 */
export async function fetchGiftCodeRewards(): Promise<Map<string, GiftCodeReward | null>> {
  const res = await fetch(`${KINGSHOT_ORIGIN}/gift-codes`, {
    cache: 'no-store',
    headers: { 'User-Agent': 'kingshot-alliance-management/1.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`kingshot.net gift codes page returned HTTP ${res.status}`);

  // The payload is JSON inside JS string literals: drop one level of quote escaping
  const html = (await res.text()).replace(/\\"/g, '"');
  const rewards = new Map<string, GiftCodeReward | null>();
  const marker = /\{"code":"([A-Za-z0-9_-]{3,50})","reward":\{/g;

  for (let match; (match = marker.exec(html)); ) {
    const code = match[1];
    if (rewards.get(code)) continue; // already have a non-empty reward for it
    const json = sliceObject(html, match.index + match[0].length - 1);
    if (!json) continue;
    try {
      rewards.set(code, parseReward(JSON.parse(json)));
    } catch {
      // Not plain JSON (e.g. still escaped): skip this occurrence
    }
  }

  if (rewards.size === 0) throw new Error('No reward data found on the kingshot.net gift codes page');
  return rewards;
}

// ---------------------------------------------------------------------------
// Redemption (Century Games)
// ---------------------------------------------------------------------------

/** redeemed = success or already redeemed; retry = rate limited / try later; failed = final for this attempt */
export type RedeemOutcome = 'redeemed' | 'failed' | 'retry';

export interface RedeemAttempt {
  outcome: RedeemOutcome;
  reason: string | null; // normalized upstream message, e.g. RECEIVED, TIME_ERROR, CDK_NOT_FOUND
}

interface CenturyResponse {
  code?: number;
  msg?: string;
  err_code?: number | string;
  data?: unknown;
}

const ALREADY_REDEEMED_ERR_CODES = new Set([40008, 40011]); // RECEIVED. / SAME TYPE EXCHANGE.
const RETRY_REASONS = new Set(['TIMEOUT_RETRY', 'RATE_LIMITED']);

export function signParams(params: Record<string, string>): string {
  const query = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('md5').update(query + SIGN_SALT).digest('hex');
}

/** "TIME ERROR." -> "TIME_ERROR" */
function normalizeMessage(msg: string | undefined): string {
  return (msg ?? '').trim().replace(/\.+$/, '').replace(/\s+/g, '_').toUpperCase() || 'UNKNOWN';
}

async function centuryPost(path: string, params: Record<string, string>): Promise<{ httpStatus: number; body: CenturyResponse | null }> {
  const form = new URLSearchParams({ sign: signParams(params), ...params });
  try {
    const res = await fetch(`${CENTURY_API}/${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
        Origin: CENTURY_ORIGIN,
        Referer: `${CENTURY_ORIGIN}/`,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as CenturyResponse | null;
    return { httpStatus: res.status, body };
  } catch (error) {
    console.error(`[centurygame] ${path} request failed:`, error);
    return { httpStatus: 0, body: null };
  }
}

function toAttempt(httpStatus: number, body: CenturyResponse | null): RedeemAttempt {
  if (httpStatus === 429) return { outcome: 'retry', reason: 'RATE_LIMITED' };
  if (httpStatus === 0) return { outcome: 'retry', reason: 'SERVICE_UNAVAILABLE' };
  // Not a Century Games result body (e.g. an nginx/framework error page or JSON error)
  if (!body || typeof body.msg !== 'string') {
    return { outcome: httpStatus >= 500 ? 'retry' : 'failed', reason: `HTTP_${httpStatus}` };
  }

  const reason = normalizeMessage(body.msg);
  const errCode = Number(body.err_code);

  if (body.code === 0) return { outcome: 'redeemed', reason: null };
  if (ALREADY_REDEEMED_ERR_CODES.has(errCode) || reason === 'RECEIVED' || reason === 'SAME_TYPE_EXCHANGE') {
    return { outcome: 'redeemed', reason };
  }
  if (RETRY_REASONS.has(reason)) return { outcome: 'retry', reason };
  return { outcome: 'failed', reason };
}

const nowSeconds = () => String(Math.floor(Date.now() / 1000));

export async function redeemGiftCode(fid: string, cdk: string, kid: string): Promise<RedeemAttempt> {
  const { httpStatus, body } = await centuryPost('gift_code', { fid, cdk, kid, time: nowSeconds() });
  const attempt = toAttempt(httpStatus, body);
  if (attempt.outcome !== 'redeemed' || attempt.reason) {
    console.log(`[centurygame] gift_code fid=${fid} cdk=${cdk} -> HTTP ${httpStatus}`, body);
  }
  return attempt;
}
