'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alliance, Player } from '@/types';
import Navigation from '@/components/Navigation';
import PlayersTable from '@/components/PlayersTable';
import PlayersCard from '@/components/PlayersCard';
import PlayerForm from '@/components/PlayerForm';
import Dialog from '@/components/Dialog';
import { getPlayers, createPlayer, updatePlayer, removePlayerFromAlliance } from '@/utils/playerService';
import { getSessionPlayers, setSessionPlayers, upsertSessionPlayer, removeSessionPlayer } from '@/utils/sessionStorageService';
import { getAlliancesByKingdomId } from '@/utils/allianceService';
import { findAllianceBySlug } from '@/utils/allianceSlug';
import styles from './page.module.css';

interface PlayersPageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
}

export default function PlayersPage({ params }: PlayersPageProps) {
  const { kingdomId, allianceSlug } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  const [alliance, setAlliance] = useState<Alliance | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  const loadPlayers = async (allianceId: number) => {
    try {
      setIsLoading(true);
      const allPlayers = await getPlayers(allianceId, kingdomIdNumber);
      // Filter to only show active players and sort by power descending
      const activePlayers = allPlayers.sort((a, b) => b.power - a.power);
      setPlayers(activePlayers);
      // Sync with session storage
      setSessionPlayers(activePlayers);
    } catch (error) {
      console.error('Failed to load players:', error);
      // Try to use session storage as fallback
      const sessionPlayers = getSessionPlayers();
      if (sessionPlayers.length > 0) {
        setPlayers(sessionPlayers);
      } else {
        alert('Failed to load players. Please ensure Supabase credentials are set in .env.local');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    getAlliancesByKingdomId(kingdomIdNumber)
      .then((alliances) => {
        if (!isMounted) return;
        const match = findAllianceBySlug(alliances, allianceSlug) || null;
        setAlliance(match);
        if (match) {
          loadPlayers(match.id);
        } else {
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('Failed to resolve alliance:', error);
        if (isMounted) {
          setAlliance(null);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [kingdomId, allianceSlug]);

  const handleAddPlayer = () => {
    setSelectedPlayer(undefined);
    setIsDialogOpen(true);
  };

  const handleEditPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setIsDialogOpen(true);
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (confirm('Are you sure you want to remove this player from the alliance?')) {
      try {
        await removePlayerFromAlliance(playerId);
        setPlayers((prev) => prev.filter((p) => p.id !== playerId));
        removeSessionPlayer(playerId);
      } catch (error) {
        console.error('Failed to remove player from alliance:', error);
        alert('Failed to remove player from alliance');
      }
    }
  };

  const handleFormSubmit = async (
    formData: Omit<Player, 'id' | 'created_at' | 'updated_at'>,
    existingPlayerId?: string
  ) => {
    if (!alliance) return;

    try {
      setIsLoading(true);

      if (selectedPlayer) {
        // Update existing player
        const updatedPlayer = await updatePlayer(selectedPlayer.id, formData);
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === selectedPlayer.id ? updatedPlayer : p
          )
        );
        upsertSessionPlayer(updatedPlayer);
      } else if (existingPlayerId) {
        // Player already exists in the database under another alliance/kingdom —
        // move that row here instead of inserting a duplicate (playerId is unique).
        const movedPlayer = await updatePlayer(existingPlayerId, formData);
        setPlayers((prev) => [...prev, movedPlayer].sort((a, b) => b.power - a.power));
        upsertSessionPlayer(movedPlayer);
      } else {
        const newPlayer = await createPlayer(formData);
        setPlayers((prev) => [...prev, newPlayer].sort((a, b) => b.power - a.power));
        upsertSessionPlayer(newPlayer);
      }

      setIsDialogOpen(false);
      setSelectedPlayer(undefined);
    } catch (error) {
      console.error('Failed to save player:', error);
      alert(error instanceof Error ? error.message : 'Failed to save player');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormCancel = () => {
    setIsDialogOpen(false);
    setSelectedPlayer(undefined);
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Player ID', 'Name', 'Alias', 'Swordland', 'Tri Alliance', 'Power'],
      ...players.map((p) => [
        p.playerId,
        p.name,
        p.aliasName,
        p.swordlandPower,
        p.trialliancePower,
        p.power
      ])
    ];
    const csvString = csvContent.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'players.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (alliance === null) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <div className={styles.container}>
            <p>Alliance not found.</p>
            <Link href={`/${kingdomId}`}>← Back to Kingdom {kingdomId}</Link>
          </div>
        </main>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <div className={styles.container}>
            <p>Loading players...</p>
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
          <Link href={`/${kingdomId}/${allianceSlug}`} className={styles.backLink}>
            ← Back to {alliance?.name}
          </Link>

          <div className={styles.header}>
            <div className={styles.headerActions}>
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
              <button onClick={handleAddPlayer} className={styles.addButton}>
                + Add Player
              </button>
            </div>
          </div>

          {viewMode === 'table' ? (
            <PlayersTable
              players={players}
              onEdit={handleEditPlayer}
              onDelete={handleDeletePlayer}
            />
          ) : (
            <PlayersCard
              players={players}
              onEdit={handleEditPlayer}
              onDelete={handleDeletePlayer}
            />
          )}

          <button className={styles.exportButton} onClick={exportToCSV}>
            Export to CSV
          </button>
        </div>
      </main>

      <Dialog
        isOpen={isDialogOpen}
        title={selectedPlayer ? 'Edit Player' : 'Add New Player'}
        onClose={handleFormCancel}
      >
        <PlayerForm
          player={selectedPlayer}
          kingdomId={kingdomIdNumber}
          allianceId={alliance ? String(alliance.id) : ''}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      </Dialog>
    </>
  );
}
