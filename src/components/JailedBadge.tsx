'use client';

import { Player } from '@/types';
import { JAIL_TRIALS } from '@/utils/jailTrials';
import { useJailTrial } from './useJail';
import styles from './JailedBadge.module.css';

interface JailedBadgeProps {
  player: Pick<Player, 'id' | 'kingdomId'>;
  /** `small` for photos in tables; the parent must be position: relative */
  size?: 'small' | 'default';
}

/** "Jailed" in the top-right corner of its (positioned) parent; hover shows the trial and its effects. */
export default function JailedBadge({ player, size = 'default' }: JailedBadgeProps) {
  const trialId = useJailTrial(player);
  const trial = JAIL_TRIALS.find((t) => t.id === trialId);
  if (!trial) return null;

  return (
    <span
      className={`${styles.badge} ${size === 'small' ? styles.small : ''}`}
      aria-label={`Jailed: ${trial.name}`}
    >
      Jailed
      <span className={styles.tooltip} role="tooltip">
        <strong>{trial.name}</strong>
        {trial.effects.map((effect) => (
          <span key={effect}>{effect}</span>
        ))}
      </span>
    </span>
  );
}
