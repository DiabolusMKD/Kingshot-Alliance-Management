import { Player } from '@/types';

/** In-game alliance ranks, highest first */
export const ALLIANCE_RANKS = ['Leader', 'R4', 'R3', 'R2', 'R1'] as const;

/** Leader = 0 ... R1 = 4; unknown / no rank last */
export const getRankOrder = (rank?: string | null): number => {
  const index = ALLIANCE_RANKS.indexOf((rank ?? '') as (typeof ALLIANCE_RANKS)[number]);
  return index === -1 ? ALLIANCE_RANKS.length : index;
};

/** Highest rank first, then strongest */
export const compareByRankThenPower = (a: Player, b: Player) =>
  getRankOrder(a.allianceRank) - getRankOrder(b.allianceRank) || (b.power ?? 0) - (a.power ?? 0);
