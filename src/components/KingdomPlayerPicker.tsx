'use client';

import { useEffect, useState } from 'react';
import { Alliance, Player } from '@/types';
import { getKingdomPlayersOutsideAlliance } from '@/utils/playerService';
import { getAlliancesByKingdomId } from '@/utils/allianceService';
import { formatNumbers } from '@/utils/formatNumbers';
import { PowerMode, getPlayerPower, getPowerLabel } from '@/utils/powerMode';
import PlayerIdentity from './PlayerIdentity';
import styles from './SwordlandEventLayout.module.css';

const PAGE_SIZE = 100;

type AddTarget = 'unassigned' | 'legion1' | 'legion2';

interface KingdomPlayerPickerProps {
  kingdomId: number;
  /** The event's own alliance (its players are already in the event) */
  excludeAllianceId: number;
  /** Players already in the event pool: shown as "Added" */
  inEventIds: Set<string>;
  /** Same search filter as the rest of the editor */
  filterPlayers: (list: Player[]) => Player[];
  /** Which power is shown */
  powerMode: PowerMode;
  onAdd: (player: Player, to: AddTarget) => void;
}

/**
 * SLS (Swordland Summit League): the kingdom's strongest players from other
 * alliances, 100 at a time, so they can be added to this alliance's legions.
 */
export default function KingdomPlayerPicker({
  kingdomId,
  excludeAllianceId,
  inEventIds,
  filterPlayers,
  powerMode,
  onAdd,
}: KingdomPlayerPickerProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [allianceTags, setAllianceTags] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = (offset: number) =>
    getKingdomPlayersOutsideAlliance(kingdomId, excludeAllianceId, offset, PAGE_SIZE);

  // First page + alliance tags; state is only set once the requests resolve
  useEffect(() => {
    let isMounted = true;
    Promise.all([fetchPage(0), getAlliancesByKingdomId(kingdomId).catch((): Alliance[] => [])])
      .then(([page, alliances]) => {
        if (!isMounted) return;
        setPlayers(page.players);
        setTotal(page.total);
        setAllianceTags(new Map(alliances.map((a) => [String(a.id), a.nameTag])));
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load kingdom players');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kingdomId, excludeAllianceId]);

  const loadMore = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const page = await fetchPage(players.length);
      setPlayers((prev) => [...prev, ...page.players]);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load kingdom players');
    } finally {
      setIsLoading(false);
    }
  };

  const visible = filterPlayers(players);
  const remaining = total - players.length;

  return (
    <>
      <div className={styles.poolHeader}>
        <h2 className={styles.playersHeader}>
          Kingdom Players{' '}
          <span className={styles.pickerCount}>
            ({players.length < total ? `${players.length} of ${total}` : total} from other alliances)
          </span>
        </h2>
        <p className={styles.pickerHint}>
          Add players from other alliances in your kingdom who registered for SLS with your alliance.
        </p>
      </div>

      <div className={styles.poolBody}>
        {error && <p className={styles.errorMessage}>{error}</p>}

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Alliance</th>
                <th>{getPowerLabel(powerMode)}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const rank = players.indexOf(p) + 1;
                const tag = p.allianceId != null ? allianceTags.get(String(p.allianceId)) : undefined;
                const added = inEventIds.has(p.id);
                return (
                  <tr key={`k-${p.id}`} className={added ? styles.pickerAddedRow : undefined}>
                    <td>{rank}</td>
                    <td>
                      <PlayerIdentity player={p} label={p.aliasName || p.name} />
                    </td>
                    <td>{tag ? `[${tag}]` : '—'}</td>
                    <td>{formatNumbers(getPlayerPower(p, powerMode))}</td>
                    <td>
                      {added ? (
                        <span className={styles.pickerAdded}>Added</span>
                      ) : (
                        <select
                          className={styles.tableSelect}
                          value=""
                          onChange={(e) => e.target.value && onAdd(p, e.target.value as AddTarget)}
                        >
                          <option value="">Add to…</option>
                          <option value="unassigned">Unassigned</option>
                          <option value="legion1">Legion 1</option>
                          <option value="legion2">Legion 2</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!isLoading && players.length === 0 && !error && (
            <p className={styles.pickerHint}>No players from other alliances in this kingdom.</p>
          )}
        </div>

        {(remaining > 0 || isLoading) && (
          <button
            type="button"
            className={styles.loadMoreButton}
            onClick={loadMore}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : `Load more (${Math.min(PAGE_SIZE, remaining)} of ${remaining} remaining)`}
          </button>
        )}
      </div>
    </>
  );
}
