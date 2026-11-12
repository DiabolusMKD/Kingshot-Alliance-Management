import { Alliance } from '@/types';

export interface KingshotPlayerData {
  playerId: string;
  name: string;
  kingdom: number;
  level?: number;
  levelRendered?: string;
  levelRenderedDetailed?: string;
  levelImage?: string;
  profilePhoto?: string;
  power?: number;
  alliance?: {
    name: string;
    tag: string;
  };
}

interface KingshotAPIResponse {
  status: 'success' | 'error';
  data?: {
    playerId: string;
    name: string;
    kingdom?: number;
    level?: number;
    levelLabel?: string;
    profilePhoto?: string;
    power?: string;
    alliance?: { id: string; name: string; abbr: string } | null;
  };
  message: string;
  meta?: any;
  timestamp: string;
}

/**
 * The Kingshot API returns the level image as a short label like "TG7" or
 * "TG6-3" rather than a URL. Map it to the actual icon hosted on kingshot's
 * CDN, using only the number between "TG" and the optional "-" suffix.
 */
function mapLevelImageToIconUrl(levelImage?: string): string | undefined {
  if (!levelImage) return undefined;

  const match = levelImage.match(/^TG(\d+)(?:-\d+)?$/i);
  if (!match) return levelImage;

  return `https://got-global-avatar.akamaized.net/img/icon/stove_lv_${match[1]}.png`;
}

/**
 * Find the local alliance matching the player's in-game alliance within the
 * given kingdom. Prefers an exact tag + name match, then falls back to the tag
 * alone (an alliance may have been renamed in game).
 *
 * Tags are case-sensitive in game: fKn, FKN and Fkn are three different alliances,
 * so there is deliberately no case-insensitive fallback. A tag that only differs in
 * case is "not in the app" and gets created instead of joining the wrong alliance.
 */
export function findMatchingAlliance(
  alliances: Alliance[],
  kingdomId: number,
  kingshotAlliance?: KingshotPlayerData['alliance']
): Alliance | undefined {
  if (!kingshotAlliance) return undefined;

  const inKingdom = alliances.filter((a) => a.kingdomId === kingdomId);
  const { name, tag } = kingshotAlliance;

  return (
    inKingdom.find((a) => a.nameTag === tag && a.name === name) ??
    inKingdom.find((a) => a.nameTag === tag)
  );
}

/**
 * Fetch player data from Kingshot API
 */
export async function fetchPlayerFromKingshot(playerId: string): Promise<KingshotPlayerData> {
  try {
    console.log(`Fetching player ${playerId}...`);
    // Call local Next.js API route instead of directly calling third-party API to avoid CORS
    const response = await fetch(`/api/player-info?playerId=${playerId}`);

    let data: KingshotAPIResponse;
    try {
      data = await response.json();
      console.log(`Received response for player ${playerId}:`, data);
    } catch (parseError) {
      console.error(`Failed to parse response:`, parseError);
      throw new Error('Invalid response from server');
    }

    // Check if API returned an error status
    if (data.status === 'error') {
      const errorMessage = data.message || 'Player not found';
      console.error(`API error: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Check HTTP status
    if (!response.ok) {
      const errorMessage = data.message || `HTTP ${response.status}: ${response.statusText}`;
      console.error(`HTTP error: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Extract player data
    if (!data.data) {
      console.error('No player data in response');
      throw new Error('No player data returned from API');
    }

    const playerData = data.data;

    // Map API response to our Player interface
    // Note: API doesn't return swordland/triAlliance power
    const power = Number(playerData.power);
    return {
      playerId: String(playerData.playerId) || playerId,
      name: playerData.name || 'Unknown',
      kingdom: playerData.kingdom || 0,
      level: playerData.level,
      levelRendered: playerData.level ? `Level ${playerData.level}` : undefined,
      levelRenderedDetailed: playerData.level ? `Level ${playerData.level} (Detailed)` : undefined,
      levelImage: mapLevelImageToIconUrl(playerData.levelLabel),
      profilePhoto: playerData.profilePhoto || `/images/default-profile.png`,
      power: Number.isFinite(power) ? power : undefined,
      alliance: playerData.alliance
        ? { name: playerData.alliance.name, tag: playerData.alliance.abbr }
        : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to fetch player ${playerId}:`, errorMessage);
    throw new Error(errorMessage);
  }
}
