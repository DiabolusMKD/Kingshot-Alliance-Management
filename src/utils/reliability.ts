import { EventPlayer } from '@/types';

/** Reliability points of one player in one completed event */
export const RELIABILITY_POINTS = {
  /** Assigned (building / team) and showed up */
  showedUp: 10,
  /** Assigned but scored 0: said they'd be online and didn't come */
  noShow: -10,
  /** Substitute who showed up */
  substituteShowedUp: 5,
  /** Substitute who didn't show up */
  substituteNoShow: 0,
} as const;

/** Points of a completed event's player: showing up = more than 0 points */
export function getReliability(isSubstitute: boolean, score: number | null | undefined): number {
  const showedUp = (score ?? 0) > 0;
  if (isSubstitute) return showedUp ? RELIABILITY_POINTS.substituteShowedUp : RELIABILITY_POINTS.substituteNoShow;
  return showedUp ? RELIABILITY_POINTS.showedUp : RELIABILITY_POINTS.noShow;
}

/** Saved reliability, or computed from the points (rows saved before the column existed) */
export function getRowReliability(row: Pick<EventPlayer, 'isSubstitute' | 'score' | 'reliability'>): number {
  return row.reliability ?? getReliability(row.isSubstitute, row.score);
}

/** Assigned (not a substitute) but didn't show up */
export function isNoShow(row: Pick<EventPlayer, 'isSubstitute' | 'score'>): boolean {
  return !row.isSubstitute && (row.score ?? 0) <= 0;
}

export interface PlayerReliability {
  /** player.id, or the saved name for deleted players */
  key: string;
  playerId: string | null;
  name: string;
  events: number;
  /** Assigned to a building / team */
  assigned: number;
  showedUp: number;
  noShows: number;
  substitutes: number;
  substitutesShowedUp: number;
  points: number;
  /** Event points (score) summed over all the events */
  score: number;
  /** Points of the latest event (null when the player wasn't in it) */
  latest: number | null;
}

/** Totals per player over completed events' rows: most reliability points first, then most event points; `latestEventId` gives each player's last change */
export function summarizeReliability(rows: EventPlayer[], latestEventId?: number): PlayerReliability[] {
  const byPlayer = new Map<string, PlayerReliability>();

  rows.forEach((row) => {
    const playerId = row.playerId != null ? String(row.playerId) : null;
    const key = playerId ?? `name:${row.playerName ?? ''}`;
    const entry =
      byPlayer.get(key) ??
      ({
        key,
        playerId,
        name: row.playerName ?? 'Unknown',
        events: 0,
        assigned: 0,
        showedUp: 0,
        noShows: 0,
        substitutes: 0,
        substitutesShowedUp: 0,
        points: 0,
        score: 0,
        latest: null,
      } satisfies PlayerReliability);

    const showedUp = (row.score ?? 0) > 0;
    entry.events += 1;
    if (row.isSubstitute) {
      entry.substitutes += 1;
      if (showedUp) entry.substitutesShowedUp += 1;
    } else {
      entry.assigned += 1;
      if (showedUp) entry.showedUp += 1;
      else entry.noShows += 1;
    }
    entry.points += getRowReliability(row);
    entry.score += row.score ?? 0;
    if (row.alliance_event_id === latestEventId) entry.latest = getRowReliability(row);
    byPlayer.set(key, entry);
  });

  return [...byPlayer.values()].sort(
    (a, b) => b.points - a.points || b.score - a.score || a.name.localeCompare(b.name),
  );
}
