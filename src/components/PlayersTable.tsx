'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Player } from '@/types';
import styles from './PlayersTable.module.css';
import { formatNumbers } from '@/utils/formatNumbers';
import { isImageUrl, truncateLevelLabel } from '@/utils/isImageUrl';
import Dialog from './Dialog';
import PlayerCard from './PlayerCard';

interface PlayersTableProps {
  players: Player[];
  onEdit: (player: Player) => void;
  onDelete: (id: string) => void;
}

export default function PlayersTable({ players, onEdit, onDelete }: PlayersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewedPlayer, setViewedPlayer] = useState<Player | null>(null);

  const handleViewEdit = (player: Player) => {
    setViewedPlayer(null);
    onEdit(player);
  };

  const handleViewDelete = (id: string) => {
    setViewedPlayer(null);
    onDelete(id);
  };

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
              <th>Power</th>
              <th>Swordland</th>
              <th>Tri Alliance</th>
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
                      <Image
                        src={player.profilePhoto}
                        alt={player.name}
                        className={styles.playerPhoto}
                        title={player.name}
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className={styles.noPhoto}>—</div>
                    )}
                    {player.levelImage && (
                      <div className={styles.levelBadge} title="Level">
                        {isImageUrl(player.levelImage) ? (
                          <Image src={player.levelImage} alt="Level" width={24} height={24} />
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
                <td>{formatNumbers(player.power)}</td>
                <td>{formatNumbers(player.swordlandPower)}</td>
                <td>{formatNumbers(player.trialliancePower)}</td>
                <td>
                  <div className={styles.actions}>
                    <button
                      onClick={() => setViewedPlayer(player)}
                      className={styles.viewButton}
                      title="View player"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
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
                      title="Remove player from alliance"
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

      <Dialog
        isOpen={!!viewedPlayer}
        title={viewedPlayer?.name ?? 'Player'}
        onClose={() => setViewedPlayer(null)}
      >
        {viewedPlayer && (
          <PlayerCard player={viewedPlayer} onEdit={handleViewEdit} onDelete={handleViewDelete} />
        )}
      </Dialog>
    </div>
  );
}
