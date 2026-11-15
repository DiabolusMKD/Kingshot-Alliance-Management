import { EventResults, LegionResultKey } from '@/types';

export const LEGION_RESULT_KEYS: LegionResultKey[] = ['legion_1', 'legion_2'];

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
