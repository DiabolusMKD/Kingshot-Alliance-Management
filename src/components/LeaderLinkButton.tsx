'use client';

import { useState } from 'react';
import Dialog from './Dialog';
import { useToast } from './Toast';
import { generateLeaderKey } from '@/utils/discordService';
import styles from './DiscordSettingsButton.module.css';

interface LeaderLinkButtonProps {
  allianceId: number;
  /** Page the link opens (the alliance page) */
  path: string;
  label: string;
  className?: string;
}

/** God only: generates the link that lets the alliance's Leader set its Discord channel. */
export default function LeaderLinkButton({ allianceId, path, label, className }: LeaderLinkButtonProps) {
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const generate = async () => {
    if (!window.confirm(`Generate a new Leader link for ${label}? The previous link stops working.`)) return;
    setIsBusy(true);
    try {
      const key = await generateLeaderKey(allianceId);
      setLink(`${window.location.origin}${path}?mode=${encodeURIComponent(key)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate the Leader link');
    } finally {
      setIsBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Leader link copied');
    } catch {
      toast.error('Copy failed: select the link and copy it by hand');
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={generate} disabled={isBusy}>
        Leader link
      </button>
      <Dialog isOpen={link !== null} title={`Leader link · ${label}`} onClose={() => setLink(null)}>
        <div className={styles.body}>
          <p className={styles.muted}>
            Send this link to the alliance leader. It lets them set the alliance&apos;s Discord channel for gift code
            messages. It is shown only once; generate a new one to revoke it.
          </p>
          <div className={styles.row}>
            <input className={styles.input} value={link ?? ''} readOnly onFocus={(e) => e.target.select()} />
            <button type="button" className={styles.primary} onClick={copy}>
              Copy
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
