import { NextRequest, NextResponse } from 'next/server';
import { getMightpulseAlliance, MightpulseError } from '@/utils/mightpulse';
import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { GAME_SYNC_COOLDOWN_MINUTES, formatTimeUntil, getNextGameSync } from '@/utils/gameSync';

// MightPulse may take up to `wait` (30s) to refresh the alliance from the game
export const maxDuration = 60;

/** Alliance tags are 3 characters, case-sensitive */
const TAG_PATTERN = /^\S{3}$/u;

const error = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error: code, message, ...extra }, { status });

/**
 * An alliance + its roster from MightPulse (the token stays on the server).
 * MightPulse usage is limited: an alliance already in the app can be pulled once per
 * cooldown. The pull is claimed atomically before calling MightPulse (so parallel clicks
 * can't both go through) and released again when MightPulse fails.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ kingdomId: string; tag: string }> },
) {
  const { kingdomId, tag } = await ctx.params;
  const kingdom = Number(kingdomId);
  const allianceTag = decodeURIComponent(tag);

  if (!Number.isInteger(kingdom) || kingdom <= 0) return error(400, 'invalid_kingdom', 'Invalid kingdom');
  if (!TAG_PATTERN.test(allianceTag)) return error(400, 'invalid_tag', 'The alliance tag must be 3 characters');

  // 1. Cooldown (alliances already in the app; tags are case-sensitive)
  const db = getSupabaseAdmin();
  let claimed: { id: number; previous: string | null } | null = null;
  if (db) {
    const { data: existing, error: readError } = await db
      .from('alliance')
      .select('id, "gameSyncedAt"')
      .eq('kingdomId', kingdom)
      .eq('nameTag', allianceTag)
      .maybeSingle();
    if (readError) console.warn('[api/alliances] Cooldown check skipped:', readError.message);

    if (existing) {
      const previous = (existing.gameSyncedAt as string | null) ?? null;
      const next = getNextGameSync(previous);
      if (next) {
        return error(
          429,
          'cooldown',
          `[${allianceTag}] was updated from the game less than ${GAME_SYNC_COOLDOWN_MINUTES} min ago. Try again ${formatTimeUntil(next)}.`,
          { retryAt: next.toISOString() },
        );
      }

      // Claim the pull only if nobody else did since we read it
      const now = new Date().toISOString();
      let claim = db.from('alliance').update({ gameSyncedAt: now }).eq('id', existing.id);
      claim = previous ? claim.eq('gameSyncedAt', previous) : claim.is('gameSyncedAt', null);
      const { data: claimedRows, error: claimError } = await claim.select('id');
      if (claimError) {
        console.warn('[api/alliances] Cooldown claim skipped:', claimError.message);
      } else if (!claimedRows?.length) {
        return error(429, 'cooldown', `[${allianceTag}] is already being updated. Try again in a minute.`);
      } else {
        claimed = { id: existing.id, previous };
      }
    }
  } else {
    console.warn('[api/alliances] SUPABASE_SERVICE_ROLE_KEY missing: MightPulse cooldown not enforced');
  }

  // 2. MightPulse
  try {
    const data = await getMightpulseAlliance(kingdom, allianceTag);
    return NextResponse.json(data);
  } catch (err) {
    // Nothing was pulled: release the claim so the alliance can be retried right away
    if (claimed && db) {
      await db.from('alliance').update({ gameSyncedAt: claimed.previous }).eq('id', claimed.id);
    }
    if (err instanceof MightpulseError) {
      const message =
        err.code === 'alliance_not_found'
          ? `There is no alliance [${allianceTag}] in Kingdom ${kingdom} yet. Check the tag (it's case-sensitive) or create the alliance in the game first.`
          : err.message;
      return error(err.status, err.code ?? 'error', message);
    }
    console.error('[api/alliances] Unexpected error:', err);
    return error(500, 'error', 'Failed to load the alliance');
  }
}
