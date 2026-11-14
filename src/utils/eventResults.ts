import { EventResults, LegionResultKey } from '@/types';

export const LEGION_RESULT_KEYS: LegionResultKey[] = ['legion_1', 'legion_2'];

/**
 * Parses alliance_event.notes into event results.
 * Returns null when notes are empty or hold something else (e.g. plain text notes).
 */
export function parseEventResults(notes?: string | null): EventResults | null {
  if (!notes) return null;

  try {
    const parsed = JSON.parse(notes);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!LEGION_RESULT_KEYS.some((key) => key in parsed)) return null;

    const results = {} as EventResults;
    LEGION_RESULT_KEYS.forEach((key) => {
      const legion = parsed[key];
      results[key] = {
        status: typeof legion?.status === 'string' ? legion.status : null,
        mvp: typeof legion?.mvp === 'string' ? legion.mvp : null,
        players_points: Array.isArray(legion?.players_points) ? legion.players_points : [],
      };
    });
    return results;
  } catch {
    return null;
  }
}

export function serializeEventResults(results: EventResults): string {
  return JSON.stringify(results);
}

/** The notes as a JSON object; plain-text notes are kept under `text` */
function parseNotesObject(notes?: string | null): Record<string, unknown> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return { text: notes };
}

/** Reads one extra setting (e.g. powerMode) stored next to the results in the notes */
export function getNotesField(notes: string | null | undefined, field: string): unknown {
  return parseNotesObject(notes)[field];
}

/**
 * Builds the new notes from the existing ones: results replace the legion entries
 * (kept as they are when not given) and `fields` are set next to them.
 */
export function buildEventNotes(
  notes: string | null | undefined,
  { results, fields = {} }: { results?: EventResults; fields?: Record<string, unknown> },
): string {
  return JSON.stringify({ ...parseNotesObject(notes), ...(results ?? {}), ...fields });
}

/** Flattens players_points of all legions into a { playerId: points } map */
export function getResultsPoints(results: EventResults): Record<string, number> {
  const points: Record<string, number> = {};
  LEGION_RESULT_KEYS.forEach((key) => {
    results[key].players_points.forEach((entry) => {
      Object.entries(entry).forEach(([playerId, value]) => {
        if (typeof value === 'number') points[playerId] = value;
      });
    });
  });
  return points;
}
