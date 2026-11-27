import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  cookieOptions,
  findKingdomForKingKey,
  getAccess,
  GOD_COOKIE,
  hashGodKey,
  hashKingKey,
  isGodKey,
  KING_COOKIE,
} from '@/utils/accessServer';

/**
 * Edit mode (see components/EditMode and utils/accessServer): keys stay on the server.
 * `?mode=<key>` is either the global EDIT_MODE_KEY (god) or a kingdom's King key.
 *
 * Not security for regular editing: it only decides whether the editing UI is shown.
 */

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** { enabled, kingOf }: god editing is on / this browser is the King of kingdom `kingOf` */
export async function GET() {
  const access = await getAccess();
  return NextResponse.json({ enabled: access.god, kingOf: access.kingOf }, noStore);
}

/** { key } -> turns on the role the key belongs to; an unknown key turns everything off */
export async function POST(request: NextRequest) {
  if (!process.env.EDIT_MODE_KEY) {
    console.warn('[edit-mode] EDIT_MODE_KEY is not set: god editing stays off');
  }
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const given = typeof body?.key === 'string' ? body.key : '';
  const store = await cookies();

  if (isGodKey(given)) {
    store.set(GOD_COOKIE, hashGodKey(process.env.EDIT_MODE_KEY!).toString('hex'), cookieOptions);
    store.delete(KING_COOKIE);
    return NextResponse.json({ enabled: true, kingOf: null });
  }

  const kingdomId = await findKingdomForKingKey(given);
  store.delete(GOD_COOKIE);
  if (kingdomId !== null) {
    store.set(KING_COOKIE, hashKingKey(given), cookieOptions);
    return NextResponse.json({ enabled: false, kingOf: kingdomId });
  }

  store.delete(KING_COOKIE);
  return NextResponse.json({ enabled: false, kingOf: null });
}

/** Exit: back to view only */
export async function DELETE() {
  const store = await cookies();
  store.delete(GOD_COOKIE);
  store.delete(KING_COOKIE);
  return NextResponse.json({ enabled: false, kingOf: null });
}
