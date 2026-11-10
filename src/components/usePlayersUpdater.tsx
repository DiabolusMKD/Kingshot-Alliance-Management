'use client';

import { useEffect, useRef, useState } from 'react';
import { Alliance, Player } from '@/types';
import Dialog from '@/components/Dialog';
import { updatePlayer } from '@/utils/playerService';
import { createAlliance, getAlliancesByKingdomId } from '@/utils/allianceService';
import { getKingdomById } from '@/utils/kingdomService';
import { fetchPlayerFromKingshot, findMatchingAlliance, KingshotPlayerData } from '@/utils/kingshotApi';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import styles from './UpdatePlayersDialog.module.css';

type PlayerUpdateStatus = 'pending' | 'updating' | 'updated' | 'failed';

interface PlayerUpdateRow {
  id: Player['id'];
  name: string;
  status: PlayerUpdateStatus;
  error?: string;
  /** Alliance/kingdom change applied during the update, e.g. "Moved to [ABC]Name" */
  note?: string;
}

type GameAlliance = NonNullable<KingshotPlayerData['alliance']>;

interface PlacementLookups {
  /** Finds the app alliance for an in-game one; creates it when `createMissingAlliances` is on */
  matchAlliance: (kingdomId: number, gameAlliance: GameAlliance) => Promise<{ alliance: Alliance; created: boolean } | null>;
  kingdomExists: (kingdomId: number) => Promise<boolean>;
}

const UPDATE_STATUS_LABELS: Record<PlayerUpdateStatus, string> = {
  pending: 'Not started',
  updating: 'Updating',
  updated: 'Updated',
  failed: 'Failed',
};

/**
 * Decides where a player belongs after a refresh from the game:
 *  - transferred kingdom -> move to that kingdom, into the matching alliance there or none
 *  - in a known alliance -> move to it
 *  - in an alliance not in the app -> created first when `createMissingAlliances` is on,
 *    otherwise removed from the alliance
 *  - no alliance -> remove from the alliance
 */
async function resolvePlacement(
  player: Player,
  kingshotData: KingshotPlayerData,
  lookups: PlacementLookups
): Promise<{ kingdomId: number; allianceId: string | null; note?: string }> {
  const current = { kingdomId: player.kingdomId, allianceId: player.allianceId ?? null };
  const gameKingdom = kingshotData.kingdom > 0 ? kingshotData.kingdom : player.kingdomId;
  const gameAlliance = kingshotData.alliance;
  const describe = (match: { alliance: Alliance; created: boolean }) =>
    `${formatAllianceLabel(match.alliance)}${match.created ? ' (new alliance created)' : ''}`;

  if (gameKingdom !== player.kingdomId) {
    if (!(await lookups.kingdomExists(gameKingdom))) {
      return { ...current, note: `Transferred to K${gameKingdom} (kingdom not in app, not moved)` };
    }
    const match = gameAlliance ? await lookups.matchAlliance(gameKingdom, gameAlliance) : null;
    return {
      kingdomId: gameKingdom,
      allianceId: match ? String(match.alliance.id) : null,
      note: `Transferred to K${gameKingdom}${match ? ` → ${describe(match)}` : ', no alliance'}`,
    };
  }

  if (!gameAlliance) {
    return { ...current, allianceId: null, note: current.allianceId ? 'Left alliance' : undefined };
  }

  const match = await lookups.matchAlliance(player.kingdomId, gameAlliance);
  if (!match) {
    return {
      ...current,
      allianceId: null,
      note: current.allianceId ? `Left to [${gameAlliance.tag}]${gameAlliance.name} (not in app)` : undefined,
    };
  }
  if (String(match.alliance.id) === String(current.allianceId)) return current;
  return {
    ...current,
    allianceId: String(match.alliance.id),
    note: `${current.allianceId ? 'Moved' : 'Joined'} ${describe(match)}`,
  };
}

interface UsePlayersUpdaterOptions {
  kingdomId: number;
  /** Alliances of `kingdomId`, already loaded by the page */
  kingdomAlliances: Alliance[];
  /** Runs after every player was processed, before the result is shown (e.g. reload the list) */
  onFinished?: () => Promise<void> | void;
  /** Create alliances that exist in the game but not in the app, from the game's tag + name */
  createMissingAlliances?: boolean;
}

/**
 * "Update All Players": refreshes each player from the game one by one, moving them
 * between alliances/kingdoms as needed, with a live progress modal.
 * Render `dialog` somewhere in the page and call `startUpdate(players)`.
 */
