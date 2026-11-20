'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPlayerHref } from '@/utils/playerLinks';
import ZoomableImage from './ZoomableImage';
import { Alliance, Player } from '@/types';
import styles from './PlayersTable.module.css';
import { formatNumbers } from '@/utils/formatNumbers';
import { isImageUrl, truncateLevelLabel } from '@/utils/isImageUrl';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import { MAX_ALLIANCE_PLAYERS } from '@/utils/constants';
import { getRankOrder } from '@/utils/allianceRank';
import { useCanEdit } from './EditMode';

interface PlayersTableProps {
  players: Player[];
  alliances: Alliance[];
  onEdit: (player: Player) => void;
  showAllianceColumn?: boolean;
  showAliasColumn?: boolean;
  showPlayerIdColumn?: boolean;
  /** In-game alliance rank (Leader, R4 ... R1) */
  showRankColumn?: boolean;
  /** Alliance column shows only the tag ([fKn]) instead of [fKn]You */
  allianceTagOnly?: boolean;
  /** The x/100 alliance capacity counter next to the search */
  showPlayerCount?: boolean;
  emptyMessage?: string;
}

export default function PlayersTable({
  players,
  alliances,
  onEdit,
  showAllianceColumn = true,
  showAliasColumn = true,
  showPlayerIdColumn = true,
  showRankColumn = true,
  allianceTagOnly = false,
  showPlayerCount = true,
  emptyMessage = 'No players found. Add a new player to get started!',
}: PlayersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const canEdit = useCanEdit();

  const getAllianceLabel = (player: Player) => {
    const alliance = alliances.find((a) => String(a.id) === String(player.allianceId));
    if (!alliance) return undefined;
    return allianceTagOnly ? `[${alliance.nameTag}]` : formatAllianceLabel(alliance);
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
              {showRankColumn && <th>Rank</th>}
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
                          <ZoomableImage src={player.levelImage} alt={`${player.name} level`} width={30} height={30} />
                        ) : (
                          <span>{truncateLevelLabel(player.levelImage)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <Link href={getPlayerHref(player)} className={styles.playerLink}>
                    {player.name}
                  </Link>
                </td>
                {showRankColumn && (
                  <td>
                    {player.allianceRank ? (
                      <span
                        className={`${styles.rankBadge} ${getRankOrder(player.allianceRank) <= 1 ? styles.rankHigh : ''}`}
                      >
                        {player.allianceRank}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                {showAliasColumn && <td>{player.aliasName}</td>}
                {showPlayerIdColumn && <td>{player.playerId}</td>}
                <td>{formatNumbers(player.power)}</td>
                {showAllianceColumn && <td>{getAllianceLabel(player) ?? '—'}</td>}
                <td>
                  <div className={styles.actions}>
                    <Link
                      href={getPlayerHref(player)}
                      className={styles.viewButton}
                      title="View player"
                      aria-label={`View ${player.name}`}
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
                    </Link>
                    {canEdit && (
                      <button
                        onClick={() => onEdit(player)}
                        className={styles.editButton}
                        title="Edit player"
                      >
                        ✎
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

    </div>
  );
}
