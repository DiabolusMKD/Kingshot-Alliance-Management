'use client';

import Link from 'next/link';
import Logo from './Logo';
import styles from './Navigation.module.css';

export default function Navigation() {
  return (
    <nav className={styles.navigation}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo} aria-label="Kingshot Alliance Management home">
          <Logo variant="header" />
        </Link>
      </div>
    </nav>
  );
}
