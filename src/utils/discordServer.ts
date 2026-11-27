// Server-only: Discord webhooks of kingdoms and alliances (discord_webhook table, service role only).
// A webhook URL lets anyone post to its channel, so it never leaves the server.

const WEBHOOK_PATTERN = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,100}$/;
const DISCORD_MAX_LENGTH = 2000;

export const isDiscordWebhookUrl = (url: string) => WEBHOOK_PATTERN.test(url.trim());

/** Discord messages are limited to 2000 characters: split on line breaks. */
function splitMessage(content: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (const line of content.split('\n')) {
    // A single line longer than the limit is cut (e.g. a very long list of names)
    const piece = line.length > DISCORD_MAX_LENGTH ? `${line.slice(0, DISCORD_MAX_LENGTH - 1)}…` : line;
    if (current && current.length + 1 + piece.length > DISCORD_MAX_LENGTH) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Posts a message (split when long); throws with Discord's error when it fails. */
export async function postToDiscord(webhookUrl: string, content: string): Promise<void> {
  for (const part of splitMessage(content)) {
    const res = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No @everyone / @here / role pings from names in the message
      body: JSON.stringify({ content: part, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(`Discord: ${body?.message ?? `HTTP ${res.status}`}`);
    }
  }
}
