'use client';

import { useState, useEffect } from 'react';
import { Alliance, Player } from '@/types';
import { fetchPlayerFromKingshot } from '@/utils/kingshotApi';
import { getPlayerByPlayerId } from '@/utils/playerService';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import styles from './PlayerForm.module.css';

interface PlayerFormProps {
  player?: Player;
  kingdomId: number;
  allianceId: string;
  alliances: Alliance[];
  onSubmit: (player: Omit<Player, 'id' | 'created_at' | 'updated_at'>, existingPlayerId?: string) => void;
  onCancel: () => void;
}

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
};

type DataSource = 'database' | 'api' | 'manual' | null;

export default function PlayerForm({ player, kingdomId, allianceId, alliances, onSubmit, onCancel }: PlayerFormProps) {
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [detailsStage, setDetailsStage] = useState(false);
  const [foundPlayerId, setFoundPlayerId] = useState<string | null>(null);
  const isEditMode = !!player;

  useEffect(() => {
    if (player) {
      // Edit mode: populate with existing player data
      setFormData({
        playerId: player.playerId || '',
        name: player.name || '',
        aliasName: player.aliasName || '',
        swordlandPower: player.swordlandPower ?? 0,
        trialliancePower: player.trialliancePower ?? 0,
        power: player.power ?? 0,
        profilePhoto: player.profilePhoto || '',
        levelImage: player.levelImage || '',
        allianceId: player.allianceId ? String(player.allianceId) : allianceId,
      });
      setDataSource(null);
      setDetailsStage(true);
      setFoundPlayerId(null);
      setError(null);
      setInfoMessage(null);
    } else {
      setFormData(EMPTY_FORM_DATA);
      setDataSource(null);
      setDetailsStage(false);
      setFoundPlayerId(null);
      setError(null);
      setInfoMessage(null);
    }
  }, [player]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericFields = ['swordlandPower', 'trialliancePower', 'power'];

    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.includes(name) && value ? Number(value) : value,
    }));
    setError(null);
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
      setFormData((prev) => {
        const name = playerData.name || prev.name;
        return {
          ...prev,
          name,
          aliasName: prev.aliasName || name,
          profilePhoto: playerData.profilePhoto || prev.profilePhoto,
          levelImage: playerData.levelImage || prev.levelImage,
        };
      });
      setDataSource('api');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch player data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchPlayer = async () => {
    if (!formData.playerId) {
      setError('Please enter a Player ID');
      return;
    }

    setIsLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const existingPlayer = await getPlayerByPlayerId(formData.playerId);

      if (existingPlayer) {
        setFormData((prev) => ({
          ...prev,
          name: existingPlayer.name || '',
          aliasName: existingPlayer.aliasName || existingPlayer.name || '',
          power: existingPlayer.power ?? 0,
          swordlandPower: existingPlayer.swordlandPower ?? 0,
          trialliancePower: existingPlayer.trialliancePower ?? 0,
          profilePhoto: existingPlayer.profilePhoto || '',
          levelImage: existingPlayer.levelImage || '',
        }));
        setDataSource('database');
        setFoundPlayerId(existingPlayer.id);
        setInfoMessage('Existing player found. Fields are editable below.');
        setDetailsStage(true);
        return;
      }

      try {
        const kingshotData = await fetchPlayerFromKingshot(formData.playerId);
        setFormData((prev) => {
          const name = kingshotData.name || '';
          return {
            ...prev,
            name,
            aliasName: prev.aliasName || name,
            profilePhoto: kingshotData.profilePhoto || prev.profilePhoto,
            levelImage: kingshotData.levelImage || prev.levelImage,
          };
        });
        setDataSource('api');
        setInfoMessage('Player found via the Kingshot API.');
      } catch {
        setDataSource('manual');
        setInfoMessage('Player not found. Please enter the details manually.');
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

    // Add mode always targets the alliance being added to; edit mode uses the
    // (possibly changed) alliance selected in the dropdown below.
    const targetAllianceId = isEditMode ? formData.allianceId : allianceId;
    onSubmit({ ...formData, kingdomId, allianceId: targetAllianceId }, foundPlayerId ?? undefined);
  };

  const lockedFromApi = dataSource === 'api';

  if (isEditMode) {
    return (
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.errorMessage}>{error}</div>}

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
            onChange={handleChange}
            className={styles.input}
            placeholder="Player name"
            readOnly={lockedFromApi}
          />
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

        <div className={styles.formGroup}>
          <label htmlFor="allianceId" className={styles.label}>
            Alliance
          </label>
          <select
            id="allianceId"
            name="allianceId"
            value={formData.allianceId}
            onChange={(e) => setFormData((prev) => ({ ...prev, allianceId: e.target.value }))}
            className={styles.input}
          >
            {alliances
              .filter((a) => a.kingdomId === kingdomId)
              .map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {formatAllianceLabel(a)}
                </option>
              ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="power" className={styles.label}>
            Power
          </label>
          <input
            type="number"
            id="power"
            name="power"
            value={formData.power}
            onChange={handleChange}
            className={styles.input}
            placeholder="0"
            min="0"
          />
        </div>

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

        <div className={styles.formGroup}>
          <label htmlFor="trialliancePower" className={styles.label}>
            Tri Alliance Power
          </label>
          <input
            type="number"
            id="trialliancePower"
            name="trialliancePower"
            value={formData.trialliancePower}
            onChange={handleChange}
            className={styles.input}
            placeholder="0"
            min="0"
            readOnly={lockedFromApi}
          />
          {lockedFromApi && <small className={styles.readOnlyHint}>Read-only (from API)</small>}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="levelImage" className={styles.label}>
            Level Image URL
          </label>
          <input
            type="text"
            id="levelImage"
            name="levelImage"
            value={formData.levelImage}
            onChange={handleChange}
            className={styles.input}
            placeholder="https://example.com/level.png"
          />
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={onCancel} className={styles.cancelButton}>
            Cancel
          </button>
          <button type="submit" className={styles.submitButton} disabled={isLoading}>
            {isLoading ? 'Updating...' : 'Update Player'}
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

          <div className={styles.formGroup}>
            <label htmlFor="power" className={styles.label}>
              Power
            </label>
            <input
              type="number"
              id="power"
              name="power"
              value={formData.power}
              onChange={handleChange}
              className={styles.input}
              placeholder="0"
              min="0"
            />
          </div>

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

          <div className={styles.formGroup}>
            <label htmlFor="trialliancePower" className={styles.label}>
              Tri Alliance Power
            </label>
            <input
              type="number"
              id="trialliancePower"
              name="trialliancePower"
              value={formData.trialliancePower}
              onChange={handleChange}
              className={styles.input}
              placeholder="0"
              min="0"
            />
          </div>

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

          <div className={styles.formGroup}>
            <label htmlFor="levelImage" className={styles.label}>
              Level Image URL
            </label>
            <input
              type="text"
              id="levelImage"
              name="levelImage"
              value={formData.levelImage}
              onChange={handleChange}
              className={styles.input}
              placeholder="https://example.com/level.png"
            />
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => {
                setDetailsStage(false);
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
            <button type="submit" className={styles.submitButton} disabled={isLoading}>
              {isLoading ? 'Adding...' : 'Add Player'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
