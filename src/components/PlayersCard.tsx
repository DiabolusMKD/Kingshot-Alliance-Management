'use client';

import { useState } from 'react';
import { Player } from '@/types';
import PlayerCard from './PlayerCard';
import styles from './PlayersCard.module.css';
import { getPlayerHref } from '@/utils/playerLinks';

interface PlayersCardProps {
  players: Player[];
}

/** Player cards of one alliance (so no alliance shown); clicking one opens the player page */
export default function PlayersCard({ players }: PlayersCardProps) {
  const [searchTerm, setSearchTerm] = useState('');

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
            readOnly
            href={getPlayerHref(player)}
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
