import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { getAccess, hashKingKey, newKingKey } from '@/utils/accessServer';

/**
 * The kingdom's ruler (god only): either a King (a player of the kingdom) or a High King
 * (a player from another kingdom), never both.
 *
 *  PUT  { kingPlayerId } | { highKingPlayerId } | { clear: true }
 *       Sets the ruler. Any change revokes the King key (a High King never has one).
 *  POST Generates a new King key for the current King and returns it once; the old one stops working.
 */

const fail = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

async function authorize(ctx: { params: Promise<{ kingdomId: string }> }) {
  const kingdomId = Number((await ctx.params).kingdomId);
  if (!Number.isInteger(kingdomId) || kingdomId <= 0) return { error: fail(400, 'Invalid kingdom') };
  if (!(await getAccess()).god) return { error: fail(403, 'Only the editor (god mode) can change the King') };
  const db = getSupabaseAdmin();
  if (!db) return { error: fail(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server') };
  return { kingdomId, db };
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ kingdomId: string }> }) {
  const auth = await authorize(ctx);
  if ('error' in auth) return auth.error;
  const { kingdomId, db } = auth;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kingPlayerId = body?.kingPlayerId != null ? Number(body.kingPlayerId) : null;
  const highKingPlayerId = body?.highKingPlayerId != null ? Number(body.highKingPlayerId) : null;
  const clear = body?.clear === true;
  if (!clear && (kingPlayerId === null) === (highKingPlayerId === null)) {
    return fail(400, 'Send either kingPlayerId or highKingPlayerId (or clear)');
  }

  const rulerId = kingPlayerId ?? highKingPlayerId;
  if (rulerId !== null) {
    if (!Number.isInteger(rulerId)) return fail(400, 'Invalid player');
    const { data: player } = await db.from('player').select('id, kingdomId').eq('id', rulerId).maybeSingle();
    if (!player) return fail(404, 'Player not found');
    const fromKingdom = Number(player.kingdomId) === kingdomId;
    if (kingPlayerId !== null && !fromKingdom) return fail(400, `The King must be a player of kingdom ${kingdomId}`);
    if (highKingPlayerId !== null && fromKingdom) {
      return fail(400, `The High King is not from kingdom ${kingdomId}; pick them as King instead`);
    }
  }

  const { data, error } = await db
    .from('kingdom')
    .update({ kingPlayerId, highKingPlayerId })
    .eq('id', kingdomId)
    .select('*')
    .maybeSingle();
  if (error) return fail(500, error.message);
  if (!data) return fail(404, 'Kingdom not found');

  // New ruler: the previous King's key must stop working
  const { error: revokeError } = await db.from('kingdom_king_key').delete().eq('kingdomId', kingdomId);
  if (revokeError) console.error('[kingdoms/king] Revoking the King key failed:', revokeError.message);

  return NextResponse.json({ status: 'success', data });
}

export async function POST(_request: NextRequest, ctx: { params: Promise<{ kingdomId: string }> }) {
  const auth = await authorize(ctx);
  if ('error' in auth) return auth.error;
  const { kingdomId, db } = auth;

  const { data: kingdom } = await db.from('kingdom').select('kingPlayerId').eq('id', kingdomId).maybeSingle();
  if (!kingdom?.kingPlayerId) return fail(400, 'Set a King first (a High King has no King key)');

  const key = newKingKey();
  const { error } = await db
    .from('kingdom_king_key')
    .upsert({ kingdomId, key_hash: hashKingKey(key), created_at: new Date().toISOString() }, { onConflict: 'kingdomId' });
  if (error) return fail(500, error.message);

  return NextResponse.json({ status: 'success', data: { key } });
}
