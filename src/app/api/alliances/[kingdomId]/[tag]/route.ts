import { NextRequest, NextResponse } from 'next/server';
import { getMightpulseAlliance, MightpulseError } from '@/utils/mightpulse';

// MightPulse may take up to `wait` (30s) to refresh the alliance from the game
export const maxDuration = 60;

/** Alliance tags are 3 characters, case-sensitive */
const TAG_PATTERN = /^\S{3}$/u;

/** An alliance + its roster from MightPulse (the token stays on the server) */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ kingdomId: string; tag: string }> },
) {
  const { kingdomId, tag } = await ctx.params;
  const kingdom = Number(kingdomId);
  const allianceTag = decodeURIComponent(tag);

  if (!Number.isInteger(kingdom) || kingdom <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_kingdom', message: 'Invalid kingdom' }, { status: 400 });
  }
  if (!TAG_PATTERN.test(allianceTag)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_tag', message: 'The alliance tag must be 3 characters' },
      { status: 400 },
    );
  }

  try {
    const data = await getMightpulseAlliance(kingdom, allianceTag);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof MightpulseError) {
      const message =
        error.code === 'alliance_not_found'
          ? `There is no alliance [${allianceTag}] in Kingdom ${kingdom} yet. Check the tag (it's case-sensitive) or create the alliance in the game first.`
          : error.message;
      return NextResponse.json({ ok: false, error: error.code ?? 'error', message }, { status: error.status });
    }
    console.error('[api/alliances] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: 'error', message: 'Failed to load the alliance' }, { status: 500 });
  }
}
