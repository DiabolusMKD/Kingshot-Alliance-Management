'use client';

import { useState } from 'react';
import { Alliance, Player } from '@/types';
import PlayerCard from './PlayerCard';
import styles from './PlayersCard.module.css';
import { formatAllianceLabel } from '@/utils/allianceLabel';

interface PlayersCardProps {
  players: Player[];
  alliances: Alliance[];
  onEdit: (player: Player) => void;
  onDelete: (id: string) => void;
}

export default function PlayersCard({ players, alliances, onEdit, onDelete }: PlayersCardProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const getAllianceLabel = (player: Player) => {
    const alliance = alliances.find((a) => String(a.id) === String(player.allianceId));
    return alliance ? formatAllianceLabel(alliance) : undefined;
  };

  const filteredPlayers = players.filter(
    (player) =>
      player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.aliasName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(player.playerId).includes(searchTerm)
  );

  return (
    <div className={styles.container}>
      <div className={styles.searchWrapper}>
        <input
          type="text"
          placeholder="Search by player name, alias, or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
        <button className={styles.clearButton} onClick={() => setSearchTerm('')} title="Clear search">
          ✕
        </button>
      </div>

      <div className={styles.grid}>
        {filteredPlayers.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            onEdit={onEdit}
            onDelete={onDelete}
            allianceLabel={getAllianceLabel(player)}
          />
        ))}
      </div>

      {filteredPlayers.length === 0 && (
        <div className={styles.empty}>
          <p>{searchTerm ? 'No players match your search.' : 'No players found. Add a new player to get started!'}</p>
        </div>
      )}
    </div>
  );
}
