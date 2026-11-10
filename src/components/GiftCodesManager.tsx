'use client';

import { useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import BackLink from '@/components/BackLink';
import { useToast } from '@/components/Toast';
import { GiftCode, GiftCodeRedemption, GiftCodeRedeemResult, Player } from '@/types';
import {
  DEAD_CODE_REASONS,
  describeRedemptionReason,
  getActiveGiftCodes,
  getRedemptions,
  redeemCodesForPlayer,
  syncGiftCodes,
} from '@/utils/giftCodeService';
import styles from './GiftCodesManager.module.css';

interface GiftCodesManagerProps {
  /** Loads the players codes are redeemed for (an alliance, or players without one) */
  loadPlayers: () => Promise<Player[]>;
  /** Changes whenever `loadPlayers` targets a different group, to reload */
  loadKey: string;
  /** Who the players are, e.g. "[ABC]Alliance" or "Kingdom 1010 without an alliance" */
  groupLabel: string;
  backHref: string;
  backLabel: string;
  emptyPlayersText: string;
}

type CellState = 'none' | 'queued' | 'running' | 'redeemed' | 'failed';

interface LiveCell {
  state: Exclude<CellState, 'none'>;
  reason?: string | null;
}

interface RunSummary {
  redeemed: number;
  failed: number;
  skipped: number;
}

// Pacing for Century Games' API; tune if we hit rate limits
const DELAY_BETWEEN_PLAYERS_MS = 1000;
const RATE_LIMIT_WAIT_MS = 60 * 1000;
const MAX_RATE_LIMIT_RETRIES = 3;

const CELL_LABELS: Record<CellState, string> = {
  none: 'Not redeemed',
  queued: 'Queued',
  running: 'Redeeming',
  redeemed: 'Redeemed',
  failed: 'Failed',
};

const cellKey = (giftCodeId: number, playerId: number | string) => `${giftCodeId}:${playerId}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry';
  return `Expires ${new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** Gift code sync + bulk redemption for a group of players (see the gift-codes routes). */
export default function GiftCodesManager({
  loadPlayers,
  loadKey,
  groupLabel,
  backHref,
  backLabel,
  emptyPlayersText,
}: GiftCodesManagerProps) {
  const toast = useToast();

  const [players, setPlayers] = useState<Player[]>([]);
  const [codes, setCodes] = useState<GiftCode[]>([]);
  const [redemptions, setRedemptions] = useState<Map<string, GiftCodeRedemption>>(new Map());
  const [live, setLive] = useState<Map<string, LiveCell>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [force, setForce] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; waitingUntil?: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isBusy = isLoading || isSyncing || isRedeeming;

  const loadRedemptions = async (activeCodes: GiftCode[], alliancePlayers: Player[]) => {
    const rows = await getRedemptions(
      activeCodes.map((c) => c.id),
      alliancePlayers.map((p) => Number(p.id))
    );
    setRedemptions(new Map(rows.map((r) => [cellKey(r.giftCodeId, r.playerId), r])));
  };

  /** Sync with kingshot.net; falls back to the codes already in the database. */
  const refreshCodes = async (): Promise<GiftCode[]> => {
    try {
      const synced = await syncGiftCodes();
      setSyncError(null);
      return synced;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check for new codes';
      setSyncError(message);
      return getActiveGiftCodes().catch(() => []);
    }
  };

  // Initial load: players + fresh codes, then redemption statuses
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [groupPlayers, activeCodes] = await Promise.all([loadPlayers(), refreshCodes()]);
        if (!isMounted) return;
        setPlayers(groupPlayers);
        setCodes(activeCodes);
        await loadRedemptions(activeCodes, groupPlayers);
      } catch (error) {
        console.error('Failed to load gift codes page:', error);
        if (isMounted) toast.error(error instanceof Error ? error.message : 'Failed to load gift codes');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  // Warn before leaving mid-run (results so far are already saved; the rest just won't be sent)
  useEffect(() => {
    if (!isRedeeming) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isRedeeming]);

  const handleCheckForNewCodes = async () => {
    setIsSyncing(true);
    try {
      const previousIds = new Set(codes.map((c) => c.id));
      const activeCodes = await refreshCodes();
      setCodes(activeCodes);
      await loadRedemptions(activeCodes, players);

      const newCount = activeCodes.filter((c) => !previousIds.has(c.id)).length;
      if (newCount > 0) toast.success(`Found ${newCount} new gift code(s)`);
      else toast.info('No new gift codes');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check for new codes');
    } finally {
      setIsSyncing(false);
    }
  };

  const setLiveCells = (entries: [string, LiveCell][]) => {
    if (entries.length === 0) return;
    setLive((prev) => {
      const next = new Map(prev);
      for (const [key, value] of entries) next.set(key, value);
      return next;
    });
  };

  // Ticks the "waiting Ns" countdown while rate limited
  useEffect(() => {
    if (!progress?.waitingUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress?.waitingUntil]);

  /** Redeems the given codes for one player, waiting and retrying when rate limited. */
  const redeemForPlayer = async (
    player: Player,
    playerCodes: GiftCode[],
    tally: RunSummary,
    deadCodes: Map<number, string>,
    position: number
  ) => {
    let pending = playerCodes;

    for (let attempt = 0; pending.length > 0; attempt++) {
      setLiveCells(pending.map((c) => [cellKey(c.id, player.id), { state: 'running' }]));

      let results: GiftCodeRedeemResult[];
      try {
        results = await redeemCodesForPlayer(Number(player.id), pending.map((c) => c.id));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'SERVICE_UNAVAILABLE';
        results = pending.map((c) => ({ giftCodeId: c.id, outcome: 'failed', reason }));
      }

      const entries: [string, LiveCell][] = [];
      const retryIds = new Set<number>();
      for (const result of results) {
        const key = cellKey(result.giftCodeId, player.id);
        if (result.outcome === 'retry' && attempt < MAX_RATE_LIMIT_RETRIES) {
          retryIds.add(result.giftCodeId);
          entries.push([key, { state: 'queued', reason: result.reason }]);
        } else if (result.outcome === 'redeemed') {
          tally.redeemed++;
          entries.push([key, { state: 'redeemed' }]);
        } else {
          tally.failed++;
          entries.push([key, { state: 'failed', reason: result.reason }]);
          if (result.reason && DEAD_CODE_REASONS.has(result.reason)) deadCodes.set(result.giftCodeId, result.reason);
        }
      }
      setLiveCells(entries);

      pending = pending.filter((c) => retryIds.has(c.id));
      if (pending.length > 0) {
        const waitingUntil = Date.now() + RATE_LIMIT_WAIT_MS;
        setNow(Date.now());
        setProgress({ current: position, total: players.length, waitingUntil });
        await sleep(RATE_LIMIT_WAIT_MS);
        setProgress({ current: position, total: players.length });
      }
    }
  };

  const handleRedeem = async () => {
    if (codes.length === 0 || players.length === 0) return;

    setIsRedeeming(true);
    setSummary(null);
    setLive(new Map());
    const tally: RunSummary = { redeemed: 0, failed: 0, skipped: 0 };
    // Codes that turned out expired/unknown/used up: don't send them to anyone else this run
    const deadCodes = new Map<number, string>();

    try {
      for (const [index, player] of players.entries()) {
        setProgress({ current: index + 1, total: players.length });

        const alreadyRedeemed = codes.filter(
          (c) => !force && redemptions.get(cellKey(c.id, player.id))?.status === 'redeemed'
        );
        tally.skipped += alreadyRedeemed.length;

        const skippedDead: [string, LiveCell][] = [];
        const playerCodes = codes.filter((c) => {
          if (alreadyRedeemed.includes(c)) return false;
          if (deadCodes.has(c.id)) {
            skippedDead.push([cellKey(c.id, player.id), { state: 'failed', reason: 'SKIPPED_DEAD_CODE' }]);
            return false;
          }
          return true;
        });
        setLiveCells(skippedDead);
        if (playerCodes.length === 0) continue;

        await redeemForPlayer(player, playerCodes, tally, deadCodes, index + 1);
        if (index < players.length - 1) await sleep(DELAY_BETWEEN_PLAYERS_MS);
      }

      await loadRedemptions(codes, players).catch((error) =>
        console.error('Failed to reload redemptions:', error)
      );
    } finally {
      setSummary(tally);
      setProgress(null);
      setIsRedeeming(false);
    }
  };

  const getCell = (code: GiftCode, player: Player): { state: CellState; reason?: string | null } => {
    const key = cellKey(code.id, player.id);
    const liveCell = live.get(key);
    if (liveCell) return liveCell;

    const row = redemptions.get(key);
    if (row?.status === 'redeemed') return { state: 'redeemed' };
    if (row?.reason) return { state: 'failed', reason: row.reason };
    return { state: 'none' };
  };

  const redeemedCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const code of codes) {
      let count = 0;
      for (const player of players) {
        const key = cellKey(code.id, player.id);
        const liveCell = live.get(key);
        if (liveCell ? liveCell.state === 'redeemed' : redemptions.get(key)?.status === 'redeemed') count++;
      }
      counts.set(code.id, count);
    }
    return counts;
  }, [codes, players, redemptions, live]);

  if (isLoading) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <BackLink href={backHref}>{backLabel}</BackLink>
          <div className={styles.container}>
            <p className={styles.muted}>Loading gift codes...</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <BackLink href={backHref}>{backLabel}</BackLink>
        <div className={styles.container}>
          <div className={styles.header}>
            <div>
              <h1 className={styles.title}>Gift Codes</h1>
              <p className={styles.subtitle}>
                {codes.length} active code(s) · {players.length} player(s) · {groupLabel}
              </p>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCheckForNewCodes}
                disabled={isBusy}
              >
                {isSyncing ? 'Checking...' : 'Check for new codes'}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleRedeem}
                disabled={isBusy || codes.length === 0 || players.length === 0}
              >
                {isRedeeming ? 'Redeeming...' : 'Redeem Codes'}
              </button>
            </div>
          </div>

          <label className={`${styles.forceOption} ${isBusy ? styles.disabled : ''}`}>
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              disabled={isBusy}
            />
            Also send codes to players already marked as redeemed
          </label>

          {syncError && (
            <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
              Could not check kingshot.net for new codes ({syncError}). Showing codes already saved.
            </div>
          )}

          {progress && (
            <div className={`${styles.banner} ${styles.bannerInfo}`} role="status" aria-live="polite">
              Redeeming for player {progress.current} / {progress.total}
              {progress.waitingUntil &&
                ` · rate limited by the game server, retrying in ${Math.max(0, Math.ceil((progress.waitingUntil - now) / 1000))}s`}
            </div>
          )}

          {summary && (
            <div
              className={`${styles.banner} ${summary.failed > 0 ? styles.bannerWarning : styles.bannerSuccess}`}
              role="status"
            >
              {summary.failed === 0 ? 'Success! ' : 'Finished. '}
              {summary.redeemed} redeemed, {summary.failed} failed, {summary.skipped} skipped (already redeemed).
              {summary.failed > 0 && ' Hover a failed cell to see why.'}
            </div>
          )}

          {codes.length === 0 ? (
            <p className={styles.muted}>No active gift codes right now.</p>
          ) : (
            <>
              <div className={styles.codeList}>
                {codes.map((code) => (
                  <div key={code.id} className={styles.codeCard}>
                    <span className={styles.codeName}>{code.code}</span>
                    <span className={styles.codeMeta}>{formatExpiry(code.expires_at)}</span>
                    <span className={styles.codeMeta}>
                      {redeemedCounts.get(code.id) ?? 0} / {players.length} redeemed
                    </span>
                  </div>
                ))}
              </div>

              {players.length === 0 ? (
                <p className={styles.muted}>{emptyPlayersText}</p>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.playerColumn}>Player</th>
                        {codes.map((code) => (
                          <th key={code.id}>{code.code}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((player) => (
                        <tr key={player.id}>
                          <td className={styles.playerColumn}>
                            <span className={styles.playerName}>{player.aliasName || player.name}</span>
                            <span className={styles.playerId}>{player.playerId}</span>
                          </td>
                          {codes.map((code) => {
                            const cell = getCell(code, player);
                            const title =
                              cell.state === 'failed' ? describeRedemptionReason(cell.reason) : CELL_LABELS[cell.state];
                            return (
                              <td key={code.id}>
                                <span className={`${styles.cell} ${styles[`cell_${cell.state}`]}`} title={title}>
                                  {cell.state === 'running' && <span className={styles.miniSpinner} aria-hidden="true" />}
                                  {cell.state === 'failed' ? describeRedemptionReason(cell.reason) : CELL_LABELS[cell.state]}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
