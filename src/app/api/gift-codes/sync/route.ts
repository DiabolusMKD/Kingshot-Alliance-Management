import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { fetchActiveGiftCodes, fetchGiftCodeRewards, GIFT_CODE_PATTERN } from '@/utils/kingshotGiftCodes';
import type { GiftCodeReward } from '@/types';

/**
 * Pulls the currently active codes from kingshot.net and mirrors them into `gift_code`:
 * listed codes are inserted/kept as active, every other code is marked inactive.
 * Rewards are scraped from the kingshot.net gift codes page on a best-effort basis:
 * when that fails, codes keep whatever reward was stored before.
 * Returns the active codes as stored in the database.
 */
export async function POST() {
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { status: 'error', error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 500 }
    );
  }

  let upstreamCodes;
  let rewards: Map<string, GiftCodeReward | null> | null = null;
  try {
    const [codes, rewardsResult] = await Promise.all([fetchActiveGiftCodes(), fetchGiftCodeRewards().catch((error) => error as Error)]);
    upstreamCodes = codes.filter((c) => GIFT_CODE_PATTERN.test(c.code));
    if (rewardsResult instanceof Error) {
      console.warn('[gift-codes/sync] Could not fetch gift code rewards:', rewardsResult.message);
    } else {
      rewards = rewardsResult;
    }
  } catch (error) {
    console.error('[gift-codes/sync] Failed to fetch kingshot.net gift codes:', error);
    return NextResponse.json(
      { status: 'error', error: 'Could not fetch gift codes from kingshot.net' },
      { status: 502 }
    );
  }

  if (upstreamCodes.length > 0) {
    const rows = upstreamCodes.map((c) => ({ code: c.code, status: 'active', expires_at: c.expiresAt }));
    // Only codes the page listed get their reward (re)written; a missing scrape never clears one
    const withReward = rows.filter((r) => rewards?.has(r.code)).map((r) => ({ ...r, reward: rewards!.get(r.code) ?? null }));
    const withoutReward = rows.filter((r) => !rewards?.has(r.code));

    let error = await upsertCodes(db, withReward);
    if (error && /reward/i.test(error)) {
      // gift_code.reward column not created yet: store the codes without rewards
      console.warn('[gift-codes/sync] Storing rewards failed, run the gift_code.reward migration:', error);
      error = await upsertCodes(db, withReward.map(({ code, status, expires_at }) => ({ code, status, expires_at })));
    }
    error ??= await upsertCodes(db, withoutReward);
    if (error) {
      console.error('[gift-codes/sync] Upsert failed:', error);
      return NextResponse.json({ status: 'error', error }, { status: 500 });
    }
  }

  // Everything kingshot.net no longer lists is inactive (codes are [A-Za-z0-9_-] only, safe in the filter)
  let deactivate = db.from('gift_code').update({ status: 'inactive' }).eq('status', 'active');
  if (upstreamCodes.length > 0) {
    deactivate = deactivate.not('code', 'in', `(${upstreamCodes.map((c) => c.code).join(',')})`);
  }
  const { error: deactivateError } = await deactivate;
  if (deactivateError) {
    console.error('[gift-codes/sync] Deactivation failed:', deactivateError.message);
    return NextResponse.json({ status: 'error', error: deactivateError.message }, { status: 500 });
  }

  const { data, error } = await db
    .from('gift_code')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'success', data });
}

async function upsertCodes(db: SupabaseClient, rows: Record<string, unknown>[]): Promise<string | null> {
  if (rows.length === 0) return null;
  const { error } = await db.from('gift_code').upsert(rows, { onConflict: 'code' });
  return error?.message ?? null;
}
