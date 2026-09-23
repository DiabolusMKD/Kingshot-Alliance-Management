'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import styles from './BackLink.module.css';

interface BackLinkProps {
  href: string;
  children: ReactNode;
}

export default function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link href={href} className={styles.backLink}>
      ← {children}
    </Link>
  );
}
