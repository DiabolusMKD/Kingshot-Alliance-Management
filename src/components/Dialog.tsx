'use client';

import { useEffect, useRef, ReactNode } from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Blocks every way of closing (X button, backdrop click, Esc) while true. */
  closeDisabled?: boolean;
  /** `large` = almost full screen, with the body filling the available height. */
  size?: 'default' | 'large';
}

export default function Dialog({ isOpen, title, onClose, children, closeDisabled = false, size = 'default' }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.showModal();
    } else if (dialogRef.current) {
      dialogRef.current.close();
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current && !closeDisabled) {
      onClose();
    }
  };

  // Esc fires a native `cancel` event; keep the dialog open when closing is disabled,
  // and otherwise route it through onClose so parent state stays in sync.
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    if (!closeDisabled) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={size === 'large' ? `${styles.dialog} ${styles.large}` : styles.dialog}
      onClick={handleBackdropClick}
      onCancel={handleCancel}
    >
      <div className={styles.content}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            onClick={onClose}
            className={styles.closeButton}
            disabled={closeDisabled}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div className={styles.body}>
          {children}
        </div>
      </div>
    </dialog>
  );
}
