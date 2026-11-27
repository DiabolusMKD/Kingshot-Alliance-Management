import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { getAccess, hashLeaderKey, newKingKey } from '@/utils/accessServer';

/**
 * Leader link of an alliance (god only).
 *  POST    new Leader key, returned once; the previous one stops working
 *  DELETE  revoke the Leader key
 */

const fail = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

async function authorize(ctx: { params: Promise<{ allianceId: string }> }) {
  const allianceId = Number((await ctx.params).allianceId);
  if (!Number.isInteger(allianceId) || allianceId <= 0) return { error: fail(400, 'Invalid alliance') };
  if (!(await getAccess()).god) return { error: fail(403, 'Only the editor (god mode) can manage Leader links') };
  const db = getSupabaseAdmin();
  if (!db) return { error: fail(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server') };
  return { allianceId, db };
}

export async function POST(_request: NextRequest, ctx: { params: Promise<{ allianceId: string }> }) {
  const auth = await authorize(ctx);
  if ('error' in auth) return auth.error;
  const { allianceId, db } = auth;

  const { data: alliance } = await db.from('alliance').select('id').eq('id', allianceId).maybeSingle();
  if (!alliance) return fail(404, 'Alliance not found');

  const key = newKingKey();
  const { error } = await db
    .from('alliance_leader_key')
    .upsert({ allianceId, key_hash: hashLeaderKey(key), created_at: new Date().toISOString() }, { onConflict: 'allianceId' });
  if (error) return fail(500, error.message);

  return NextResponse.json({ status: 'success', data: { key } });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ allianceId: string }> }) {
  const auth = await authorize(ctx);
  if ('error' in auth) return auth.error;
  const { error } = await auth.db.from('alliance_leader_key').delete().eq('allianceId', auth.allianceId);
  if (error) return fail(500, error.message);
  return NextResponse.json({ status: 'success', data: null });
}
