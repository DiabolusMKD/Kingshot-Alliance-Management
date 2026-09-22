'use client';

import { useState } from 'react';
import { Alliance } from '@/types';
import { DEFAULT_ALLIANCE_IMAGE_URL } from '@/utils/constants';
import styles from './AllianceForm.module.css';

interface AllianceFormProps {
  kingdomId: number;
  alliance?: Alliance;
  onSubmit: (alliance: Omit<Alliance, 'id' | 'created_at'>) => Promise<void>;
  onCancel: () => void;
}

export default function AllianceForm({ kingdomId, alliance, onSubmit, onCancel }: AllianceFormProps) {
  const isEditing = Boolean(alliance);
  const [name, setName] = useState(alliance?.name ?? '');
  const [nameTag, setNameTag] = useState(alliance?.nameTag ?? '');
  const [description, setDescription] = useState(alliance?.description ?? '');
  const [allianceImageUrl, setAllianceImageUrl] = useState(
    alliance ? alliance.allianceImageUrl ?? DEFAULT_ALLIANCE_IMAGE_URL : ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!nameTag.trim()) {
      setError('Tag is required');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await onSubmit({
        name: name.trim(),
        nameTag: nameTag.trim(),
        description: description.trim() || null,
        allianceImageUrl: allianceImageUrl.trim() || null,
        kingdomId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'create'} alliance`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.formGroup}>
        <label htmlFor="name" className={styles.label}>
          Name<span className={styles.required}>*</span>
        </label>
        <input
          id="name"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="nameTag" className={styles.label}>
          Tag<span className={styles.required}>*</span>
        </label>
        <input
          id="nameTag"
          className={styles.input}
          value={nameTag}
          onChange={(e) => setNameTag(e.target.value)}
          disabled={isLoading}
          placeholder="e.g. ABC"
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="description" className={styles.label}>
          Description
        </label>
        <textarea
          id="description"
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="allianceImageUrl" className={styles.label}>
          Image URL
        </label>
        <input
          id="allianceImageUrl"
          className={styles.input}
          value={allianceImageUrl}
          onChange={(e) => setAllianceImageUrl(e.target.value)}
          disabled={isLoading}
          placeholder="https://..."
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={isLoading}>
          Cancel
        </button>
        <button type="submit" className={styles.saveButton} disabled={isLoading}>
          {isLoading ? (isEditing ? 'Saving...' : 'Creating...') : isEditing ? 'Save Changes' : 'Create Alliance'}
        </button>
      </div>
    </form>
  );
}
