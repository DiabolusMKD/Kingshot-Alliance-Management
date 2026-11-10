import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { fetchActiveGiftCodes, GIFT_CODE_PATTERN } from '@/utils/kingshotGiftCodes';

/**
 * Pulls the currently active codes from kingshot.net and mirrors them into `gift_code`:
 * listed codes are inserted/kept as active, every other code is marked inactive.
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
  try {
    upstreamCodes = (await fetchActiveGiftCodes()).filter((c) => GIFT_CODE_PATTERN.test(c.code));
  } catch (error) {
    console.error('[gift-codes/sync] Failed to fetch kingshot.net gift codes:', error);
    return NextResponse.json(
      { status: 'error', error: 'Could not fetch gift codes from kingshot.net' },
      { status: 502 }
    );
  }

  if (upstreamCodes.length > 0) {
    const { error } = await db.from('gift_code').upsert(
      upstreamCodes.map((c) => ({ code: c.code, status: 'active', expires_at: c.expiresAt })),
      { onConflict: 'code' }
    );
    if (error) {
      console.error('[gift-codes/sync] Upsert failed:', error.message);
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
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
