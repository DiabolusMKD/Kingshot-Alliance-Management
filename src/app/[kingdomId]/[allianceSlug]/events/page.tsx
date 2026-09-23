'use client';

import { use } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import BackLink from '@/components/BackLink';
import styles from './page.module.css';

interface EventsPageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
}

export default function EventsPage({ params }: EventsPageProps) {
  const { kingdomId, allianceSlug } = use(params);

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <BackLink href={`/${kingdomId}/${allianceSlug}`}>Back to Alliance</BackLink>
        <div className={styles.container}>
          <h1 className={styles.title}>Events</h1>

          <div className={styles.eventsGrid}>
            <Link href={`/${kingdomId}/${allianceSlug}/events/swordland`} className={styles.eventCard}>
              <div className={styles.cardContent}>
                <h2 className={styles.cardTitle}>Swordland</h2>
                <p className={styles.cardDescription}>
                  Manage legions and organize players for Swordland events
                </p>
              </div>
              <div className={styles.cardIcon}>⚔️</div>
            </Link>

            <Link href={`/${kingdomId}/${allianceSlug}/events/tri-alliance`} className={styles.eventCard}>
              <div className={styles.cardContent}>
                <h2 className={styles.cardTitle}>Tri Alliance</h2>
                <p className={styles.cardDescription}>
                  Coordinate alliances and plan strategies for Tri Alliance events
                </p>
              </div>
              <div className={styles.cardIcon}>🛡️</div>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
