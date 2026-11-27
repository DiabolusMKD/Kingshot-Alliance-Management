'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Kingdom, Player } from '@/types';
import { generateKingKey, getKingdomById, KingdomRulerChange, setKingdomRuler } from '@/utils/kingdomService';
import { getAllKingdomPlayers, getPlayersByIds, searchPlayersOutsideKingdom } from '@/utils/playerService';
import Dialog from './Dialog';
import PlayerIdentity from './PlayerIdentity';
import PlayerPicker from './PlayerPicker';
import { useCanEdit } from './EditMode';
import { useToast } from './Toast';
import styles from './KingdomRulers.module.css';

type Picking = 'king' | 'highKing' | null;

async function fetchRuler(kingdomId: number): Promise<{ kingdom: Kingdom | null; ruler: Player | null }> {
  const kingdom = await getKingdomById(kingdomId);
  const rulerId = kingdom?.kingPlayerId ?? kingdom?.highKingPlayerId;
  const ruler = rulerId ? ((await getPlayersByIds([rulerId]))[0] ?? null) : null;
  return { kingdom, ruler };
}

/**
 * The kingdom's King (a player of the kingdom) or High King (from another kingdom).
 * Everyone sees it; god picks the ruler and generates the King's link (King key).
 */
export default function KingdomRulers({ kingdomId }: { kingdomId: number }) {
  const canEdit = useCanEdit();
  const toast = useToast();
  const [kingdom, setKingdom] = useState<Kingdom | null>(null);
  const [ruler, setRuler] = useState<Player | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const [kingdomPlayers, setKingdomPlayers] = useState<Player[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [kingLink, setKingLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchRuler(kingdomId);
    setKingdom(result.kingdom);
    setRuler(result.ruler);
  }, [kingdomId]);

  useEffect(() => {
    let isMounted = true;
    fetchRuler(kingdomId)
      .then((result) => {
        if (!isMounted) return;
        setKingdom(result.kingdom);
        setRuler(result.ruler);
      })
      .catch((error) => console.error('Failed to load the kingdom ruler:', error));
    return () => {
      isMounted = false;
    };
  }, [kingdomId]);

  // The King is picked from the whole kingdom: load it once, when first needed
  useEffect(() => {
    if (picking !== 'king' || kingdomPlayers) return;
    getAllKingdomPlayers(kingdomId)
      .then(setKingdomPlayers)
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load players'));
  }, [picking, kingdomPlayers, kingdomId, toast]);

  const searchHighKing = useCallback((term: string) => searchPlayersOutsideKingdom(kingdomId, term), [kingdomId]);

  const save = async (change: KingdomRulerChange, message: string) => {
    setIsSaving(true);
    try {
      await setKingdomRuler(kingdomId, change);
      await load();
      setPicking(null);
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the ruler');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateLink = async () => {
    const replacing = 'Generate a new King link? The previous link stops working.';
    if (!window.confirm(replacing)) return;
    setIsSaving(true);
    try {
      const key = await generateKingKey(kingdomId);
      setKingLink(`${window.location.origin}/${kingdomId}?mode=${encodeURIComponent(key)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate the King link');
    } finally {
      setIsSaving(false);
    }
  };

  const copyLink = async () => {
    if (!kingLink) return;
    try {
      await navigator.clipboard.writeText(kingLink);
      toast.success('King link copied');
    } catch {
      toast.error('Copy failed: select the link and copy it by hand');
    }
  };

  const isKing = !!kingdom?.kingPlayerId;
  const isHighKing = !!kingdom?.highKingPlayerId;
  const title = isKing ? 'King' : isHighKing ? 'High King' : 'King';

  return (
    <section className={styles.rulers}>
      <div className={styles.info}>
        {/* Crown + "KING", then the player */}
        <span className={styles.title}>
          <svg className={styles.crown} viewBox="0 0 24 24" aria-hidden="true">
            {/* Gold crown: five-point band with jewels */}
            <path
              className={styles.crownBody}
              d="M3 8.5l4.2 3.6L12 5l4.8 7.1L21 8.5l-1.8 9.3a1.5 1.5 0 0 1-1.5 1.2H6.3a1.5 1.5 0 0 1-1.5-1.2z"
            />
            <rect className={styles.crownBand} x="5.2" y="15.2" width="13.6" height="2" rx="0.6" />
            <circle className={styles.crownTip} cx="3" cy="7.6" r="1.4" />
            <circle className={styles.crownTip} cx="12" cy="3.9" r="1.4" />
            <circle className={styles.crownTip} cx="21" cy="7.6" r="1.4" />
            <circle className={styles.crownJewel} cx="12" cy="12.4" r="1.5" />
          </svg>
          <span className={styles.label}>{title}</span>
        </span>
        {ruler ? (
          <Link href={`/${ruler.kingdomId}/players/${ruler.playerId}`} className={styles.rulerLink}>
            <PlayerIdentity player={ruler} label={ruler.aliasName || ruler.name} />
            {isHighKing && <span className={styles.from}>from Kingdom {ruler.kingdomId}</span>}
          </Link>
        ) : (
          <span className={styles.none}>No ruler set</span>
        )}
      </div>

      {canEdit && (
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => setPicking('king')} disabled={isSaving}>
            {isKing ? 'Change King' : 'Set King'}
          </button>
          <button type="button" className={styles.button} onClick={() => setPicking('highKing')} disabled={isSaving}>
            {isHighKing ? 'Change High King' : 'Set High King'}
          </button>
          {isKing && (
            <button type="button" className={styles.button} onClick={handleGenerateLink} disabled={isSaving}>
              Generate King link
            </button>
          )}
          {(isKing || isHighKing) && (
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              onClick={() => window.confirm(`Remove the ${title}?`) && save({ clear: true }, `${title} removed`)}
              disabled={isSaving}
            >
              Remove
            </button>
          )}
        </div>
      )}

      <Dialog
        isOpen={picking !== null}
        title={picking === 'king' ? `King of Kingdom ${kingdomId}` : `High King of Kingdom ${kingdomId}`}
        onClose={() => setPicking(null)}
        closeDisabled={isSaving}
      >
        <p className={styles.hint}>
          {picking === 'king'
            ? 'A player of this kingdom. Generate the King link afterwards to give them the King features.'
            : 'A player from another kingdom. A High King has no extra permissions.'}{' '}
          Changing the ruler turns off the current King link.
        </p>
        {picking === 'king' &&
          (kingdomPlayers ? (
            <PlayerPicker
              players={kingdomPlayers}
              disabled={isSaving}
              onPick={(p) => save({ kingPlayerId: Number(p.id) }, `${p.aliasName || p.name} is now King`)}
            />
          ) : (
            <p className={styles.hint}>Loading players...</p>
          ))}
        {picking === 'highKing' && (
          <PlayerPicker
            search={searchHighKing}
            disabled={isSaving}
            describe={(p) => <span>K{p.kingdomId}</span>}
            onPick={(p) => save({ highKingPlayerId: Number(p.id) }, `${p.aliasName || p.name} is now High King`)}
          />
        )}
      </Dialog>

      <Dialog isOpen={kingLink !== null} title="King link" onClose={() => setKingLink(null)}>
        <p className={styles.hint}>
          Send this link to the King. It turns on the King features of Kingdom {kingdomId} in their browser:
          kingdom-wide gift codes, updating every player and the Jail. It is shown only once; generate a new
          one to revoke it.
        </p>
        <div className={styles.linkRow}>
          <input className={styles.linkInput} value={kingLink ?? ''} readOnly onFocus={(e) => e.target.select()} />
          <button type="button" className={styles.button} onClick={copyLink}>
            Copy
          </button>
        </div>
      </Dialog>
    </section>
  );
}
