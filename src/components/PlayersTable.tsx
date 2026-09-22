'use client';

import { useState } from 'react';
import { Player } from '@/types';
import styles from './PlayersTable.module.css';
import { formatNumbers } from '@/utils/formatNumbers';
import { isImageUrl, truncateLevelLabel } from '@/utils/isImageUrl';

interface PlayersTableProps {
  players: Player[];
  onEdit: (player: Player) => void;
  onDelete: (id: string) => void;
}

export default function PlayersTable({ players, onEdit, onDelete }: PlayersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPlayers = players.filter(
    (player) =>
      player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.aliasName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className={styles.container}>
      <div className={styles.searchWrapper}>
        <input
          type="text"
          placeholder="Search by player name or alias..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
        <button className={styles.clearButton} onClick={() => setSearchTerm('')} title="Clear search">
          ✕
        </button>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>No.</th>
              <th>Photo</th>
              <th>Player ID</th>
              <th>Name</th>
              <th>Alias</th>
              <th>Swordland</th>
              <th>Tri Alliance</th>
              <th>Power</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.map((player) => (
              <tr key={player.id}>
                <td>{filteredPlayers.indexOf(player) + 1}</td>
                <td>
                  <div className={styles.photoWrapper}>
                    {player.profilePhoto ? (
                      <img
                        src={player.profilePhoto}
                        alt={player.name}
                        className={styles.playerPhoto}
                        title={player.name}
                      />
                    ) : (
                      <div className={styles.noPhoto}>—</div>
                    )}
                    {player.levelImage && (
                      <div className={styles.levelBadge} title="Level">
                        {isImageUrl(player.levelImage) ? (
                          <img src={player.levelImage} alt="Level" />
                        ) : (
                          <span>{truncateLevelLabel(player.levelImage)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td>{player.playerId}</td>
                <td>{player.name}</td>
                <td>{player.aliasName}</td>
                <td>{formatNumbers(player.swordlandPower)}</td>
                <td>{formatNumbers(player.trialliancePower)}</td>
                <td>{formatNumbers(player.power)}</td>
                <td>
                  <div className={styles.actions}>
                    <button
                      onClick={() => onEdit(player)}
                      className={styles.editButton}
                      title="Edit player"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => onDelete(player.id)}
                      className={styles.deleteButton}
                      title="Deactivate player"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPlayers.length === 0 && (
          <div className={styles.empty}>
            <p>{searchTerm ? 'No players match your search.' : 'No players found. Add a new player to get started!'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
