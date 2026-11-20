/**
 * MightPulse usage is limited: one alliance can be pulled from the game (Add / Update Alliance)
 * at most once per cooldown. Enforced by /api/alliances/[kingdomId]/[tag]; the UI shows it.
 */
export const GAME_SYNC_COOLDOWN_MINUTES = 60;

const COOLDOWN_MS = GAME_SYNC_COOLDOWN_MINUTES * 60_000;

/** When the alliance can be pulled again; null when it can be now */
export function getNextGameSync(gameSyncedAt?: string | null, now = Date.now()): Date | null {
  if (!gameSyncedAt) return null;
  const next = new Date(gameSyncedAt).getTime() + COOLDOWN_MS;
  return Number.isFinite(next) && next > now ? new Date(next) : null;
}

/** "5 min ago", "2 h ago", "3 days ago" */
export function formatTimeAgo(date: string | Date, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(date).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "in 48 min" */
export function formatTimeUntil(date: Date, now = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((date.getTime() - now) / 60_000));
  return minutes < 60 ? `in ${minutes} min` : `in ${Math.ceil(minutes / 60)} h`;
}
