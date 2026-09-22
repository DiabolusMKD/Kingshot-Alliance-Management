'use client';

import { use, useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
import Dialog from '@/components/Dialog';
import AllianceForm from '@/components/AllianceForm';
import AllianceTable from '@/components/AllianceTable';
import AllianceCards from '@/components/AllianceCards';
import { Alliance } from '@/types';
import { getAlliancesByKingdomId, createAlliance, updateAlliance } from '@/utils/allianceService';
import styles from './page.module.css';

interface KingdomPageProps {
  params: Promise<{ kingdomId: string }>;
}

export default function KingdomPage({ params }: KingdomPageProps) {
  const { kingdomId } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAlliance, setEditingAlliance] = useState<Alliance | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  const loadAlliances = async () => {
    try {
      setIsLoading(true);
      const result = await getAlliancesByKingdomId(kingdomIdNumber);
      setAlliances(result);
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
    setEditingAlliance(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (alliance: Alliance) => {
    setEditingAlliance(alliance);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingAlliance(null);
  };

  const handleCreateAlliance = async (allianceData: Omit<Alliance, 'id' | 'created_at'>) => {
    const newAlliance = await createAlliance(allianceData);
    setAlliances((prev) => [...prev, newAlliance].sort((a, b) => a.name.localeCompare(b.name)));
    closeDialog();
  };

  const handleUpdateAlliance = async (allianceData: Omit<Alliance, 'id' | 'created_at'>) => {
    if (!editingAlliance) return;
    const updated = await updateAlliance(editingAlliance.id, allianceData);
    setAlliances((prev) =>
      prev.map((alliance) => (alliance.id === updated.id ? updated : alliance)).sort((a, b) => a.name.localeCompare(b.name))
    );
    closeDialog();
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
            <AllianceTable alliances={alliances} kingdomId={kingdomIdNumber} onEdit={openEditDialog} />
          ) : (
            <AllianceCards alliances={alliances} kingdomId={kingdomIdNumber} onEdit={openEditDialog} />
          )}
        </div>
      </main>

      <Dialog isOpen={isDialogOpen} title={editingAlliance ? 'Edit Alliance' : 'Create Alliance'} onClose={closeDialog}>
        <AllianceForm
          kingdomId={kingdomIdNumber}
          alliance={editingAlliance ?? undefined}
          onSubmit={editingAlliance ? handleUpdateAlliance : handleCreateAlliance}
          onCancel={closeDialog}
        />
      </Dialog>
    </>
  );
}
