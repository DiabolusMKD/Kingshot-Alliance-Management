'use client';

import { ReactNode, useEffect, useState } from 'react';
import { Player } from '@/types';
import { formatCompactPower } from '@/utils/formatNumbers';
import PlayerIdentity from './PlayerIdentity';
import styles from './PlayerPicker.module.css';

const MAX_RESULTS = 50;

interface PlayerPickerProps {
  /** Pick from this list (filtered locally)... */
  players?: Player[];
  /** ...or search the server as the user types (at least 2 characters) */
  search?: (term: string) => Promise<Player[]>;
  onPick: (player: Player) => void;
  /** Extra text next to a player, e.g. their alliance tag or "In Avarice Trial" */
  describe?: (player: Player) => ReactNode;
  placeholder?: string;
  disabled?: boolean;
}

const matches = (player: Player, term: string) =>
  `${player.aliasName} ${player.name} ${player.playerId}`.toLowerCase().includes(term);

/** Search box + list of players to pick one from (name, alias or in-game id). */
export default function PlayerPicker({
  players,
  search,
  onPick,
  describe,
  placeholder = 'Search by name or player ID',
  disabled = false,
}: PlayerPickerProps) {
  const [term, setTerm] = useState('');
  const [remote, setRemote] = useState<Player[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Server search, debounced
  useEffect(() => {
    if (!search) return;
    const value = term.trim();
    if (value.length < 2) return; // results are hidden below 2 characters
    let isCurrent = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await search(value);
        if (isCurrent) setRemote(found);
      } catch (error) {
        console.error('Player search failed:', error);
        if (isCurrent) setRemote([]);
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    }, 300);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [term, search]);

  const lower = term.trim().toLowerCase();
  const results = search ? (lower.length >= 2 ? remote : []) : (players ?? []).filter((p) => !lower || matches(p, lower)).slice(0, MAX_RESULTS);

  return (
    <div className={styles.picker}>
      <input
        type="search"
        className={styles.search}
        placeholder={placeholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        disabled={disabled}
        autoFocus
      />
      <ul className={styles.list}>
        {results.map((player) => (
          <li key={player.id}>
            <button type="button" className={styles.row} onClick={() => onPick(player)} disabled={disabled}>
              <PlayerIdentity player={player} label={player.aliasName || player.name} size={28} />
              <span className={styles.meta}>
                {describe?.(player)}
                <span className={styles.power}>{formatCompactPower(player.power)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {results.length === 0 && (
        <p className={styles.empty}>
          {search && lower.length < 2
            ? 'Type at least 2 characters.'
            : isSearching
              ? 'Searching...'
              : 'No players found.'}
        </p>
      )}
    </div>
  );
}
