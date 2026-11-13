'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navigation from '@/components/Navigation';
import Breadcrumbs from '@/components/Breadcrumbs';
import Dialog from '@/components/Dialog';
import AllianceForm from '@/components/AllianceForm';
import PlayerForm, { PlayerFormSubmitMeta } from '@/components/PlayerForm';
import { describeSavedPlayer } from '@/utils/playerFeedback';
import { useToast } from '@/components/Toast';
import { usePlayersUpdater } from '@/components/usePlayersUpdater';
import PlayerCard from '@/components/PlayerCard';
import { Alliance, Player } from '@/types';
import { getAlliancesByKingdomId, updateAlliance } from '@/utils/allianceService';
import { createPlayer, getPlayers, updatePlayer } from '@/utils/playerService';
import { findAllianceBySlug } from '@/utils/allianceSlug';
import { DEFAULT_ALLIANCE_IMAGE_URL, MAX_ALLIANCE_PLAYERS } from '@/utils/constants';
import styles from './page.module.css';

// Two full rows at the widest layout (4 columns). Smaller breakpoints show fewer
// (6 / 4) by hiding the extra cards in CSS, see .playersGrid in page.module.css.
const PLAYERS_PREVIEW_LIMIT = 8;

const sortByPower = (players: Player[]) => [...players].sort((a, b) => b.power - a.power);

interface AlliancePageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
}

export default function AlliancePage({ params }: AlliancePageProps) {
  const { kingdomId, allianceSlug } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  const toast = useToast();
  const [alliance, setAlliance] = useState<Alliance | null | undefined>(undefined);
  const [kingdomAlliances, setKingdomAlliances] = useState<Alliance[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  // Avoids flashing the "no players" message before the first load finishes
  const [hasLoadedPlayers, setHasLoadedPlayers] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddPlayerDialogOpen, setIsAddPlayerDialogOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getAlliancesByKingdomId(kingdomIdNumber)
      .then((alliances) => {
        if (!isMounted) return;
        setKingdomAlliances(alliances);
        setAlliance(findAllianceBySlug(alliances, allianceSlug) || null);
      })
      .catch((error) => {
        console.error('Failed to load alliance:', error);
        if (isMounted) setAlliance(null);
      });

    return () => {
      isMounted = false;
    };
  }, [kingdomId, allianceSlug]);

  const loadPlayers = (allianceId: number) => getPlayers(allianceId, kingdomIdNumber).then(sortByPower);

  useEffect(() => {
    if (!alliance) return;

    let isMounted = true;

    getPlayers(alliance.id, kingdomIdNumber)
      .then((allPlayers) => {
        if (isMounted) setPlayers(sortByPower(allPlayers));
      })
      .catch((error) => {
        console.error('Failed to load players:', error);
      })
      .finally(() => {
        if (isMounted) setHasLoadedPlayers(true);
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

  const { startUpdate, isUpdating, dialog: updatePlayersDialog } = usePlayersUpdater({
    kingdomId: kingdomIdNumber,
    kingdomAlliances,
    onFinished: async () => {
      if (alliance) setPlayers(await loadPlayers(alliance.id));
    },
  });

  const closeAddPlayerDialog = () => setIsAddPlayerDialogOpen(false);

  const handleAddPlayer = async (
    formData: Omit<Player, 'id' | 'created_at' | 'updated_at'>,
    existingPlayerId?: string,
    meta?: PlayerFormSubmitMeta
  ) => {
    if (!alliance) return;
    const createdAlliance = meta?.createdAlliance;
    if (createdAlliance) setKingdomAlliances((prev) => [...prev, createdAlliance]);
    try {
      if (existingPlayerId) {
        // Player already exists under another alliance/kingdom: move that row here
        // instead of inserting a duplicate (playerId is unique)
        await updatePlayer(existingPlayerId, formData);
      } else {
        await createPlayer(formData);
      }
      closeAddPlayerDialog();
      toast.success(describeSavedPlayer('Added', formData, kingdomAlliances, createdAlliance));
      setPlayers(await loadPlayers(alliance.id));
    } catch (error) {
      console.error('Failed to add player:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add player');
    }
  };

  if (alliance === undefined) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <div className={styles.container}>
            <Breadcrumbs />
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
            <Breadcrumbs />
            <div className={styles.content}>
              <p className={styles.description}>Alliance not found.</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const previewPlayers = players.slice(0, PLAYERS_PREVIEW_LIMIT);

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <div className={styles.container}>
          <Breadcrumbs />
          <div className={styles.content}>
            {alliance.allianceImageUrl ? (
              <Image
                src={alliance.allianceImageUrl}
                alt={alliance.name}
                className={styles.image}
                width={300}
                height={100}
              />
            ) : (
              <Image
                src={DEFAULT_ALLIANCE_IMAGE_URL}
                alt=""
                className={styles.defaultEmblem}
                width={454}
                height={350}
                priority
              />
            )}
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
              <Link href={`/${kingdomId}/${allianceSlug}/gift-codes`} className={styles.ctaButton}>
                Redeem Gift Codes
              </Link>
            </div>
          </div>

          {hasLoadedPlayers && previewPlayers.length === 0 && (
            <div className={styles.playersSection}>
              <div className={styles.emptyPlayers}>
                <p className={styles.emptyPlayersText}>No players added to this alliance yet.</p>
                <button className={styles.ctaButton} onClick={() => setIsAddPlayerDialogOpen(true)}>
                  + Add Player
                </button>
              </div>
            </div>
          )}

          {previewPlayers.length > 0 && (
            <div className={styles.playersSection}>
              <div className={styles.playersSectionHeader}>
                <h2 className={styles.playersSectionTitle}>
                  Players{' '}
                  <span
                    className={`${styles.playersCount} ${players.length >= MAX_ALLIANCE_PLAYERS ? styles.playersCountFull : ''}`}
                    title={`${players.length} of ${MAX_ALLIANCE_PLAYERS} alliance slots used`}
                  >
                    ({players.length}/{MAX_ALLIANCE_PLAYERS})
                  </span>
                </h2>
                <button
                  type="button"
                  className={styles.updatePlayersButton}
                  onClick={() => startUpdate(players)}
                  disabled={isUpdating}
                  title={`Refresh all ${players.length} player(s) from the game`}
                >
                  {isUpdating ? 'Updating...' : 'Update Players'}
                </button>
              </div>
              <div className={styles.playersGrid}>
                {previewPlayers.map((player) => (
                  <PlayerCard key={player.id} player={player} readOnly />
                ))}
                {players.length < PLAYERS_PREVIEW_LIMIT && (
                  <button
                    type="button"
                    className={styles.addPlayerCard}
                    onClick={() => setIsAddPlayerDialogOpen(true)}
                  >
                    <span className={styles.addPlayerIcon} aria-hidden="true">+</span>
                    Add New Player
                  </button>
                )}
              </div>
              <Link href={`/${kingdomId}/${allianceSlug}/players`} className={styles.viewAllButton}>
                View All
              </Link>
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

      {updatePlayersDialog}

      <Dialog isOpen={isAddPlayerDialogOpen} title="Add New Player" onClose={closeAddPlayerDialog}>
        {isAddPlayerDialogOpen && (
          <PlayerForm
            kingdomId={kingdomIdNumber}
            allianceId={String(alliance.id)}
            alliances={kingdomAlliances}
            onSubmit={handleAddPlayer}
            onCancel={closeAddPlayerDialog}
          />
        )}
      </Dialog>
    </>
  );
}
