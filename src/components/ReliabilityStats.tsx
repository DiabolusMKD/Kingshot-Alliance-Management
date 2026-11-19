'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AllianceEvent, EventPlayer, Player, SwordlandSeason } from '@/types';
import PlayerIdentity from './PlayerIdentity';
import { getPlayersByIds } from '@/utils/playerService';
import { getEventPlayersOfEvents } from '@/utils/seasonService';
import { RELIABILITY_POINTS, summarizeReliability } from '@/utils/reliability';
import { getPlayerHref } from '@/utils/playerLinks';
import styles from './ReliabilityStats.module.css';

interface ReliabilityStatsProps {
  /** All events of this type of the alliance (only completed ones count) */
  events: AllianceEvent[];
  /** Swordland: lets the table be narrowed to one SSL season */
  seasons?: SwordlandSeason[];
}

const ALL = 'all';

const formatPoints = (points: number) => (points > 0 ? `+${points}` : String(points));

/** How reliably each player showed up in the completed events: assigned +10 / -10, substitutes +5 / 0 */
export default function ReliabilityStats({ events, seasons = [] }: ReliabilityStatsProps) {
  const [filter, setFilter] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<EventPlayer[] | null>(null);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const completed = useMemo(() => events.filter((e) => e.status === 'completed' && e.id !== undefined), [events]);
  const completedKey = completed.map((e) => e.id).join(',');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const loaded = await getEventPlayersOfEvents(completed.map((e) => e.id!));
        const ids = [...new Set(loaded.filter((r) => r.playerId != null).map((r) => String(r.playerId)))];
        const found = await getPlayersByIds(ids);
        if (!isMounted) return;
        setRows(loaded);
        setPlayers(new Map(found.map((p) => [String(p.id), p])));
        setError(null);
      } catch (err) {
        console.error('Failed to load reliability stats:', err);
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load the statistics');
      }
    })();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedKey]);

  // Only seasons with a completed event are worth filtering by
  const seasonOptions = seasons.filter((s) => completed.some((e) => e.seasonId === s.id));

  const summary = useMemo(() => {
    if (!rows) return [];
    const shown = completed.filter((e) => filter === ALL || String(e.seasonId ?? '') === filter);
    const eventIds = new Set(shown.map((e) => e.id));
    // The latest event's points are shown next to each total
    const latest = [...shown].sort(
      (a, b) => new Date(b.startsAt ?? 0).getTime() - new Date(a.startsAt ?? 0).getTime(),
    )[0];
    return summarizeReliability(
      rows.filter((r) => eventIds.has(r.alliance_event_id)),
      latest?.id,
    );
  }, [rows, completed, filter]);

  // Rank stays the overall one while searching (name, current name or alias)
  const ranked = summary.map((entry, index) => ({ entry, rank: index + 1 }));
  const query = search.trim().toLowerCase();
  const visible = query
    ? ranked.filter(({ entry }) => {
        const player = entry.playerId ? players.get(entry.playerId) : undefined;
        return [entry.name, player?.name, player?.aliasName].some((n) => n?.toLowerCase().includes(query));
      })
    : ranked;

  const eventCount = completed.filter((e) => filter === ALL || String(e.seasonId ?? '') === filter).length;

  if (completed.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Player Reliability</h2>
          <p className={styles.subtitle}>
            {eventCount} completed event{eventCount === 1 ? '' : 's'} · showed up{' '}
            {formatPoints(RELIABILITY_POINTS.showedUp)}, no-show {formatPoints(RELIABILITY_POINTS.noShow)}, substitute
            showed up {formatPoints(RELIABILITY_POINTS.substituteShowedUp)}, substitute missed{' '}
            {RELIABILITY_POINTS.substituteNoShow}
          </p>
        </div>
        {seasonOptions.length > 0 && (
          <label className={styles.filter}>
            <span>Show</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={styles.select}>
              <option value={ALL}>All events</option>
              {seasonOptions.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  SSL {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error ? (
        <p className={styles.message}>Couldn&apos;t load the statistics: {error}</p>
      ) : !rows ? (
        <p className={styles.message}>Loading statistics...</p>
      ) : summary.length === 0 ? (
        <p className={styles.message}>No players in these events.</p>
      ) : (
        <>
        <div className={styles.searchWrapper}>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            aria-label="Search players"
          />
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => setSearch('')}
            disabled={!search}
            aria-label="Clear search"
            title="Clear search"
          >
            ✕
          </button>
        </div>
        {visible.length === 0 ? (
          <p className={styles.message}>No players match &quot;{search.trim()}&quot;.</p>
        ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th title="Events the player was in">Events</th>
                <th title="Assigned to a building / team and showed up">Showed up</th>
                <th title="Assigned to a building / team but scored 0">No-shows</th>
                <th title="Substitute: showed up / times substitute">Substitute</th>
                <th title="Total points + points of the latest event">Points</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ entry, rank }) => {
                const player = entry.playerId ? players.get(entry.playerId) : undefined;
                return (
                  <tr key={entry.key}>
                    <td className={styles.rank}>{rank}</td>
                    <td className={styles.playerCell}>
                      {player ? (
                        <Link href={getPlayerHref(player)} className={styles.playerLink}>
                          <PlayerIdentity player={player} size={40} />
                        </Link>
                      ) : (
                        <span className={styles.deleted}>{entry.name}</span>
                      )}
                    </td>
                    <td>{entry.events}</td>
                    <td>{entry.assigned > 0 ? `${entry.showedUp} / ${entry.assigned}` : '–'}</td>
                    <td className={entry.noShows > 0 ? styles.noShows : undefined}>{entry.noShows}</td>
                    <td>{entry.substitutes > 0 ? `${entry.substitutesShowedUp} / ${entry.substitutes}` : '–'}</td>
                    <td className={styles.points}>
                      <span className={entry.points > 0 ? styles.positive : entry.points < 0 ? styles.negative : undefined}>
                        {entry.points}
                      </span>
                      {entry.latest !== null && (
                        <span
                          className={`${styles.latest} ${
                            entry.latest > 0 ? styles.positive : entry.latest < 0 ? styles.negative : ''
                          }`}
                          title="Points of the latest event"
                        >
                          ({entry.latest < 0 ? `−${Math.abs(entry.latest)}` : `+${entry.latest}`})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        </>
      )}
    </section>
  );
}
