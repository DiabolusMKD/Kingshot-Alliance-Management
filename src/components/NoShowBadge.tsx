'use client';

import styles from './NoShowBadge.module.css';

/** Row highlight for a player who was assigned in the season's last event but scored 0 */
export const noShowRowClass = styles.row;

/** "no-show last event" next to the player's name */
export default function NoShowBadge() {
  return (
    <span className={styles.badge} title="Assigned to a building in the season's last event but scored 0 points">
      no-show last event
    </span>
  );
}
