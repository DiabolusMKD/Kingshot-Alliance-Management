import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/utils/supabaseAdmin';
import { Access, canLead, canRule, getAccess } from '@/utils/accessServer';
import { isDiscordWebhookUrl, postToDiscord } from '@/utils/discordServer';

/**
 * Discord webhook of a kingdom (King or god) or an alliance (its Leader or god).
 * The URL is stored server-side only and never returned.
 *
 *  GET  ?kingdomId= | ?allianceId=               { configured }
 *  PUT  { kingdomId | allianceId, url | null }   set / remove the webhook (a test message is sent first)
 *  POST { kingdomId | allianceId, content }      post a message (e.g. the gift code delivery message)
 *       { kingdomId | allianceId, test: true }   post a test message
 */

type Target = { column: 'kingdomId' | 'allianceId'; id: number };

const fail = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const MAX_CONTENT_LENGTH = 8000;

function parseTarget(source: { kingdomId?: unknown; allianceId?: unknown } | null): Target | null {
  const kingdomId = source?.kingdomId != null ? Number(source.kingdomId) : null;
  const allianceId = source?.allianceId != null ? Number(source.allianceId) : null;
  if ((kingdomId === null) === (allianceId === null)) return null;
  const id = (kingdomId ?? allianceId)!;
  if (!Number.isInteger(id) || id <= 0) return null;
  return { column: kingdomId !== null ? 'kingdomId' : 'allianceId', id };
}

const mayUse = (access: Access, target: Target) =>
  target.column === 'kingdomId' ? canRule(access, target.id) : canLead(access, target.id);

const forbidden = (target: Target) =>
  fail(
    403,
    target.column === 'kingdomId'
      ? `Only the King of kingdom ${target.id} can manage its Discord channel`
      : "Only the alliance's Leader can manage its Discord channel"
  );

async function webhookUrl(db: SupabaseClient, target: Target): Promise<string | null> {
  const { data } = await db.from('discord_webhook').select('url').eq(target.column, target.id).maybeSingle();
  return data?.url ?? null;
}

const describe = (target: Target) => (target.column === 'kingdomId' ? `Kingdom ${target.id}` : 'this alliance');

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const target = parseTarget({ kingdomId: params.get('kingdomId'), allianceId: params.get('allianceId') });
  if (!target) return fail(400, 'Send kingdomId or allianceId');
  const db = getSupabaseAdmin();
  if (!db) return fail(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server');
  return NextResponse.json(
    { status: 'success', data: { configured: !!(await webhookUrl(db, target)) } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { kingdomId?: unknown; allianceId?: unknown; url?: unknown } | null;
  const target = parseTarget(body);
  if (!target) return fail(400, 'Send kingdomId or allianceId');
  if (!mayUse(await getAccess(), target)) return forbidden(target);
  const db = getSupabaseAdmin();
  if (!db) return fail(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server');

  if (body?.url == null || body.url === '') {
    const { error } = await db.from('discord_webhook').delete().eq(target.column, target.id);
    if (error) return fail(500, error.message);
    return NextResponse.json({ status: 'success', data: { configured: false } });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!isDiscordWebhookUrl(url)) {
    return fail(400, 'Not a Discord webhook URL (Channel settings → Integrations → Webhooks → Copy Webhook URL)');
  }

  // Only save a webhook that works
  try {
    await postToDiscord(url, `✅ Gift code announcements for ${describe(target)} will be posted in this channel.`);
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : 'Discord rejected the webhook');
  }

  const { error } = await db
    .from('discord_webhook')
    .upsert({ [target.column]: target.id, url, updated_at: new Date().toISOString() }, { onConflict: target.column });
  if (error) return fail(500, error.message);
  return NextResponse.json({ status: 'success', data: { configured: true } });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    kingdomId?: unknown;
    allianceId?: unknown;
    content?: unknown;
    test?: unknown;
  } | null;
  const target = parseTarget(body);
  if (!target) return fail(400, 'Send kingdomId or allianceId');
  if (!mayUse(await getAccess(), target)) return forbidden(target);
  const db = getSupabaseAdmin();
  if (!db) return fail(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server');

  const content =
    body?.test === true
      ? `🔔 Test message: gift code announcements for ${describe(target)} are posted here.`
      : typeof body?.content === 'string'
        ? body.content.trim().slice(0, MAX_CONTENT_LENGTH)
        : '';
  if (!content) return fail(400, 'Nothing to post');

  const url = await webhookUrl(db, target);
  if (!url) return fail(404, 'No Discord channel set');

  try {
    await postToDiscord(url, content);
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : 'Posting to Discord failed');
  }
  return NextResponse.json({ status: 'success', data: null });
}
