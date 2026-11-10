'use client';

import Link from 'next/link';
import styles from './Navigation.module.css';

export default function Navigation() {
  return (
    <nav className={styles.navigation}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          KS Alliance Management
        </Link>
      </div>
    </nav>
  );
}
