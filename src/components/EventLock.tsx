"use client";

import styles from "./EventLock.module.css";

const LockIcon = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    {/* Open shackle: swung up to the left */}
    <path d={open ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
  </svg>
);

/** "Completed" status shown above the points of a locked event */
export function CompletedStatus() {
  return (
    <div className={styles.statusRow}>
      <span className={styles.statusLabel}>Status</span>
      <span className={styles.completed}>
        <LockIcon open={false} />
        Completed
      </span>
    </div>
  );
}

/** Very bottom of a completed event: Unlock to edit it again, Lock to go back to the view */
export function LockToggleButton({ isLocked, onToggle }: { isLocked: boolean; onToggle: () => void }) {
  return (
    <div className={styles.lockRow}>
      <button type="button" className={styles.lockButton} onClick={onToggle}>
        <LockIcon open={isLocked} />
        {isLocked ? "Unlock" : "Lock"}
      </button>
    </div>
  );
}