export function usePlayersUpdater({
  kingdomId,
  kingdomAlliances,
  onFinished,
  createMissingAlliances = false,
}: UsePlayersUpdaterOptions) {
  // null = progress modal closed
  const [rows, setRows] = useState<PlayerUpdateRow[] | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const activeRowRef = useRef<HTMLLIElement>(null);

  const setRowStatus = (index: number, status: PlayerUpdateStatus, extra: { error?: string; note?: string } = {}) => {
    setRows((current) => current && current.map((row, i) => (i === index ? { ...row, status, ...extra } : row)));
  };

  const startUpdate = async (players: Player[]) => {
    if (isUpdating || players.length === 0) return;

    const playersToUpdate = [...players];
    setRows(playersToUpdate.map((p) => ({ id: p.id, name: p.aliasName || p.name, status: 'pending' })));
    setIsUpdating(true);

    // Per-run caches, so each kingdom is looked up once and new alliances are created once
    const allianceCache = new Map<number, Promise<Alliance[]>>([[kingdomId, Promise.resolve([...kingdomAlliances])]]);
    const kingdomCache = new Map<number, Promise<boolean>>([[kingdomId, Promise.resolve(true)]]);
    const alliancesInKingdom = (id: number) => {
      if (!allianceCache.has(id)) allianceCache.set(id, getAlliancesByKingdomId(id).catch(() => []));
      return allianceCache.get(id)!;
    };
    const lookups: PlacementLookups = {
      matchAlliance: async (id, gameAlliance) => {
        const alliances = await alliancesInKingdom(id);
        const existing = findMatchingAlliance(alliances, id, gameAlliance);
        if (existing) return { alliance: existing, created: false };
        if (!createMissingAlliances || !gameAlliance.tag || !gameAlliance.name) return null;

        const created = await createAlliance({ name: gameAlliance.name, nameTag: gameAlliance.tag, kingdomId: id });
        alliances.push(created); // later players of the same alliance join it instead of re-creating
        return { alliance: created, created: true };
      },
      kingdomExists: (id) => {
        if (!kingdomCache.has(id)) kingdomCache.set(id, getKingdomById(id).then(Boolean).catch(() => false));
        return kingdomCache.get(id)!;
      },
    };

    // Sequential on purpose, to avoid hammering the Kingshot lookup
    for (const [index, player] of playersToUpdate.entries()) {
      setRowStatus(index, 'updating');
      try {
        const kingshotData = await fetchPlayerFromKingshot(player.playerId);
        const placement = await resolvePlacement(player, kingshotData, lookups);
        const power = kingshotData.power ?? player.power;

        await updatePlayer(player.id, {
          playerId: player.playerId,
          swordlandPower: player.swordlandPower,
          kingdomId: placement.kingdomId,
          name: kingshotData.name || player.name,
          aliasName: player.aliasName || kingshotData.name,
          power,
          trialliancePower: power,
          profilePhoto: kingshotData.profilePhoto || player.profilePhoto,
          levelImage: kingshotData.levelImage || player.levelImage,
          allianceId: placement.allianceId,
        });
        setRowStatus(index, 'updated', { note: placement.note });
      } catch (error) {
        console.error(`Failed to update player ${player.playerId}:`, error);
        setRowStatus(index, 'failed', { error: error instanceof Error ? error.message : 'Update failed' });
      }
    }

    try {
      await onFinished?.();
    } finally {
      setIsUpdating(false);
    }
  };

  // Keep the row being updated in view as the list progresses
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [rows]);

  const close = () => {
    if (!isUpdating) setRows(null);
  };

  const updatedCount = rows?.filter((r) => r.status === 'updated').length ?? 0;
  const failedCount = rows?.filter((r) => r.status === 'failed').length ?? 0;
  const finishedCount = updatedCount + failedCount;
  const changedCount = rows?.filter((r) => r.note).length ?? 0;

  const dialog = (
    <Dialog isOpen={rows !== null} title="Updating Players" onClose={close} closeDisabled={isUpdating} size="large">
      {rows && (
        <div className={styles.updateProgress}>
          <p className={styles.updateCounter} aria-live="polite">
            {finishedCount} / {rows.length} processed
          </p>
          <ul className={styles.updateList}>
            {rows.map((row) => (
              <li
                key={row.id}
                ref={row.status === 'updating' ? activeRowRef : undefined}
                className={styles.updateRow}
                title={row.error}
              >
                <span className={styles.updateName}>{row.name}</span>
                <span className={styles.updateDots} aria-hidden="true" />
                {row.note && (
                  <span className={styles.updateNote} title={row.note}>
                    {row.note}
                  </span>
                )}
                <span className={`${styles.updateStatus} ${styles[`status_${row.status}`]}`}>
                  {row.status === 'updating' && <span className={styles.miniSpinner} aria-hidden="true" />}
                  {UPDATE_STATUS_LABELS[row.status]}
                </span>
              </li>
            ))}
          </ul>
          {!isUpdating && (
            <div
              className={`${styles.updateResult} ${failedCount > 0 ? styles.updateResultWarning : styles.updateResultSuccess}`}
              role="status"
            >
              {failedCount === 0
                ? `Success! All ${updatedCount} player(s) updated.`
                : `Finished: ${updatedCount} updated, ${failedCount} failed.`}
              {changedCount > 0 && ` ${changedCount} moved, removed or transferred (see notes above).`}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );

  return { startUpdate, isUpdating, dialog };
}
