'use client';

import { Player } from '@/types';
import Image from 'next/image';
import styles from './PlayerCard.module.css';
import { formatNumbers } from '@/utils/formatNumbers';
import { isImageUrl, truncateLevelLabel } from '@/utils/isImageUrl';

interface PlayerCardProps {
  player: Player;
  onEdit?: (player: Player) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}

export default function PlayerCard({ player, onEdit, onDelete, readOnly = false }: PlayerCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        {player.profilePhoto && (
          <Image
            src={player.profilePhoto}
            alt={player.name}
            className={styles.playerPhoto}
            width={64}
            height={64}
          />
        )}
        <div className={styles.headerInfo}>
          <h3 className={styles.name}>{player.name}</h3>
          <p className={styles.alias}>{player.aliasName}</p>
          <p className={styles.playerId}>ID: {player.playerId}</p>
          {player.kingdomId && <p className={styles.kingdom}>Kingdom: {player.kingdomId}</p>}
        </div>
      </div>

      <div className={styles.cardBody}>
        {player.levelImage && (
          <div className={styles.stat}>
            <span className={styles.label}>Level</span>
            <div className={styles.levelImage} title="Level">
              {isImageUrl(player.levelImage) ? (
                <Image src={player.levelImage} alt="Level" width={48} height={48} />
              ) : (
                <span>{truncateLevelLabel(player.levelImage)}</span>
              )}
            </div>
          </div>
        )}
        <div className={styles.stat}>
          <span className={styles.label}>Power</span>
          <span className={styles.value}>{formatNumbers(player.power)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Swordland</span>
          <span className={styles.value}>{formatNumbers(player.swordlandPower)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Tri Alliance</span>
          <span className={styles.value}>{formatNumbers(player.trialliancePower)}</span>
        </div>
      </div>

      {!readOnly && (
        <div className={styles.cardActions}>
          <button
            onClick={() => onEdit?.(player)}
            className={styles.editButton}
            title="Edit player"
          >
            ✎ Edit
          </button>
          <button
            onClick={() => onDelete?.(player.id)}
            className={styles.deleteButton}
            title="Delete player"
          >
            ✕ Remove
          </button>
        </div>
      )}
    </div>
  );
}
