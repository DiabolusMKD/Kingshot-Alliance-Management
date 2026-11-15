import { Player } from '@/types';

/** Player page with all data + event history: /[kingdomId]/players/[in-game id] */
export const getPlayerHref = (player: Pick<Player, 'kingdomId' | 'playerId' | 'id'>) =>
  `/${player.kingdomId}/players/${encodeURIComponent(String(player.playerId || player.id))}`;
