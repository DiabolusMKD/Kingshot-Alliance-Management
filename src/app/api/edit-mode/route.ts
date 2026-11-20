import { createHash, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Edit mode (see components/EditMode): the key stays on the server (EDIT_MODE_KEY, never sent
 * to the browser). A correct key sets an httpOnly cookie holding a hash of it, so changing the
 * key in the env turns editing off everywhere.
 *
 * Not security: it only decides whether the editing UI is shown.
 */

const COOKIE = 'kam-edit-mode';
const MAX_AGE = 60 * 60 * 24 * 365; // a year

const editKey = () => process.env.EDIT_MODE_KEY ?? '';
const hash = (value: string) => createHash('sha256').update(`kam-edit-mode:${value}`).digest();

const matches = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** { enabled }: this browser has a valid edit cookie */
export async function GET() {
  const key = editKey();
  const cookie = (await cookies()).get(COOKIE)?.value;
  const enabled = !!key && !!cookie && matches(Buffer.from(cookie, 'hex'), hash(key));
  return NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'no-store' } });
}

/** { key } -> turns editing on when it's the key, off otherwise */
export async function POST(request: NextRequest) {
  const key = editKey();
  if (!key) {
    console.warn('[edit-mode] EDIT_MODE_KEY is not set: editing stays off');
  }
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const given = typeof body?.key === 'string' ? body.key : '';
  const enabled = !!key && !!given && matches(hash(given), hash(key));

  const store = await cookies();
  if (enabled) {
    store.set(COOKIE, hash(key).toString('hex'), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE,
    });
  } else {
    store.delete(COOKIE);
  }
  return NextResponse.json({ enabled });
}

/** Exit: back to view only */
export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return NextResponse.json({ enabled: false });
}
