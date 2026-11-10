'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import Dialog from '@/components/Dialog';
import AllianceForm from '@/components/AllianceForm';
import AllianceTable from '@/components/AllianceTable';
import AllianceCards from '@/components/AllianceCards';
import PlayersTable from '@/components/PlayersTable';
import PlayerForm from '@/components/PlayerForm';
import { useToast } from '@/components/Toast';
import { usePlayersUpdater } from '@/components/usePlayersUpdater';
import { Alliance, Player } from '@/types';
import { getAlliancesByKingdomId, createAlliance } from '@/utils/allianceService';
import { AllianceStats, getAllianceStats, getUnassignedPlayers, updatePlayer } from '@/utils/playerService';
import styles from './page.module.css';

interface KingdomPageProps {
  params: Promise<{ kingdomId: string }>;
}

export default function KingdomPage({ params }: KingdomPageProps) {
  const { kingdomId } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const toast = useToast();
  const [allianceStats, setAllianceStats] = useState<Map<string, AllianceStats>>(new Map());
  const [unassignedPlayers, setUnassignedPlayers] = useState<Player[]>([]);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  /** `silent` refreshes in place, without swapping the page for the loading text */
  const loadAlliances = async ({ silent = false } = {}) => {
    try {
      if (!silent) setIsLoading(true);
      const [result, stats, unassigned] = await Promise.all([
        getAlliancesByKingdomId(kingdomIdNumber),
        getAllianceStats(kingdomIdNumber).catch((error) => {
          console.error('Failed to load alliance stats:', error);
          return new Map<string, AllianceStats>();
        }),
        getUnassignedPlayers(kingdomIdNumber).catch((error) => {
          console.error('Failed to load players without alliance:', error);
          return [];
        }),
      ]);
      setAlliances(result);
      setAllianceStats(stats);
      setUnassignedPlayers(unassigned);
    } catch (error) {
      console.error('Failed to load alliances:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlliances();
  }, [kingdomId]);

  const openCreateDialog = () => {
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
  };

  const handleCreateAlliance = async (allianceData: Omit<Alliance, 'id' | 'created_at'>) => {
    const newAlliance = await createAlliance(allianceData);
    setAlliances((prev) => [...prev, newAlliance]);
    closeDialog();
  };

  const getStats = (alliance: Alliance): AllianceStats =>
    allianceStats.get(String(alliance.id)) ?? { power: 0, count: 0 };

  // Strongest alliance first; ties fall back to name
  const sortedAlliances = [...alliances].sort(
    (a, b) => getStats(b).power - getStats(a).power || a.name.localeCompare(b.name)
  );

  // Players who joined an alliance in the game get it created here if the app doesn't have it yet
  const { startUpdate, isUpdating, dialog: updatePlayersDialog } = usePlayersUpdater({
    kingdomId: kingdomIdNumber,
    kingdomAlliances: alliances,
    createMissingAlliances: true,
    onFinished: () => loadAlliances({ silent: true }),
  });

  const closePlayerDialog = () => setEditingPlayer(null);

  // Editing is mainly for assigning an alliance; reload so counts and both tables update
  const handleSavePlayer = async (formData: Omit<Player, 'id' | 'created_at' | 'updated_at'>) => {
    if (!editingPlayer) return;
    try {
      await updatePlayer(editingPlayer.id, { ...formData, allianceId: formData.allianceId || null });
      closePlayerDialog();
      toast.success(`Saved ${formData.aliasName || formData.name}`);
      await loadAlliances({ silent: true });
    } catch (error) {
      console.error('Failed to save player:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save player');
    }
  };

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>Welcome to Kingdom {kingdomId}</h1>

            <div className={styles.headerActions}>
              {alliances.length > 0 && (
                <div className={styles.viewSwitcher}>
                  <button
                    className={`${styles.viewButton} ${viewMode === 'table' ? styles.active : ''}`}
                    onClick={() => setViewMode('table')}
                    title="Table view"
                  >
                    ⊞ Table
                  </button>
                  <button
                    className={`${styles.viewButton} ${viewMode === 'card' ? styles.active : ''}`}
                    onClick={() => setViewMode('card')}
                    title="Card view"
                  >
                    ≣ Card
                  </button>
                </div>
              )}
              <button className={styles.createButton} onClick={openCreateDialog}>
                + Create Alliance
              </button>
            </div>
          </div>

          {isLoading ? (
            <p>Loading alliances...</p>
          ) : alliances.length === 0 ? (
            <span className={styles.noAlliances}>No alliances</span>
          ) : viewMode === 'table' ? (
            <AllianceTable alliances={sortedAlliances} kingdomId={kingdomIdNumber} getStats={getStats} />
          ) : (
            <AllianceCards alliances={sortedAlliances} kingdomId={kingdomIdNumber} />
          )}

          {!isLoading && (
            <section className={styles.unassignedSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    Players Without an Alliance{' '}
                    <span className={styles.sectionCount}>({unassignedPlayers.length})</span>
                  </h2>
                  <p className={styles.sectionHint}>
                    Kingdom {kingdomId} players not assigned to any alliance. Edit a player to assign one.
                  </p>
                </div>
                {unassignedPlayers.length > 0 && (
                  <div className={styles.sectionActions}>
                    <button
                      type="button"
                      className={styles.sectionButton}
                      onClick={() => startUpdate(unassignedPlayers)}
                      disabled={isUpdating}
                      title="Refresh from the game; players who joined an alliance are moved there (creating it if needed)"
                    >
                      {isUpdating ? 'Updating...' : 'Update Players'}
                    </button>
                    <Link
                      href={`/${kingdomId}/no-alliance/gift-codes`}
                      className={`${styles.sectionButton} ${isUpdating ? styles.sectionButtonDisabled : ''}`}
                      aria-disabled={isUpdating}
                      onClick={(e) => isUpdating && e.preventDefault()}
                    >
                      Redeem Codes
                    </Link>
                  </div>
                )}
              </div>
              <PlayersTable
                players={unassignedPlayers}
                alliances={alliances}
                onEdit={setEditingPlayer}
                showAllianceColumn={false}
                showPlayerCount={false}
                emptyMessage="Every player in this kingdom is in an alliance."
              />
            </section>
          )}
        </div>
      </main>

      {updatePlayersDialog}

      <Dialog isOpen={!!editingPlayer} title="Edit Player" onClose={closePlayerDialog}>
        {editingPlayer && (
          <PlayerForm
            key={editingPlayer.id}
            player={editingPlayer}
            kingdomId={kingdomIdNumber}
            allianceId=""
            alliances={alliances}
            onSubmit={handleSavePlayer}
            onCancel={closePlayerDialog}
          />
        )}
      </Dialog>

      <Dialog isOpen={isDialogOpen} title="Create Alliance" onClose={closeDialog}>
        <AllianceForm
          kingdomId={kingdomIdNumber}
          onSubmit={handleCreateAlliance}
          onCancel={closeDialog}
        />
      </Dialog>
    </>
  );
}
