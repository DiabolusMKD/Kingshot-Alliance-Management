import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { canRule, getAccess } from '@/utils/accessServer';
import { isJailTrial } from '@/utils/jailTrials';

/**
 * Jail (King of this kingdom or god): one offender per trial, at most six.
 *  PUT { trial, playerId }        puts the player in that trial (moving them from another one)
 *  PUT { trial, playerId: null }  releases whoever is in that trial
 * Reads go straight to Supabase (kingdom_jail is publicly readable).
 */

const fail = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function PUT(request: NextRequest, ctx: { params: Promise<{ kingdomId: string }> }) {
  const kingdomId = Number((await ctx.params).kingdomId);
  if (!Number.isInteger(kingdomId) || kingdomId <= 0) return fail(400, 'Invalid kingdom');
  if (!canRule(await getAccess(), kingdomId)) return fail(403, `Only the King of kingdom ${kingdomId} can change the Jail`);

  const db = getSupabaseAdmin();
  if (!db) return fail(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server');

  const body = (await request.json().catch(() => null)) as { trial?: unknown; playerId?: unknown } | null;
  if (!isJailTrial(body?.trial)) return fail(400, 'Unknown trial');
  const trial = body.trial;

  // Whoever is in this trial leaves it either way
  const { error: releaseError } = await db.from('kingdom_jail').delete().eq('kingdomId', kingdomId).eq('trial', trial);
  if (releaseError) return fail(500, releaseError.message);
  if (body.playerId == null) return NextResponse.json({ status: 'success', data: null });

  const playerId = Number(body.playerId);
  if (!Number.isInteger(playerId)) return fail(400, 'Invalid player');
  const { data: player } = await db.from('player').select('id, kingdomId').eq('id', playerId).maybeSingle();
  if (!player) return fail(404, 'Player not found');
  if (Number(player.kingdomId) !== kingdomId) return fail(400, `Only players of kingdom ${kingdomId} can be jailed`);

  // A player serves one trial at a time: moving them frees their previous trial
  const { error: moveError } = await db.from('kingdom_jail').delete().eq('kingdomId', kingdomId).eq('playerId', playerId);
  if (moveError) return fail(500, moveError.message);

  const { data, error } = await db
    .from('kingdom_jail')
    .insert({ kingdomId, playerId, trial })
    .select('*')
    .single();
  if (error) return fail(500, error.message);

  return NextResponse.json({ status: 'success', data });
}
