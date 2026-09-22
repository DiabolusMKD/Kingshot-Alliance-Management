'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Navigation.module.css';

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <nav className={styles.navigation}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          Kingshot Alliance Management
        </Link>
        <ul className={styles.links}>
          <li>
            <Link
              href="/"
              className={`${styles.link} ${isActive('/') ? styles.active : ''}`}
            >
              Home
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
