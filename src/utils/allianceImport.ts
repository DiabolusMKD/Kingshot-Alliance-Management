'use client';

import { supabase } from './supabaseClient';
import { createAlliance, getAlliancesByKingdomId, updateAlliance } from './allianceService';
import { createPlayer, updatePlayer } from './playerService';
import { tcLevelToLevelImage } from './kingshotApi';
import { Alliance, Player } from '@/types';

/** What /api/alliances/[kingdomId]/[tag] returns (MightPulse's alliance + roster) */
export interface GameAlliance {
  alliance: {
    aid: number;
    name: string;
    abbr: string;
    kid: number;
    power: number;
    count: number;
    power_rank?: number | null;
    leader_governor_id?: number | null;
  };
  members: {
    governor_id: number;
    nick_name: string;
    power: number;
    town_center_level: number;
    kid: number;
    avatar_url?: string | null;
    alliance_rank_label?: string | null;
    kills?: number | null;
  }[];
}

/** The alliance isn't in the game (wrong tag / kingdom) */
export class AllianceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllianceNotFoundError';
  }
}

/** The alliance was pulled from the game recently (MightPulse usage is limited) */
export class AllianceCooldownError extends Error {
  constructor(
    message: string,
    readonly retryAt?: string,
  ) {
    super(message);
    this.name = 'AllianceCooldownError';
  }
}

/** Alliance + roster from the game, through our API route (the token stays on the server) */
export async function fetchGameAlliance(kingdomId: number, tag: string): Promise<GameAlliance> {
  const response = await fetch(`/api/alliances/${kingdomId}/${encodeURIComponent(tag)}`, { cache: 'no-store' });
  let body: { ok?: boolean; error?: string; message?: string; retryAt?: string } & Partial<GameAlliance>;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Unexpected response from the server (HTTP ${response.status})`);
  }
  if (body.error === 'alliance_not_found') throw new AllianceNotFoundError(body.message ?? 'Alliance not found');
  if (body.error === 'cooldown') throw new AllianceCooldownError(body.message ?? 'Updated recently', body.retryAt);
  if (!response.ok || body.ok === false || !body.alliance) {
    throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
  }
  return body as GameAlliance;
}

export interface AllianceImportResult {
  alliance: Alliance;
  /** The alliance was new to the app */
  createdAlliance: boolean;
  added: number;
  updated: number;
  /** Players of this alliance in the app who aren't on the game's roster any more */
  removed: string[];
  failed: { name: string; error: string }[];
}

type PlayerData = Omit<Player, 'id' | 'created_at' | 'updated_at'>;

/** Runs `task` over `items`, `size` at a time */
async function inBatches<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(task));
  }
}

/**
 * Adds the game's alliance to the kingdom (or refreshes its name when it's already here),
 * then updates every member already in the app (any alliance / kingdom: they're moved here)
 * and adds the missing ones. Swordland power and the alias are kept for existing players.
 * Players of the alliance in the app who aren't on the game's roster are removed from it.
 * Existing players keep their profile photo and level image (Update Players sets those
 * from the other API); new players get MightPulse's.
 */
export async function importGameAlliance(
  kingdomId: number,
  game: GameAlliance,
  onProgress?: (done: number, total: number) => void,
): Promise<AllianceImportResult> {
  const tag = game.alliance.abbr;
  const name = game.alliance.name || tag;

  // 1. The alliance: by the game's id first (survives tag changes), then by tag (case-sensitive)
  const alliances = await getAlliancesByKingdomId(kingdomId);
  const existing =
    alliances.find((a) => a.gameAllianceId != null && Number(a.gameAllianceId) === game.alliance.aid) ??
    alliances.find((a) => a.nameTag === tag);
  const fromGame = {
    name,
    nameTag: tag,
    kingdomId,
    gameAllianceId: game.alliance.aid,
    powerRank: game.alliance.power_rank ?? null,
    leaderPlayerId: game.alliance.leader_governor_id ?? null,
    gameSyncedAt: new Date().toISOString(),
  };
  const alliance: Alliance = existing
    ? await updateAlliance(existing.id, {
        ...fromGame,
        description: existing.description ?? null,
        allianceImageUrl: existing.allianceImageUrl ?? null,
      })
    : await createAlliance(fromGame);

  // 2. Members already in the app, by in-game id
  const gameIds = game.members.map((m) => String(m.governor_id));
  const { data, error } = await supabase.from('player').select('*').in('playerId', gameIds);
  if (error) throw new Error(`Failed to load players: ${error.message}`);
  const byGameId = new Map((data as Player[]).map((p) => [String(p.playerId), p]));

  const result: AllianceImportResult = { alliance, createdAlliance: !existing, added: 0, updated: 0, removed: [], failed: [] };
  let done = 0;
  onProgress?.(0, game.members.length);

  await inBatches(game.members, 8, async (member) => {
    const playerId = String(member.governor_id);
    const fromGame = {
      name: member.nick_name,
      level: member.town_center_level || undefined,
      allianceRank: member.alliance_rank_label ?? null,
      kills: member.kills ?? null,
      power: member.power,
      // Tri Alliance power follows the player's power
      trialliancePower: member.power,
      profilePhoto: member.avatar_url || undefined,
      levelImage: tcLevelToLevelImage(member.town_center_level),
      kingdomId: member.kid || kingdomId,
      allianceId: String(alliance.id),
    };

    try {
      const current = byGameId.get(playerId);
      if (current) {
        const update: PlayerData = {
          playerId: current.playerId,
          aliasName: current.aliasName || member.nick_name,
          swordlandPower: current.swordlandPower ?? 0,
          ...fromGame,
          // Images come from the other API (Update Players): keep them
          profilePhoto: current.profilePhoto,
          levelImage: current.levelImage,
        };
        await updatePlayer(current.id, update);
        result.updated += 1;
      } else {
        await createPlayer({ playerId, aliasName: member.nick_name, swordlandPower: 0, ...fromGame });
        result.added += 1;
      }
    } catch (err) {
      result.failed.push({ name: member.nick_name, error: err instanceof Error ? err.message : 'Failed' });
    } finally {
      done += 1;
      onProgress?.(done, game.members.length);
    }
  });

  // 3. Players still in this alliance in the app but no longer on the game's roster: they left
  const roster = new Set(gameIds);
  const { data: members, error: membersError } = await supabase
    .from('player')
    .select('id, playerId, name, aliasName')
    .eq('allianceId', alliance.id);
  if (membersError) throw new Error(`Failed to load the alliance's players: ${membersError.message}`);
  const leavers = (members as Pick<Player, 'id' | 'playerId' | 'name' | 'aliasName'>[]).filter(
    (p) => !roster.has(String(p.playerId)),
  );
  // An empty roster is an API hiccup, not everyone leaving: never empty the alliance
  if (leavers.length > 0 && game.members.length > 0) {
    const { error: removeError } = await supabase
      .from('player')
      .update({ allianceId: null })
      .in('id', leavers.map((p) => p.id));
    if (removeError) throw new Error(`Failed to remove players who left: ${removeError.message}`);
    result.removed = leavers.map((p) => p.aliasName || p.name);
  }

  return result;
}
