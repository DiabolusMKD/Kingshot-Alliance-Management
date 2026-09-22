// kingshot.net no longer exposes a plain REST player-info API. Player data is now
// only available through the Next.js Server Action backing the gift-code redeem
// page, so we call that action directly with the same wire format the browser uses.
//
// Good to know: the `Next-Action` id is a hash generated at build time by
// kingshot.net and will change whenever they redeploy their site. If lookups start
// failing with a 404 here, grab the new id from the `next-action` request header
// sent by a browser on https://kingshot.net/gift-codes/redeem and update
// KINGSHOT_REDEEM_ACTION_ID (env var) or the fallback below.

export const KINGSHOT_REDEEM_URL = 'https://kingshot.net/gift-codes/redeem';

export const KINGSHOT_REDEEM_ACTION_ID =
  process.env.KINGSHOT_REDEEM_ACTION_ID || '408688ea81aee7437ae595e78a24005333c8d97b93';

export interface KingshotRedeemPlayerData {
  playerId: string;
  name: string;
  kingdom?: number;
  level?: number;
  [key: string]: any;
}

export interface KingshotRedeemResponse {
  status: 'success' | 'fail';
  data?: KingshotRedeemPlayerData | null;
  message: string;
  errorKey?: string;
}

/**
 * The action's response is streamed in Next.js's RSC "Flight" wire format
 * (one `<rowId>:<json>` line per row) rather than plain JSON. The row we
 * care about is whichever one carries a `status` field.
 */
export function parseKingshotFlightResponse(rawText: string): KingshotRedeemResponse | null {
  for (const line of rawText.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    try {
      const parsed = JSON.parse(line.slice(separatorIndex + 1));
      if (parsed && typeof parsed === 'object' && 'status' in parsed) {
        return parsed as KingshotRedeemResponse;
      }
    } catch {
      // Not every row is JSON (e.g. the reference row) - skip it.
    }
  }
  return null;
}

export interface KingshotRedeemFetchResult {
  httpResponse: Response;
  rawText: string;
  parsed: KingshotRedeemResponse | null;
}

export async function fetchKingshotPlayerViaRedeem(playerId: string): Promise<KingshotRedeemFetchResult> {
  const httpResponse = await fetch(KINGSHOT_REDEEM_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
      'Next-Action': KINGSHOT_REDEEM_ACTION_ID,
      Origin: 'https://kingshot.net',
      Referer: KINGSHOT_REDEEM_URL,
      'User-Agent': 'kingshot-alliance-management/1.0',
    },
    body: JSON.stringify([playerId]),
  });

  const rawText = await httpResponse.text();
  const parsed = httpResponse.ok ? parseKingshotFlightResponse(rawText) : null;

  return { httpResponse, rawText, parsed };
}
