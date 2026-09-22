'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navigation from '@/components/Navigation';
import { Alliance } from '@/types';
import { getAlliancesByKingdomId } from '@/utils/allianceService';
import { findAllianceBySlug } from '@/utils/allianceSlug';
import { DEFAULT_ALLIANCE_IMAGE_URL } from '@/utils/constants';
import styles from './page.module.css';

interface AlliancePageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
}

export default function AlliancePage({ params }: AlliancePageProps) {
  const { kingdomId, allianceSlug } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  const [alliance, setAlliance] = useState<Alliance | null | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;

    getAlliancesByKingdomId(kingdomIdNumber)
      .then((alliances) => {
        if (isMounted) setAlliance(findAllianceBySlug(alliances, allianceSlug) || null);
      })
      .catch((error) => {
        console.error('Failed to load alliance:', error);
        if (isMounted) setAlliance(null);
      });

    return () => {
      isMounted = false;
    };
  }, [kingdomId, allianceSlug]);

  if (alliance === undefined) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <div className={styles.container}>
            <p>Loading alliance...</p>
          </div>
        </main>
      </>
    );
  }

  if (alliance === null) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.content}>
              <p className={styles.description}>Alliance not found.</p>
              <Link href={`/${kingdomId}`} className={styles.backLink}>
                ← Back to Kingdom {kingdomId}
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.content}>
            <Link href={`/${kingdomId}`} className={styles.backLink}>
              ← Back to Kingdom {kingdomId}
            </Link>
            <Image
              src={alliance.allianceImageUrl || DEFAULT_ALLIANCE_IMAGE_URL}
              alt={alliance.name}
              className={styles.image}
              width={300}
              height={100}
            />
            <h1 className={styles.title}>Welcome to {alliance.name}</h1>
            {alliance.description && (
              <p className={styles.description}>{alliance.description}</p>
            )}
            <div className={styles.ctas}>
              <Link href={`/${kingdomId}/${allianceSlug}/players`} className={styles.ctaButton}>
                Players
              </Link>
              <Link href={`/${kingdomId}/${allianceSlug}/events`} className={styles.ctaButton}>
                Events
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
