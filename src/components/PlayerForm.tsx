'use client';

import { useState, useEffect } from 'react';
import { Alliance, Player } from '@/types';
import { fetchPlayerFromKingshot, findMatchingAlliance, KingshotPlayerData } from '@/utils/kingshotApi';
import { getPlayerByPlayerId } from '@/utils/playerService';
import { createAlliance } from '@/utils/allianceService';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import { ALLIANCE_RANKS } from '@/utils/allianceRank';
import styles from './PlayerForm.module.css';

interface PlayerFormProps {
  player?: Player;
  kingdomId: number;
  allianceId: string;
  alliances: Alliance[];
  onSubmit: (
    player: Omit<Player, 'id' | 'created_at' | 'updated_at'>,
    existingPlayerId?: string,
    meta?: PlayerFormSubmitMeta
  ) => void;
  onCancel: () => void;
}

export interface PlayerFormSubmitMeta {
  /** Alliance that was created on submit because the player's in-game alliance wasn't in the app */
  createdAlliance?: Alliance;
}

type GameAlliance = NonNullable<KingshotPlayerData['alliance']>;

const EMPTY_FORM_DATA: FormData = {
  playerId: '',
  name: '',
  aliasName: '',
  swordlandPower: 0,
  trialliancePower: 0,
  power: 0,
  profilePhoto: '',
  levelImage: '',
  allianceId: '',
  // New players start as R1
  allianceRank: 'R1',
};

type FormData = {
  playerId: string;
  name: string;
  aliasName: string;
  swordlandPower: number;
  trialliancePower: number;
  power: number;
  profilePhoto: string;
  levelImage: string;
  allianceId: string;
  /** In-game alliance rank; '' = none */
  allianceRank: string;
};

type DataSource = 'database' | 'api' | null;

