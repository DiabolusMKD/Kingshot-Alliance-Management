import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { PLAYER_ID_PATTERN, RedeemAttempt, redeemGiftCode } from '@/utils/kingshotGiftCodes';

// One player, several codes: up to MAX_CODES_PER_REQUEST redeem calls
export const maxDuration = 60;

const MAX_CODES_PER_REQUEST = 20;
const DELAY_BETWEEN_CODES_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorResponse(error: string, status: number) {
  return NextResponse.json({ status: 'error', error }, { status });
}

/**
 * Redeem gift codes for one player through Century Games' official API.
 * Body: { playerId: number, giftCodeIds: number[] }  (player.id, not the in-game id)
 * Response data: [{ giftCodeId, outcome: 'redeemed' | 'failed' | 'retry', reason }]
 * Redeemed/failed results are recorded in gift_code_redemption; 'retry' ones are not.
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseAdmin();
  if (!db) return errorResponse('SUPABASE_SERVICE_ROLE_KEY is not configured on the server', 500);

  const body = await request.json().catch(() => null);
  const playerRecordId = Number(body?.playerId);
  const giftCodeIds: number[] = Array.isArray(body?.giftCodeIds) ? body.giftCodeIds.map(Number) : [];

  if (
    !Number.isInteger(playerRecordId) ||
    giftCodeIds.length === 0 ||
    giftCodeIds.length > MAX_CODES_PER_REQUEST ||
    !giftCodeIds.every(Number.isInteger)
  ) {
    return errorResponse(`playerId and 1-${MAX_CODES_PER_REQUEST} giftCodeIds are required`, 400);
  }

  const [{ data: player }, { data: codes, error: codesError }] = await Promise.all([
    db.from('player').select('id, playerId, kingdomId').eq('id', playerRecordId).maybeSingle(),
    db.from('gift_code').select('id, code').in('id', giftCodeIds).eq('status', 'active'),
  ]);
  if (codesError) return errorResponse(codesError.message, 500);
  if (!player) return errorResponse('Player not found', 404);

  const fid = String(player.playerId);
  if (!PLAYER_ID_PATTERN.test(fid)) return errorResponse('Player has an invalid in-game id', 400);

  const activeCodes = (codes ?? []) as { id: number; code: string }[];
  const activeIds = new Set(activeCodes.map((c) => c.id));
  const results: ({ giftCodeId: number } & RedeemAttempt)[] = giftCodeIds
    .filter((id) => !activeIds.has(id))
    .map((giftCodeId) => ({ giftCodeId, outcome: 'failed', reason: 'CODE_INACTIVE' }));

  const kid = player.kingdomId ? String(player.kingdomId) : null;
  if (!kid) {
    results.push(...activeCodes.map((c) => ({ giftCodeId: c.id, outcome: 'failed' as const, reason: 'KINGDOM_REQUIRED' })));
  } else {
    for (const [index, code] of activeCodes.entries()) {
      if (index > 0) await sleep(DELAY_BETWEEN_CODES_MS);

      const attempt = await redeemGiftCode(fid, code.code, kid);
      results.push({ giftCodeId: code.id, ...attempt });

      if (attempt.outcome === 'retry') {
        // Rate limited / server trouble: hand the rest back to the client to retry later
        results.push(
          ...activeCodes.slice(index + 1).map((c) => ({ giftCodeId: c.id, outcome: 'retry' as const, reason: attempt.reason }))
        );
        break;
      }
    }
  }

  const recordError = await recordResults(db, player.id, results);
  if (recordError) console.error('[gift-codes/redemptions] Recording results failed:', recordError);

  return NextResponse.json({ status: 'success', data: results });
}

async function recordResults(
  db: SupabaseClient,
  playerId: number,
  results: ({ giftCodeId: number } & RedeemAttempt)[]
): Promise<string | null> {
  const now = new Date().toISOString();
  const redeemedRows = results
    .filter((r) => r.outcome === 'redeemed')
    .map((r) => ({ giftCodeId: r.giftCodeId, playerId, status: 'redeemed', reason: r.reason, redeemed_at: now, last_attempt_at: now }));
  // No `status` column here, so a previously redeemed row is never downgraded
  const failedRows = results
    .filter((r) => r.outcome === 'failed' && r.reason !== 'CODE_INACTIVE')
    .map((r) => ({ giftCodeId: r.giftCodeId, playerId, reason: r.reason ?? 'UNKNOWN', last_attempt_at: now }));

  for (const rows of [redeemedRows, failedRows]) {
    if (rows.length === 0) continue;
    const { error } = await db.from('gift_code_redemption').upsert(rows, { onConflict: 'giftCodeId,playerId' });
    if (error) return error.message;
  }
  return null;
}
