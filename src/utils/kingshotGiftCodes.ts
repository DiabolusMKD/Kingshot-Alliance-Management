import { createHash } from 'node:crypto';

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
