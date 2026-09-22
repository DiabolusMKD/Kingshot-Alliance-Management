'use client';

import { Player } from '@/types';
import styles from './PlayerCard.module.css';
import { formatNumbers } from '@/utils/formatNumbers';
import { isImageUrl, truncateLevelLabel } from '@/utils/isImageUrl';

interface PlayerCardProps {
  player: Player;
  onEdit: (player: Player) => void;
  onDelete: (id: string) => void;
}

export default function PlayerCard({ player, onEdit, onDelete }: PlayerCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        {player.profilePhoto && (
          <img
            src={player.profilePhoto}
            alt={player.name}
            className={styles.playerPhoto}
          />
        )}
        <div className={styles.headerInfo}>
          <h3 className={styles.name}>{player.name}</h3>
          <p className={styles.alias}>{player.aliasName}</p>
          <p className={styles.playerId}>ID: {player.playerId}</p>
        </div>
        {player.levelImage && (
          <div className={styles.levelImage} title="Level">
            {isImageUrl(player.levelImage) ? (
              <img src={player.levelImage} alt="Level" />
            ) : (
              <span>{truncateLevelLabel(player.levelImage)}</span>
            )}
          </div>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.stat}>
          <span className={styles.label}>Swordland</span>
          <span className={styles.value}>{formatNumbers(player.swordlandPower)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Tri Alliance</span>
          <span className={styles.value}>{formatNumbers(player.trialliancePower)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Power</span>
          <span className={styles.value}>{formatNumbers(player.power)}</span>
        </div>
        {player.kingdomId && (
          <div className={styles.stat}>
            <span className={styles.label}>Kingdom</span>
            <span className={styles.value}>{player.kingdomId}</span>
          </div>
        )}
      </div>

      <div className={styles.cardActions}>
        <button
          onClick={() => onEdit(player)}
          className={styles.editButton}
          title="Edit player"
        >
          ✎ Edit
        </button>
        <button
          onClick={() => onDelete(player.id)}
          className={styles.deleteButton}
          title="Delete player"
        >
          ✕ Remove
        </button>
      </div>
    </div>
  );
}
