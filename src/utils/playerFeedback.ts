import { Alliance, Player } from '@/types';
import { formatAllianceLabel } from './allianceLabel';

/**
 * Toast text after adding/saving a player, naming where they ended up, e.g.
 * "Added Choo to [ABC]Alliance (new alliance created)".
 */
export function describeSavedPlayer(
  verb: 'Added' | 'Saved',
  player: Pick<Player, 'name' | 'aliasName' | 'allianceId'>,
  alliances: Alliance[],
  createdAlliance?: Alliance
): string {
  const name = player.aliasName || player.name;
  const alliance =
    createdAlliance ?? alliances.find((a) => String(a.id) === String(player.allianceId));
  if (!alliance) return `${verb} ${name} (no alliance)`;
  return `${verb} ${name} in ${formatAllianceLabel(alliance)}${createdAlliance ? ' (new alliance created)' : ''}`;
}
