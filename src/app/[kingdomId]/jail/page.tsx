'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import Breadcrumbs from '@/components/Breadcrumbs';
import Dialog from '@/components/Dialog';
import PlayerIdentity from '@/components/PlayerIdentity';
import PlayerPicker from '@/components/PlayerPicker';
import PlayerForm, { PlayerFormSubmitMeta } from '@/components/PlayerForm';
import { setJailCache } from '@/components/useJail';
import { useCanRule } from '@/components/EditMode';
import { useToast } from '@/components/Toast';
import { Alliance, JailEntry, Player } from '@/types';
import { getAlliancesByKingdomId } from '@/utils/allianceService';
import { getJail, setJailTrial } from '@/utils/jailService';
import { JAIL_TRIALS, JailTrial, MAX_OFFENDERS } from '@/utils/jailTrials';
import { createPlayer, getAllKingdomPlayers, updatePlayer } from '@/utils/playerService';
import { describeSavedPlayer } from '@/utils/playerFeedback';
import styles from './page.module.css';

interface JailPageProps {
  params: Promise<{ kingdomId: string }>;
}

/** The kingdom Jail: everyone can see the offenders, the King (or god) puts players in and releases them. */
export default function JailPage({ params }: JailPageProps) {
  const { kingdomId } = use(params);
  const kingdomIdNumber = Number(kingdomId);
  const canRule = useCanRule(kingdomIdNumber);
  const toast = useToast();

  const [players, setPlayers] = useState<Player[]>([]);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [jail, setJail] = useState<JailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pickingTrial, setPickingTrial] = useState<JailTrial | null>(null);
  const [savingTrial, setSavingTrial] = useState<JailTrial | null>(null);
  // Picking dialog shows the standard Add Player form instead of the list
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  const reloadJail = async () => {
    const entries = await getJail(kingdomIdNumber);
    setJail(entries);
    setJailCache(kingdomIdNumber, entries); // "Jailed" badges elsewhere on the page
  };

  const openPicker = (trial: JailTrial) => {
    setIsAddingPlayer(false);
    setPickingTrial(trial);
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getAllKingdomPlayers(kingdomIdNumber),
      getAlliancesByKingdomId(kingdomIdNumber).catch((): Alliance[] => []),
      getJail(kingdomIdNumber),
    ])
      .then(([kingdomPlayers, kingdomAlliances, entries]) => {
        if (!isMounted) return;
        setPlayers(kingdomPlayers);
        setAlliances(kingdomAlliances);
        setJail(entries);
      })
      .catch((error) => {
        console.error('Failed to load the jail:', error);
        if (isMounted) toast.error(error instanceof Error ? error.message : 'Failed to load the jail');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kingdomIdNumber]);

  const playersById = new Map(players.map((p) => [String(p.id), p]));
  const allianceTags = new Map(alliances.map((a) => [String(a.id), a.nameTag]));
  const trialOf = new Map(jail.map((entry) => [String(entry.playerId), entry.trial]));
  const trialName = (trial: JailTrial) => JAIL_TRIALS.find((t) => t.id === trial)?.name ?? trial;

  const update = async (trial: JailTrial, player: Player | null) => {
    setSavingTrial(trial);
    try {
      await setJailTrial(kingdomIdNumber, trial, player ? Number(player.id) : null);
      await reloadJail();
      toast.success(
        player ? `${player.aliasName || player.name} sent to the ${trialName(trial)}` : `${trialName(trial)} released`
      );
      setPickingTrial(null);
      setIsAddingPlayer(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update the jail');
    } finally {
      setSavingTrial(null);
    }
  };

  /**
   * Player not in the app yet: the standard Add Player flow (looked up in the game, their
   * alliance created when missing), then straight into the trial being filled.
   */
  const handleAddPlayer = async (
    formData: Omit<Player, 'id' | 'created_at' | 'updated_at'>,
    existingPlayerId?: string,
    meta?: PlayerFormSubmitMeta
  ) => {
    if (!pickingTrial) return;
    try {
      // Already in the database (e.g. another kingdom): move that row instead of duplicating it
      const saved = existingPlayerId ? await updatePlayer(existingPlayerId, formData) : await createPlayer(formData);
      toast.success(describeSavedPlayer('Added', formData, alliances, meta?.createdAlliance));

      const [kingdomPlayers, kingdomAlliances] = await Promise.all([
        getAllKingdomPlayers(kingdomIdNumber),
        getAlliancesByKingdomId(kingdomIdNumber).catch(() => alliances),
      ]);
      setPlayers(kingdomPlayers);
      setAlliances(kingdomAlliances);

      if (Number(saved.kingdomId) !== kingdomIdNumber) {
        toast.error(`${saved.aliasName || saved.name} is in kingdom ${saved.kingdomId}: only kingdom ${kingdomId} players can be jailed`);
        setIsAddingPlayer(false);
        return;
      }
      await update(pickingTrial, saved);
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
            <h1 className={styles.title}>Jail</h1>
            <p className={styles.subtitle}>
              Kingdom {kingdomId} offenders · {jail.length} / {MAX_OFFENDERS} · one player per trial
            </p>
          </div>

          {isLoading ? (
            <p className={styles.muted}>Loading the jail...</p>
          ) : (
            <div className={styles.trials}>
              {JAIL_TRIALS.map((trial) => {
                const entry = jail.find((e) => e.trial === trial.id);
                const offender = entry ? playersById.get(String(entry.playerId)) : undefined;
                const tag = offender?.allianceId != null ? allianceTags.get(String(offender.allianceId)) : undefined;
                const isSaving = savingTrial === trial.id;

                return (
                  <section key={trial.id} className={`${styles.trial} ${entry ? styles.occupied : ''}`}>
                    <h2 className={styles.trialName}>{trial.name}</h2>
                    <ul className={styles.effects}>
                      {trial.effects.map((effect) => (
                        <li key={effect}>{effect}</li>
                      ))}
                    </ul>

                    <div className={styles.offender}>
                      {offender ? (
                        <Link href={`/${kingdomId}/players/${offender.playerId}`} className={styles.offenderLink}>
                          <PlayerIdentity player={offender} label={offender.aliasName || offender.name} showJailed={false} />
                          {tag && <span className={styles.tag}>[{tag}]</span>}
                        </Link>
                      ) : entry ? (
                        <span className={styles.muted}>A player no longer in this kingdom</span>
                      ) : (
                        <span className={styles.muted}>Empty</span>
                      )}
                    </div>

                    {canRule && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => openPicker(trial.id)}
                          disabled={savingTrial !== null}
                        >
                          {entry ? 'Replace' : 'Jail a player'}
                        </button>
                        {entry && (
                          <button
                            type="button"
                            className={`${styles.button} ${styles.releaseButton}`}
                            onClick={() => update(trial.id, null)}
                            disabled={savingTrial !== null}
                          >
                            {isSaving ? 'Releasing...' : 'Release'}
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog
        isOpen={pickingTrial !== null}
        title={pickingTrial ? `Send to the ${trialName(pickingTrial)}` : ''}
        onClose={() => setPickingTrial(null)}
        closeDisabled={savingTrial !== null}
      >
        {pickingTrial && isAddingPlayer && (
          <PlayerForm
            kingdomId={kingdomIdNumber}
            allianceId=""
            alliances={alliances}
            onSubmit={handleAddPlayer}
            onCancel={() => setIsAddingPlayer(false)}
          />
        )}
        {pickingTrial && !isAddingPlayer && (
          <>
            <PlayerPicker
              players={players}
              disabled={savingTrial !== null}
              onPick={(player) => update(pickingTrial, player)}
              describe={(player) => {
                const tag = player.allianceId != null ? allianceTags.get(String(player.allianceId)) : undefined;
                const current = trialOf.get(String(player.id));
                return (
                  <>
                    {tag && <span>[{tag}]</span>}
                    {current && <span className={styles.jailedNote}>In {trialName(current)}</span>}
                  </>
                );
              }}
            />
            <p className={styles.addHint}>
              Not in the list?{' '}
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => setIsAddingPlayer(true)}
                disabled={savingTrial !== null}
              >
                Add the player by ID
              </button>
            </p>
          </>
        )}
      </Dialog>
    </>
  );
}
