'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navigation from '@/components/Navigation';
import BackLink from '@/components/BackLink';
import Dialog from '@/components/Dialog';
import AllianceForm from '@/components/AllianceForm';
import PlayerCard from '@/components/PlayerCard';
import { Alliance, Player } from '@/types';
import { getAlliancesByKingdomId, updateAlliance } from '@/utils/allianceService';
import { getPlayers } from '@/utils/playerService';
import { findAllianceBySlug } from '@/utils/allianceSlug';
import { DEFAULT_ALLIANCE_IMAGE_URL } from '@/utils/constants';
import styles from './page.module.css';

const PLAYERS_PREVIEW_LIMIT = 6;

interface AlliancePageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
}

export default function AlliancePage({ params }: AlliancePageProps) {
  const { kingdomId, allianceSlug } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  const [alliance, setAlliance] = useState<Alliance | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

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

  useEffect(() => {
    if (!alliance) return;

    let isMounted = true;

    getPlayers(alliance.id, kingdomIdNumber)
      .then((allPlayers) => {
        if (isMounted) setPlayers(allPlayers.sort((a, b) => b.power - a.power));
      })
      .catch((error) => {
        console.error('Failed to load players:', error);
      });

    return () => {
      isMounted = false;
    };
  }, [alliance, kingdomIdNumber]);

  const openEditDialog = () => setIsEditDialogOpen(true);
  const closeEditDialog = () => setIsEditDialogOpen(false);

  const handleUpdateAlliance = async (allianceData: Omit<Alliance, 'id' | 'created_at'>) => {
    if (!alliance) return;
    const updated = await updateAlliance(alliance.id, allianceData);
    setAlliance(updated);
    closeEditDialog();
  };

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
          <BackLink href={`/${kingdomId}`}>Back to Kingdom {kingdomId}</BackLink>
          <div className={styles.container}>
            <div className={styles.content}>
              <p className={styles.description}>Alliance not found.</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const previewPlayers = players.slice(0, PLAYERS_PREVIEW_LIMIT);
  const hasMorePlayers = players.length > PLAYERS_PREVIEW_LIMIT;

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <BackLink href={`/${kingdomId}`}>Back to Kingdom {kingdomId}</BackLink>
        <div className={styles.container}>
          <div className={styles.content}>
            <Image
              src={alliance.allianceImageUrl || DEFAULT_ALLIANCE_IMAGE_URL}
              alt={alliance.name}
              className={styles.image}
              width={300}
              height={100}
            />
            <h1 className={styles.title}>Welcome to [{alliance.nameTag}]{alliance.name}</h1>
            {alliance.description && (
              <p className={styles.description}>{alliance.description}</p>
            )}
            <div className={styles.ctas}>
              <button className={styles.ctaButton} onClick={openEditDialog}>
                Edit
              </button>
              <Link href={`/${kingdomId}/${allianceSlug}/events`} className={styles.ctaButton}>
                Events
              </Link>
            </div>
          </div>

          {previewPlayers.length > 0 && (
            <div className={styles.playersSection}>
              <div className={styles.playersSectionHeader}>
                <h2 className={styles.playersSectionTitle}>Players</h2>
              </div>
              <div className={styles.playersGrid}>
                {previewPlayers.map((player) => (
                  <PlayerCard key={player.id} player={player} readOnly />
                ))}
              </div>
              {hasMorePlayers && (
                <Link href={`/${kingdomId}/${allianceSlug}/players`} className={styles.viewAllButton}>
                  View All
                </Link>
              )}
            </div>
          )}
        </div>
      </main>

      <Dialog isOpen={isEditDialogOpen} title="Edit Alliance" onClose={closeEditDialog}>
        <AllianceForm
          key={alliance.id}
          kingdomId={kingdomIdNumber}
          alliance={alliance}
          onSubmit={handleUpdateAlliance}
          onCancel={closeEditDialog}
        />
      </Dialog>
    </>
  );
}
