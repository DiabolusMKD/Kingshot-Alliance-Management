'use client';

import { use, useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
import BackLink from '@/components/BackLink';
import GiftCodesManager from '@/components/GiftCodesManager';
import { Alliance } from '@/types';
import { getAlliancesByKingdomId } from '@/utils/allianceService';
import { findAllianceBySlug } from '@/utils/allianceSlug';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import { getPlayers } from '@/utils/playerService';
import styles from '@/components/GiftCodesManager.module.css';

interface GiftCodesPageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
}

export default function AllianceGiftCodesPage({ params }: GiftCodesPageProps) {
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
  }, [kingdomIdNumber, allianceSlug]);

  if (!alliance) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <BackLink href={`/${kingdomId}`}>Back to Kingdom {kingdomId}</BackLink>
          <div className={styles.container}>
            <p className={styles.muted}>{alliance === undefined ? 'Loading gift codes...' : 'Alliance not found.'}</p>
          </div>
        </main>
      </>
    );
  }

  const label = formatAllianceLabel(alliance);
  return (
    <GiftCodesManager
      loadPlayers={() => getPlayers(alliance.id, kingdomIdNumber)}
      loadKey={`alliance:${alliance.id}`}
      groupLabel={label}
      backHref={`/${kingdomId}/${allianceSlug}`}
      backLabel={`Back to ${label}`}
      emptyPlayersText="This alliance has no players yet."
    />
  );
}
