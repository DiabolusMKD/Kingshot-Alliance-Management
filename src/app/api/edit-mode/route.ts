import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  cookieOptions,
  findAllianceForLeaderKey,
  findKingdomForKingKey,
  getAccess,
  GOD_COOKIE,
  hashGodKey,
  hashKingKey,
  hashLeaderKey,
  isGodKey,
  KING_COOKIE,
  LEADER_COOKIE,
} from '@/utils/accessServer';

/**
 * Edit mode (see components/EditMode and utils/accessServer): keys stay on the server.
 * `?mode=<key>` is the global EDIT_MODE_KEY (god), a kingdom's King key or an alliance's
 * Leader key. A recognized key turns on its role and keeps the others (one person can be
 * King and Leader); an unknown key turns everything off.
 *
 * Not security for regular editing: it only decides whether the editing UI is shown.
 */

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** { enabled, kingOf, leaderOf }: god editing is on / King of a kingdom / Leader of an alliance */
export async function GET() {
  const access = await getAccess();
  return NextResponse.json({ enabled: access.god, kingOf: access.kingOf, leaderOf: access.leaderOf }, noStore);
}

export async function POST(request: NextRequest) {
  if (!process.env.EDIT_MODE_KEY) {
    console.warn('[edit-mode] EDIT_MODE_KEY is not set: god editing stays off');
  }
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const given = typeof body?.key === 'string' ? body.key : '';
  const store = await cookies();

  // Roles from the cookies this browser already has; the new key's role is added on top
  const access = await getAccess();

  if (isGodKey(given)) {
    store.set(GOD_COOKIE, hashGodKey(process.env.EDIT_MODE_KEY!).toString('hex'), cookieOptions);
    access.god = true;
  } else {
    const kingdomId = await findKingdomForKingKey(given);
    const allianceId = kingdomId === null ? await findAllianceForLeaderKey(given) : null;
    if (kingdomId !== null) {
      store.set(KING_COOKIE, hashKingKey(given), cookieOptions);
      access.kingOf = kingdomId;
    } else if (allianceId !== null) {
      store.set(LEADER_COOKIE, hashLeaderKey(given), cookieOptions);
      access.leaderOf = allianceId;
    } else {
      for (const cookie of [GOD_COOKIE, KING_COOKIE, LEADER_COOKIE]) store.delete(cookie);
      return NextResponse.json({ enabled: false, kingOf: null, leaderOf: null });
    }
  }

  return NextResponse.json({ enabled: access.god, kingOf: access.kingOf, leaderOf: access.leaderOf });
}

/** Exit: back to view only */
export async function DELETE() {
  const store = await cookies();
  for (const cookie of [GOD_COOKIE, KING_COOKIE, LEADER_COOKIE]) store.delete(cookie);
  return NextResponse.json({ enabled: false, kingOf: null, leaderOf: null });
}
