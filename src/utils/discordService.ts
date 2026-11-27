'use client';

// Discord channel of a kingdom or an alliance, through /api/discord (the webhook URL stays on the server).

export type DiscordTarget = { kingdomId: number } | { allianceId: number };

async function apiJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status !== 'success') throw new Error(body?.error || `Request failed (HTTP ${res.status})`);
  return body.data as T;
}

const query = (target: DiscordTarget) =>
  'kingdomId' in target ? `kingdomId=${target.kingdomId}` : `allianceId=${target.allianceId}`;

const send = (method: 'PUT' | 'POST', payload: object) =>
  fetch('/api/discord', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

/** Whether a Discord channel is set (anyone may ask; the URL itself is never returned). */
export async function isDiscordConfigured(target: DiscordTarget): Promise<boolean> {
  const data = await apiJson<{ configured: boolean }>(await fetch(`/api/discord?${query(target)}`, { cache: 'no-store' }));
  return data.configured;
}

/** Save a webhook URL (Discord gets a confirmation message first), or remove it with null. */
export async function setDiscordWebhook(target: DiscordTarget, url: string | null): Promise<void> {
  await apiJson(await send('PUT', { ...target, url }));
}

export async function sendDiscordTest(target: DiscordTarget): Promise<void> {
  await apiJson(await send('POST', { ...target, test: true }));
}

export async function postToDiscordChannel(target: DiscordTarget, content: string): Promise<void> {
  await apiJson(await send('POST', { ...target, content }));
}

/** New Leader link key for an alliance (god only); the previous one stops working. */
export async function generateLeaderKey(allianceId: number): Promise<string> {
  const data = await apiJson<{ key: string }>(await fetch(`/api/leaders/${allianceId}`, { method: 'POST' }));
  return data.key;
}
