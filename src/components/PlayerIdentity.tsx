'use client';

import { ReactNode } from 'react';
import { Player } from '@/types';
import ZoomableImage from './ZoomableImage';
import { isImageUrl, truncateLevelLabel } from '@/utils/isImageUrl';
import styles from './PlayerIdentity.module.css';

interface PlayerIdentityProps {
  player: Player;
  /** Shown instead of player.name (e.g. the alias) */
  label?: string;
  /** Photo size in px; the level image is a bit smaller */
  size?: number;
  /** Extra content after the name (badges...) */
  children?: ReactNode;
}

/** Player photo, level image next to it, and the name - used in event tables and cards */
export default function PlayerIdentity({ player, label, size = 32, children }: PlayerIdentityProps) {
  const name = label || player.name;
  const levelSize = Math.round(size * 0.75);

  return (
    <div className={styles.identity}>
      {player.profilePhoto ? (
        <ZoomableImage
          src={player.profilePhoto}
          alt={name}
          width={size}
          height={size}
          className={styles.photo}
        />
      ) : (
        <span className={styles.photoPlaceholder} style={{ width: size, height: size }} aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
      )}

      {player.levelImage &&
        (isImageUrl(player.levelImage) ? (
          <ZoomableImage
            src={player.levelImage}
            alt={`${name} level`}
            width={levelSize}
            height={levelSize}
            className={styles.level}
          />
        ) : (
          <span className={styles.levelLabel} style={{ width: levelSize, height: levelSize }} title="Level">
            {truncateLevelLabel(player.levelImage)}
          </span>
        ))}

      <span className={styles.name}>{name}</span>
      {children}
    </div>
  );
}