export default function PlayerForm({ player, kingdomId, allianceId, alliances, onSubmit, onCancel }: PlayerFormProps) {
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [detailsStage, setDetailsStage] = useState(false);
  const [foundPlayerId, setFoundPlayerId] = useState<string | null>(null);
  // In-game alliance that doesn't exist in the app yet; created on submit
  const [pendingAlliance, setPendingAlliance] = useState<GameAlliance | null>(null);
  // Kingdom the game reports when it differs from this form's kingdom
  const [otherKingdom, setOtherKingdom] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditMode = !!player;
  const kingdomAlliances = alliances.filter((a) => a.kingdomId === kingdomId);

  useEffect(() => {
    if (player) {
      // Edit mode: populate with existing player data
      setFormData({
        playerId: player.playerId || '',
        name: player.name || '',
        aliasName: player.aliasName || '',
        swordlandPower: player.swordlandPower ?? 0,
        trialliancePower: player.trialliancePower || player.power || 0,
        power: player.power ?? 0,
        profilePhoto: player.profilePhoto || '',
        levelImage: player.levelImage || '',
        allianceId: player.allianceId ? String(player.allianceId) : allianceId,
        allianceRank: player.allianceRank ?? '',
      });
      setDataSource(null);
      setDetailsStage(true);
      setFoundPlayerId(null);
      setError(null);
      setInfoMessage(null);
    } else {
      setFormData({ ...EMPTY_FORM_DATA, allianceId });
      setDataSource(null);
      setDetailsStage(false);
      setFoundPlayerId(null);
      setError(null);
      setInfoMessage(null);
    }
    setPendingAlliance(null);
    setOtherKingdom(null);
  }, [player]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericFields = ['swordlandPower', 'trialliancePower', 'power'];

    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: numericFields.includes(name) && value ? Number(value) : value,
      };
      // Tri Alliance power follows the player's power
      if (name === 'power') next.trialliancePower = next.power;
      return next;
    });
    setError(null);
  };

  /**
   * Applies the game's alliance: preselect it when it's in the app, otherwise remember it
   * so it's created on submit. A player shown in another kingdom keeps the current choice.
   * Returns a short description for the info message.
   */
  const applyGameAlliance = (kingshotData: KingshotPlayerData): string => {
    const gameKingdom = kingshotData.kingdom;
    if (gameKingdom > 0 && gameKingdom !== kingdomId) {
      setPendingAlliance(null);
      setOtherKingdom(gameKingdom);
      return `the game shows this player in Kingdom ${gameKingdom}`;
    }
    setOtherKingdom(null);

    const gameAlliance = kingshotData.alliance;
    if (!gameAlliance) {
      setPendingAlliance(null);
      setFormData((prev) => ({ ...prev, allianceId: '' }));
      return 'not in an alliance';
    }

    const matched = findMatchingAlliance(alliances, kingdomId, gameAlliance);
    if (matched) {
      setPendingAlliance(null);
      setFormData((prev) => ({ ...prev, allianceId: String(matched.id) }));
      return `alliance ${formatAllianceLabel(matched)}`;
    }
    setPendingAlliance(gameAlliance);
    return `alliance [${gameAlliance.tag}]${gameAlliance.name}, which will be created`;
  };

  const mergeKingshotData = (prev: FormData, kingshotData: KingshotPlayerData): FormData => {
    const name = kingshotData.name || prev.name;
    const power = kingshotData.power ?? prev.power;
    return {
      ...prev,
      name,
      aliasName: prev.aliasName || name,
      power,
      trialliancePower: power,
      profilePhoto: kingshotData.profilePhoto || prev.profilePhoto,
      levelImage: kingshotData.levelImage || prev.levelImage,
    };
  };

  const handleRefetch = async () => {
    if (!formData.playerId) {
      setError('Please enter a Player ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const playerData = await fetchPlayerFromKingshot(formData.playerId);
      setFormData((prev) => mergeKingshotData(prev, playerData));
      setDataSource('api');
      setInfoMessage(`Refreshed from the game: ${applyGameAlliance(playerData)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch player data');
    } finally {
      setIsLoading(false);
    }
  };

  /** Add mode: the player must be found in the game; an existing app player is moved / refreshed */
  const handleFetchPlayer = async () => {
    if (!formData.playerId) {
      setError('Please enter a Player ID');
      return;
    }

    setIsLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      let kingshotData: KingshotPlayerData;
      try {
        kingshotData = await fetchPlayerFromKingshot(formData.playerId);
      } catch (err) {
        setError(
          `Player ${formData.playerId} wasn't found in the game${
            err instanceof Error && err.message ? ` (${err.message})` : ''
          }. Check the ID and try again.`
        );
        return;
      }

      const existingPlayer = await getPlayerByPlayerId(formData.playerId);
      if (existingPlayer) {
        // Already in the app (another alliance / kingdom): keep its alias + Swordland power
        setFormData((prev) =>
          mergeKingshotData(
            {
              ...prev,
              aliasName: existingPlayer.aliasName || existingPlayer.name || '',
              swordlandPower: existingPlayer.swordlandPower ?? 0,
              profilePhoto: existingPlayer.profilePhoto || '',
              levelImage: existingPlayer.levelImage || '',
            },
            kingshotData
          )
        );
        setFoundPlayerId(existingPlayer.id);
        setDataSource('database');
        setInfoMessage(`Existing player found; in game: ${applyGameAlliance(kingshotData)}.`);
      } else {
        setFormData((prev) => mergeKingshotData(prev, kingshotData));
        setDataSource('api');
        setInfoMessage(`Player found in the game: ${applyGameAlliance(kingshotData)}.`);
      }
      setDetailsStage(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch player data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.playerId) {
      setError('Please enter a Player ID');
      return;
    }

    if (!isEditMode && !detailsStage) {
      // Add mode: first submit looks up the player instead of saving
      await handleFetchPlayer();
      return;
    }

    // The dropdown holds the alliance (preselected from the game); when the game's
    // alliance isn't in the app yet, create it now and use that.
    let targetAllianceId: string | null = formData.allianceId || null;
    let createdAlliance: Alliance | undefined;
    if (pendingAlliance) {
      setIsSaving(true);
      try {
        createdAlliance = await createAlliance({ name: pendingAlliance.name, nameTag: pendingAlliance.tag, kingdomId });
        targetAllianceId = String(createdAlliance.id);
        setPendingAlliance(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create the alliance');
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }

    onSubmit(
      { ...formData, kingdomId, allianceId: targetAllianceId, allianceRank: formData.allianceRank || null },
      foundPlayerId ?? undefined,
      { createdAlliance }
    );
  };

  // Read-only: the alliance comes from the game (Refetch / Update All Players / Add Alliance)
  const currentAlliance = kingdomAlliances.find((a) => String(a.id) === formData.allianceId);
  const allianceLabel = pendingAlliance
    ? `[${pendingAlliance.tag}]${pendingAlliance.name} (new, created when you save)`
    : currentAlliance
      ? formatAllianceLabel(currentAlliance)
      : 'No alliance';
  const allianceField = (
    <div className={styles.formGroup}>
      <label htmlFor="allianceLabel" className={styles.label}>
        Alliance
      </label>
      <input
        type="text"
        id="allianceLabel"
        value={allianceLabel}
        className={`${styles.input} ${styles.readOnlyInput}`}
        readOnly
        tabIndex={-1}
      />
      <small className={styles.readOnlyHint}>
        {otherKingdom
          ? `The game shows this player in Kingdom ${otherKingdom}; their alliance there isn't applied.`
          : 'Read-only: set from the game'}
      </small>
    </div>
  );

  // Rank: R1 for new players; editable (Update Alliance keeps it in sync with the game)
  const rankField = (
    <div className={styles.formGroup}>
      <label htmlFor="allianceRank" className={styles.label}>
        Rank
      </label>
      <select
        id="allianceRank"
        name="allianceRank"
        value={formData.allianceRank}
        onChange={(e) => setFormData((prev) => ({ ...prev, allianceRank: e.target.value }))}
        className={styles.input}
      >
        {/* Players saved before ranks existed */}
        {!formData.allianceRank && <option value="">No rank</option>}
        {ALLIANCE_RANKS.map((rank) => (
          <option key={rank} value={rank}>
            {rank}
          </option>
        ))}
      </select>
      <small className={styles.readOnlyHint}>Rank in the alliance; Update Alliance keeps it in sync with the game</small>
    </div>
  );

  /** Power / Tri Alliance power / level image only come from the game */
  const gameField = (id: 'power' | 'trialliancePower' | 'levelImage', label: string) => (
    <div className={styles.formGroup}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        type={id === 'levelImage' ? 'text' : 'number'}
        id={id}
        name={id}
        value={formData[id]}
        className={`${styles.input} ${styles.readOnlyInput}`}
        readOnly
        tabIndex={-1}
      />
      <small className={styles.readOnlyHint}>Read-only: from the game</small>
    </div>
  );

  const lockedFromApi = dataSource === 'api';

  if (isEditMode) {
    return (
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.errorMessage}>{error}</div>}
        {infoMessage && <div className={styles.infoMessage}>{infoMessage}</div>}

        <div className={styles.formGroup}>
          <label htmlFor="playerId" className={styles.label}>
            In-Game Player ID
          </label>
          <div className={styles.inputWithButton}>
            <input
              type="text"
              id="playerId"
              name="playerId"
              value={formData.playerId}
              onChange={handleChange}
              className={styles.input}
              placeholder="e.g. 123123123"
            />
            <button
              type="button"
              onClick={handleRefetch}
              disabled={isLoading || !formData.playerId}
              className={styles.refetchButton}
            >
              {isLoading ? 'Fetching...' : 'Refetch'}
            </button>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="name" className={styles.label}>
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            className={`${styles.input} ${styles.readOnlyInput}`}
            placeholder="Player name"
            readOnly
            tabIndex={-1}
          />
          <small className={styles.readOnlyHint}>Read-only: from the game</small>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="aliasName" className={styles.label}>
            Alias
          </label>
          <input
            type="text"
            id="aliasName"
            name="aliasName"
            value={formData.aliasName}
            onChange={handleChange}
            className={styles.input}
            placeholder="Player alias"
          />
        </div>

        {allianceField}

        {rankField}

        {gameField('power', 'Power')}

        <div className={styles.formGroup}>
          <label htmlFor="swordlandPower" className={styles.label}>
            Swordland Power
          </label>
          <input
            type="number"
            id="swordlandPower"
            name="swordlandPower"
            value={formData.swordlandPower}
            onChange={handleChange}
            className={styles.input}
            placeholder="0"
            min="0"
            readOnly={lockedFromApi}
          />
          {lockedFromApi && <small className={styles.readOnlyHint}>Read-only (from API)</small>}
        </div>

        {gameField('trialliancePower', 'Tri Alliance Power')}

        {gameField('levelImage', 'Level Image URL')}

        <div className={styles.actions}>
          <button type="button" onClick={onCancel} className={styles.cancelButton}>
            Cancel
          </button>
          <button type="submit" className={styles.submitButton} disabled={isLoading || isSaving}>
            {isLoading || isSaving ? 'Updating...' : 'Update Player'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.errorMessage}>{error}</div>}
      {infoMessage && <div className={styles.infoMessage}>{infoMessage}</div>}

      <div className={styles.formGroup}>
        <label htmlFor="playerId" className={styles.label}>
          In-Game Player ID <span className={styles.required}>*</span>
        </label>
        {detailsStage ? (
          <div className={styles.inputWithButton}>
            <input
              type="text"
              id="playerId"
              name="playerId"
              value={formData.playerId}
              onChange={handleChange}
              className={styles.input}
              placeholder="e.g. 123123123"
              readOnly
              required
            />
            <button
              type="button"
              onClick={handleRefetch}
              disabled={isLoading || !formData.playerId}
              className={styles.refetchButton}
            >
              {isLoading ? 'Fetching...' : 'Refetch'}
            </button>
          </div>
        ) : (
          <input
            type="text"
            id="playerId"
            name="playerId"
            value={formData.playerId}
            onChange={handleChange}
            className={styles.input}
            placeholder="e.g. 123123123"
            required
          />
        )}
      </div>

      {!detailsStage ? (
        // Step 1: Only playerId, show fetch button
        <div className={styles.actions}>
          <button type="button" onClick={onCancel} className={styles.cancelButton}>
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading || !formData.playerId}
          >
            {isLoading ? 'Fetching...' : 'Fetch Player'}
          </button>
        </div>
      ) : (
        // Step 2: After lookup, show the remaining fields
        <>
          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.label}>
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={styles.input}
              placeholder="Player name"
              readOnly={lockedFromApi}
            />
            {lockedFromApi && <small className={styles.readOnlyHint}>Read-only (from API)</small>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="aliasName" className={styles.label}>
              Alias
            </label>
            <input
              type="text"
              id="aliasName"
              name="aliasName"
              value={formData.aliasName}
              onChange={handleChange}
              className={styles.input}
              placeholder="Player alias"
            />
          </div>

          {allianceField}

          {rankField}

          {gameField('power', 'Power')}

          <div className={styles.formGroup}>
            <label htmlFor="swordlandPower" className={styles.label}>
              Swordland Power
            </label>
            <input
              type="number"
              id="swordlandPower"
              name="swordlandPower"
              value={formData.swordlandPower}
              onChange={handleChange}
              className={styles.input}
              placeholder="0"
              min="0"
            />
          </div>

          {gameField('trialliancePower', 'Tri Alliance Power')}

          <div className={styles.formGroup}>
            <label htmlFor="profilePhoto" className={styles.label}>
              Profile Photo URL
            </label>
            <input
              type="text"
              id="profilePhoto"
              name="profilePhoto"
              value={formData.profilePhoto}
              onChange={handleChange}
              className={styles.input}
              placeholder="https://example.com/photo.jpg"
            />
          </div>

          {gameField('levelImage', 'Level Image URL')}

          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => {
                setDetailsStage(false);
                setFormData((prev) => ({ ...prev, allianceId }));
                setPendingAlliance(null);
                setOtherKingdom(null);
                setDataSource(null);
                setFoundPlayerId(null);
                setError(null);
                setInfoMessage(null);
              }}
              className={styles.cancelButton}
            >
              Back
            </button>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" className={styles.submitButton} disabled={isLoading || isSaving}>
              {isLoading || isSaving ? 'Adding...' : 'Add Player'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
