'use client';

import { useState } from 'react';
import ZoomableImage from './ZoomableImage';
import { Alliance, Player } from '@/types';
import styles from './PlayersTable.module.css';
import { formatNumbers } from '@/utils/formatNumbers';
import { isImageUrl, truncateLevelLabel } from '@/utils/isImageUrl';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import { MAX_ALLIANCE_PLAYERS } from '@/utils/constants';
import Dialog from './Dialog';
import PlayerCard from './PlayerCard';

interface PlayersTableProps {
  players: Player[];
  alliances: Alliance[];
  onEdit: (player: Player) => void;
  /** Omit to hide the "remove from alliance" action */
  onDelete?: (id: string) => void;
  showAllianceColumn?: boolean;
  showAliasColumn?: boolean;
  showPlayerIdColumn?: boolean;
  /** The x/100 alliance capacity counter next to the search */
  showPlayerCount?: boolean;
  emptyMessage?: string;
}

export default function PlayersTable({
  players,
  alliances,
  onEdit,
  onDelete,
  showAllianceColumn = true,
  showAliasColumn = true,
  showPlayerIdColumn = true,
  showPlayerCount = true,
  emptyMessage = 'No players found. Add a new player to get started!',
}: PlayersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewedPlayer, setViewedPlayer] = useState<Player | null>(null);

  const getAllianceLabel = (player: Player) => {
    const alliance = alliances.find((a) => String(a.id) === String(player.allianceId));
    return alliance ? formatAllianceLabel(alliance) : undefined;
  };

  const handleViewEdit = (player: Player) => {
    setViewedPlayer(null);
    onEdit(player);
  };

  const handleViewDelete = (id: string) => {
    setViewedPlayer(null);
    onDelete?.(id);
  };

  const filteredPlayers = players.filter(
    (player) =>
      player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.aliasName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(player.playerId).includes(searchTerm)
  )

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
        {showPlayerCount && (
          <span
            className={`${styles.playerCount} ${players.length >= MAX_ALLIANCE_PLAYERS ? styles.playerCountFull : ''}`}
            title={`${players.length} of ${MAX_ALLIANCE_PLAYERS} alliance slots used`}
          >
            {players.length}/{MAX_ALLIANCE_PLAYERS} players
          </span>
        )}
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>No.</th>
              <th>Photo</th>
              <th>Name</th>
              {showAliasColumn && <th>Alias</th>}
              {showPlayerIdColumn && <th>Player ID</th>}
              <th>Power</th>
              {showAllianceColumn && <th>Alliance</th>}
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
                      <ZoomableImage
                        src={player.profilePhoto}
                        alt={player.name}
                        className={styles.playerPhoto}
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className={styles.noPhoto}>—</div>
                    )}
                    {player.levelImage && (
                      <div className={styles.levelBadge} title="Level">
                        {isImageUrl(player.levelImage) ? (
                          <ZoomableImage src={player.levelImage} alt={`${player.name} level`} width={24} height={24} />
                        ) : (
                          <span>{truncateLevelLabel(player.levelImage)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td>{player.name}</td>
                {showAliasColumn && <td>{player.aliasName}</td>}
                {showPlayerIdColumn && <td>{player.playerId}</td>}
                <td>{formatNumbers(player.power)}</td>
                {showAllianceColumn && <td>{getAllianceLabel(player) ?? '—'}</td>}
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
                    {onDelete && (
                      <button
                        onClick={() => onDelete(player.id)}
                        className={styles.deleteButton}
                        title="Remove player from alliance"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPlayers.length === 0 && (
          <div className={styles.empty}>
            <p>{searchTerm ? 'No players match your search.' : emptyMessage}</p>
          </div>
        )}
      </div>

      <Dialog
        isOpen={!!viewedPlayer}
        title={viewedPlayer?.name ?? 'Player'}
        onClose={() => setViewedPlayer(null)}
      >
        {viewedPlayer && (
          <PlayerCard
            player={viewedPlayer}
            onEdit={handleViewEdit}
            onDelete={onDelete ? handleViewDelete : undefined}
            allianceLabel={getAllianceLabel(viewedPlayer)}
          />
        )}
      </Dialog>
    </div>
  );
}
