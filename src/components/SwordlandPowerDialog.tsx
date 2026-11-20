'use client';

import { KeyboardEvent, useMemo, useState } from 'react';
import { Player } from '@/types';
import Dialog from './Dialog';
import { useToast } from './Toast';
import { updateSwordlandPowers } from '@/utils/playerService';
import { formatPower } from '@/utils/formatNumbers';
import { getRankOrder } from '@/utils/allianceRank';
import styles from './SwordlandPowerDialog.module.css';

interface SwordlandPowerDialogProps {
  isOpen: boolean;
  players: Player[];
  onClose: () => void;
  /** After saving: reload the players */
  onSaved: () => void | Promise<void>;
}

const MULTIPLIERS: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * "45 123 456", "45,123,456" or "45.1M" -> 45123456. Empty -> null (unchanged), invalid -> NaN.
 */
export function parsePowerInput(raw: string): number | null {
  const value = raw.trim().replace(/\s/g, '');
  if (value === '') return null;
  const short = value.match(/^(\d+(?:[.,]\d+)?)([kmb])$/i);
  if (short) return Math.round(Number(short[1].replace(',', '.')) * MULTIPLIERS[short[2].toLowerCase()]);
  if (/^\d{1,3}([,.]\d{3})+$/.test(value) || /^\d+$/.test(value)) return Number(value.replace(/[,.]/g, ''));
  return NaN;
}

/** Table to type every player's Swordland power by hand (the game API doesn't expose it) */
export default function SwordlandPowerDialog({ isOpen, players, onClose, onSaved }: SwordlandPowerDialogProps) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // A fresh table the next time it opens
  const close = () => {
    setDrafts({});
    setSearch('');
    onClose();
  };

  const parsed = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, raw] of Object.entries(drafts)) {
      const value = parsePowerInput(raw);
      if (value !== null) map.set(id, value);
    }
    return map;
  }, [drafts]);

  const changes = players
    .filter((p) => {
      const value = parsed.get(String(p.id));
      return value !== undefined && Number.isFinite(value) && value !== Number(p.swordlandPower ?? 0);
    })
    .map((p) => ({ id: String(p.id), swordlandPower: parsed.get(String(p.id))! }));
  const invalidCount = [...parsed.values()].filter((v) => !Number.isFinite(v)).length;

  const term = search.trim().toLowerCase();
  const visiblePlayers = term
    ? players.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.aliasName ?? '').toLowerCase().includes(term) ||
          String(p.playerId).includes(term)
      )
    : players;

  const handleClose = () => {
    if (isSaving) return;
    if (changes.length > 0 && !confirm(`Discard ${changes.length} unsaved change${changes.length === 1 ? '' : 's'}?`)) {
      return;
    }
    close();
  };

  const handleSave = async () => {
    if (changes.length === 0 || invalidCount > 0) return;
    setIsSaving(true);
    try {
      const failed = await updateSwordlandPowers(changes);
      const saved = changes.length - failed.length;
      if (failed.length === 0) {
        toast.success(`Updated the Swordland power of ${saved} player${saved === 1 ? '' : 's'}`);
      } else {
        console.error('Failed to save Swordland powers:', failed);
        toast.error(`Saved ${saved}, failed ${failed.length}: ${failed[0].error}`);
      }
      // Keep the failed ones in the table so they can be saved again
      const failedIds = new Set(failed.map((f) => f.id));
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => failedIds.has(id))));
      await onSaved();
      if (failed.length === 0) close();
    } finally {
      setIsSaving(false);
    }
  };

  // Enter moves to the next player's field, so a whole list can be typed in one go
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = document.getElementById(`swordland-power-${visiblePlayers[index + 1]?.id}`);
    if (next instanceof HTMLInputElement) {
      next.focus();
      next.select();
    } else {
      e.currentTarget.blur();
    }
  };

  return (
    <Dialog isOpen={isOpen} title="Update Swordland Power" onClose={handleClose} closeDisabled={isSaving} size="large">
      <div className={styles.container}>
        <p className={styles.hint}>
          Type each player&apos;s Swordland power from the game. Leave a field empty to keep the current value.
          <code>45 123 456</code>, <code>45,123,456</code> and <code>45.1M</code> all work. <kbd>Enter</kbd> jumps to
          the next player.
        </p>

        <div className={styles.searchWrapper}>
          <input
            type="text"
            placeholder="Search by player name, alias, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          <button className={styles.clearButton} onClick={() => setSearch('')} disabled={!search} title="Clear search">
            ✕
          </button>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>No.</th>
                <th>Name</th>
                <th>Rank</th>
                <th className={styles.numeric}>Current</th>
                <th>New Swordland Power</th>
                <th className={styles.numeric}>Change</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlayers.map((player, index) => {
                const id = String(player.id);
                const current = Number(player.swordlandPower ?? 0);
                const value = parsed.get(id);
                const isInvalid = value !== undefined && !Number.isFinite(value);
                const diff = value !== undefined && Number.isFinite(value) ? value - current : 0;
                return (
                  <tr key={id} className={diff !== 0 ? styles.changedRow : undefined}>
                    <td className={styles.muted}>{index + 1}</td>
                    <td className={styles.nameCell} title={player.name}>
                      {player.name}
                    </td>
                    <td>
                      {player.allianceRank ? (
                        <span
                          className={`${styles.rankBadge} ${getRankOrder(player.allianceRank) <= 1 ? styles.rankHigh : ''}`}
                        >
                          {player.allianceRank}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={styles.numeric}>{current ? formatPower(current) : '—'}</td>
                    <td>
                      <input
                        id={`swordland-power-${id}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`New Swordland power of ${player.name}`}
                        placeholder={current ? formatPower(current) : '0'}
                        value={drafts[id] ?? ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        className={`${styles.powerInput} ${isInvalid ? styles.invalid : ''}`}
                        disabled={isSaving}
                      />
                    </td>
                    <td className={`${styles.numeric} ${diff > 0 ? styles.up : diff < 0 ? styles.down : styles.muted}`}>
                      {isInvalid ? 'Invalid' : diff === 0 ? '—' : `${diff > 0 ? '+' : '−'}${formatPower(Math.abs(diff))}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visiblePlayers.length === 0 && (
            <p className={styles.empty}>{search ? 'No players match your search.' : 'No players in this alliance.'}</p>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.summary}>
            {invalidCount > 0
              ? `${invalidCount} invalid value${invalidCount === 1 ? '' : 's'}`
              : `${changes.length} of ${players.length} changed`}
          </span>
          <button type="button" className={styles.cancelButton} onClick={handleClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isSaving || changes.length === 0 || invalidCount > 0}
          >
            {isSaving
              ? 'Saving...'
              : changes.length === 0
                ? 'Save'
                : `Save ${changes.length} change${changes.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
