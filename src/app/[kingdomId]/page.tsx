'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import Breadcrumbs from '@/components/Breadcrumbs';
import Dialog from '@/components/Dialog';
import AllianceForm from '@/components/AllianceForm';
import AllianceTable from '@/components/AllianceTable';
import AllianceCards from '@/components/AllianceCards';
import PlayersTable from '@/components/PlayersTable';
import PlayerForm, { PlayerFormSubmitMeta } from '@/components/PlayerForm';
import { useToast } from '@/components/Toast';
import { usePlayersUpdater } from '@/components/usePlayersUpdater';
import { Alliance, Player } from '@/types';
import { getAlliancesByKingdomId, createAlliance } from '@/utils/allianceService';
import {
  AllianceStats,
  createPlayer,
  getAllianceStats,
  getKingdomPlayers,
  getUnassignedPlayers,
  updatePlayer,
} from '@/utils/playerService';
import { describeSavedPlayer } from '@/utils/playerFeedback';
import styles from './page.module.css';

interface KingdomPageProps {
  params: Promise<{ kingdomId: string }>;
}

const KINGDOM_PLAYERS_PAGE_SIZE = 100;
// Supabase returns at most 1000 rows per request
const MAX_ROWS_PER_REQUEST = 1000;

type PlayerFormData = Omit<Player, 'id' | 'created_at' | 'updated_at'>;

/** First `count` players of the kingdom (strongest first), in as many requests as needed. */
async function loadTopPlayers(kingdomId: number, count: number) {
  const players: Player[] = [];
  let total = 0;
  for (let offset = 0; offset < count; offset += MAX_ROWS_PER_REQUEST) {
    const page = await getKingdomPlayers(kingdomId, offset, Math.min(MAX_ROWS_PER_REQUEST, count - offset));
    players.push(...page.players);
    total = page.total;
    if (page.players.length === 0) break;
  }
  return { players, total };
}

export default function KingdomPage({ params }: KingdomPageProps) {
  const { kingdomId } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const toast = useToast();
  const [allianceStats, setAllianceStats] = useState<Map<string, AllianceStats>>(new Map());
  const [unassignedPlayers, setUnassignedPlayers] = useState<Player[]>([]);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);
  const [topPlayersTotal, setTopPlayersTotal] = useState(0);
  const [isLoadingMorePlayers, setIsLoadingMorePlayers] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  /** `silent` refreshes in place, without swapping the page for the loading text */
  const loadAlliances = async ({ silent = false } = {}) => {
    try {
      if (!silent) setIsLoading(true);
      // Keep however many top players are already shown (at least one page)
      const shownCount = Math.max(KINGDOM_PLAYERS_PAGE_SIZE, topPlayers.length);
      const [result, stats, unassigned, top] = await Promise.all([
        getAlliancesByKingdomId(kingdomIdNumber),
        getAllianceStats(kingdomIdNumber).catch((error) => {
          console.error('Failed to load alliance stats:', error);
          return new Map<string, AllianceStats>();
        }),
        getUnassignedPlayers(kingdomIdNumber).catch((error) => {
          console.error('Failed to load players without alliance:', error);
          return [];
        }),
        loadTopPlayers(kingdomIdNumber, shownCount).catch((error) => {
          console.error('Failed to load kingdom players:', error);
          return { players: [], total: 0 };
        }),
      ]);
      setAlliances(result);
      setAllianceStats(stats);
      setUnassignedPlayers(unassigned);
      setTopPlayers(top.players);
      setTopPlayersTotal(top.total);
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
    onFinished: () => loadAlliances({ silent: true }),
  });

  const handleViewMorePlayers = async () => {
    setIsLoadingMorePlayers(true);
    try {
      const page = await getKingdomPlayers(kingdomIdNumber, topPlayers.length, KINGDOM_PLAYERS_PAGE_SIZE);
      setTopPlayers((prev) => [...prev, ...page.players]);
      setTopPlayersTotal(page.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load more players');
    } finally {
      setIsLoadingMorePlayers(false);
    }
  };

  const closePlayerDialog = () => setEditingPlayer(null);
  const closeAddPlayerDialog = () => setIsAddPlayerOpen(false);

  // Any save can move a player between alliances (or create one), so reload every section
  const handleSavePlayer = async (formData: PlayerFormData, _existingId?: string, meta?: PlayerFormSubmitMeta) => {
    if (!editingPlayer) return;
    try {
      await updatePlayer(editingPlayer.id, formData);
      closePlayerDialog();
      toast.success(describeSavedPlayer('Saved', formData, alliances, meta?.createdAlliance));
      await loadAlliances({ silent: true });
    } catch (error) {
      console.error('Failed to save player:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save player');
    }
  };

  const handleAddPlayer = async (formData: PlayerFormData, existingPlayerId?: string, meta?: PlayerFormSubmitMeta) => {
    try {
      if (existingPlayerId) {
        // Already in the database (another alliance/kingdom): move that row instead of duplicating it
        await updatePlayer(existingPlayerId, formData);
      } else {
        await createPlayer(formData);
      }
      closeAddPlayerDialog();
      toast.success(describeSavedPlayer('Added', formData, alliances, meta?.createdAlliance));
      await loadAlliances({ silent: true });
    } catch (error) {
      console.error('Failed to add player:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add player');
    }
  };

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <div className={styles.container}>
          <Breadcrumbs />
          <div className={styles.header}>
            <h1 className={styles.title}>Welcome to Kingdom {kingdomId}</h1>
          </div>

          <section>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>
                  Alliances{' '}
                  {!isLoading && <span className={styles.sectionCount}>({alliances.length})</span>}
                </h2>
                <p className={styles.sectionHint}>Ranked by total power of their players.</p>
              </div>
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
          </section>

          {!isLoading && (
            <section className={styles.unassignedSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    Top Players{' '}
                    <span className={styles.sectionCount}>
                      ({topPlayers.length < topPlayersTotal ? `${topPlayers.length} of ${topPlayersTotal}` : topPlayersTotal})
                    </span>
                  </h2>
                  <p className={styles.sectionHint}>
                    Kingdom {kingdomId} players across all alliances, strongest first.
                  </p>
                </div>
                <div className={styles.sectionActions}>
                  <button type="button" className={styles.createButton} onClick={() => setIsAddPlayerOpen(true)}>
                    + Add Player
                  </button>
                </div>
              </div>
              <PlayersTable
                players={topPlayers}
                alliances={alliances}
                onEdit={setEditingPlayer}
                showPlayerCount={false}
                showAliasColumn={false}
                showPlayerIdColumn={false}
                emptyMessage="No players in this kingdom yet. Add one to get started!"
              />
              {topPlayers.length < topPlayersTotal && (
                <button
                  type="button"
                  className={styles.viewMoreButton}
                  onClick={handleViewMorePlayers}
                  disabled={isLoadingMorePlayers}
                >
                  {isLoadingMorePlayers
                    ? 'Loading...'
                    : `View more (${Math.min(KINGDOM_PLAYERS_PAGE_SIZE, topPlayersTotal - topPlayers.length)} of ${topPlayersTotal - topPlayers.length} remaining)`}
                </button>
              )}
            </section>
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
                emptyMessage="Every registered player in this kingdom is in an alliance."
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

      <Dialog isOpen={isAddPlayerOpen} title="Add New Player" onClose={closeAddPlayerDialog}>
        {isAddPlayerOpen && (
          <PlayerForm
            kingdomId={kingdomIdNumber}
            allianceId=""
            alliances={alliances}
            onSubmit={handleAddPlayer}
            onCancel={closeAddPlayerDialog}
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
