'use client';

import { useEffect, useRef, useState } from 'react';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import {
  AllianceCooldownError,
  AllianceImportResult,
  AllianceNotFoundError,
  fetchGameAlliance,
  importGameAlliance,
} from '@/utils/allianceImport';
import formStyles from './AllianceForm.module.css';
import styles from './AddAllianceForm.module.css';

interface AddAllianceFormProps {
  kingdomId: number;
  /** "Update Alliance": this alliance's tag, fixed; the update starts right away */
  updateTag?: string;
  /** Busy while the game is called / players are saved (e.g. to keep the dialog open) */
  onBusyChange?: (busy: boolean) => void;
  /** After the alliance and its players were saved (e.g. reload the page) */
  onImported: (result: AllianceImportResult) => Promise<void> | void;
  onCancel: () => void;
}

type Step =
  | { kind: 'idle' }
  | { kind: 'fetching' }
  | { kind: 'saving'; done: number; total: number }
  | { kind: 'done'; result: AllianceImportResult };

/** "Add Alliance": the tag is looked up in the game; the alliance and all its players are added / updated */
export default function AddAllianceForm({
  kingdomId,
  updateTag,
  onBusyChange,
  onImported,
  onCancel,
}: AddAllianceFormProps) {
  const isUpdate = updateTag !== undefined;
  const [tag, setTag] = useState(updateTag ?? '');
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  const isBusy = step.kind === 'fetching' || step.kind === 'saving';
  const isValid = [...tag].length === 3 && !/\s/.test(tag);

  const started = useRef(false);

  useEffect(() => {
    onBusyChange?.(isBusy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBusy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isBusy) return;
    await run();
  };

  const run = async () => {
    setError(null);
    setStep({ kind: 'fetching' });
    try {
      const game = await fetchGameAlliance(kingdomId, tag);
      setStep({ kind: 'saving', done: 0, total: game.members.length });
      const result = await importGameAlliance(kingdomId, game, (done, total) =>
        setStep({ kind: 'saving', done, total }),
      );
      await onImported(result);
      setStep({ kind: 'done', result });
    } catch (err) {
      setStep({ kind: 'idle' });
      setError(
        err instanceof AllianceNotFoundError
          ? { title: `[${tag}] isn't created yet`, message: err.message }
          : err instanceof AllianceCooldownError
            ? { title: 'Updated recently', message: err.message }
            : { title: 'Something went wrong', message: err instanceof Error ? err.message : 'Failed to add the alliance' },
      );
    }
  };

  // Update Alliance starts as soon as the dialog opens (once, also in Strict Mode)
  useEffect(() => {
    if (!isUpdate || started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step.kind === 'done') {
    const { result } = step;
    return (
      <div className={formStyles.form}>
        <div className={styles.success} role="status">
          <strong>
            {formatAllianceLabel(result.alliance)} {result.createdAlliance ? 'added' : 'updated'}
          </strong>
          <span>
            {result.added} player{result.added === 1 ? '' : 's'} added · {result.updated} updated
            {result.removed.length > 0 && ` · ${result.removed.length} removed (left the alliance)`}
            {result.failed.length > 0 && ` · ${result.failed.length} failed`}
          </span>
        </div>
        {result.removed.length > 0 && (
          <p className={styles.removedNote}>
            Removed from the alliance (not on the game&apos;s roster any more): {result.removed.join(', ')}
          </p>
        )}
        {result.failed.length > 0 && (
          <ul className={styles.failedList}>
            {result.failed.map((f) => (
              <li key={f.name}>
                {f.name}: {f.error}
              </li>
            ))}
          </ul>
        )}
        <div className={formStyles.actions}>
          <button type="button" className={formStyles.saveButton} onClick={onCancel}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={formStyles.form} onSubmit={handleSubmit}>
      <p className={styles.intro}>
        {isUpdate
          ? `[${tag}] is pulled from the game: its players are updated, new members are added and players who left are removed from it.`
          : `Enter the alliance tag as it is in the game. The alliance is looked up in Kingdom ${kingdomId}: its players already in the app are updated (and moved here), the missing ones are added, and players who left it in the game are removed from it.`}
      </p>

      {error && (
        <div className={styles.error} role="alert">
          <strong>{error.title}</strong>
          <span>{error.message}</span>
        </div>
      )}

      {!isUpdate && (
        <div className={formStyles.formGroup}>
          <label htmlFor="allianceTag" className={formStyles.label}>
            Alliance tag<span className={formStyles.required}>*</span>
          </label>
          <input
            id="allianceTag"
            type="text"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value.replace(/\s/g, ''));
              setError(null);
            }}
            className={`${formStyles.input} ${styles.tagInput}`}
            placeholder="fKn"
            maxLength={3}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={isBusy}
            autoFocus
          />
          <small className={styles.hint}>3 characters, case-sensitive: fKn, FKN and Fkn are different alliances.</small>
        </div>
      )}

      {isBusy && (
        <div className={styles.progress} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          {step.kind === 'fetching'
            ? 'Looking up the alliance in the game (this can take up to 30 seconds)...'
            : `Saving players ${step.done} / ${step.total}...`}
        </div>
      )}

      <div className={formStyles.actions}>
        <button type="button" className={formStyles.cancelButton} onClick={onCancel} disabled={isBusy}>
          {isUpdate ? 'Close' : 'Cancel'}
        </button>
        {!isUpdate && (
          <button type="submit" className={formStyles.saveButton} disabled={!isValid || isBusy}>
            {isBusy ? 'Adding...' : 'Add'}
          </button>
        )}
      </div>
    </form>
  );
}
