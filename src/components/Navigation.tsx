'use client';

import Link from 'next/link';
import Logo from './Logo';
import { disableEditMode, useCanEdit, useKingOf, useLeaderOf } from './EditMode';
import styles from './Navigation.module.css';

export default function Navigation() {
  const canEdit = useCanEdit();
  const kingOf = useKingOf();
  const leaderOf = useLeaderOf();

  return (
    <nav className={styles.navigation}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo} aria-label="Kingshot Alliance Management home">
          <Logo variant="header" />
        </Link>
        {/* Only visible to whoever turned editing on (?mode=<edit key> or a King key) */}
        {(canEdit || kingOf !== null || leaderOf !== null) && (
          <span className={styles.editBadge}>
            <span className={styles.editDot} aria-hidden="true" />
            {canEdit ? (
              'Editing on'
            ) : (
              <>
                {kingOf !== null && (
                  <Link href={`/${kingOf}`} className={styles.editKingLink}>
                    King of Kingdom {kingOf}
                  </Link>
                )}
                {kingOf !== null && leaderOf !== null && ' · '}
                {leaderOf !== null && 'Alliance Leader'}
              </>
            )}
            <button
              type="button"
              className={styles.editExit}
              onClick={() => disableEditMode()}
              title="Back to view only (open a page with the edit link to edit again)"
            >
              Exit
            </button>
          </span>
        )}
      </div>
    </nav>
  );
}
