'use client';

import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { useToast } from './Toast';
import { DiscordTarget, isDiscordConfigured, sendDiscordTest, setDiscordWebhook } from '@/utils/discordService';
import styles from './DiscordSettingsButton.module.css';

interface DiscordSettingsButtonProps {
  target: DiscordTarget;
  /** Whose channel, e.g. "Kingdom 1010" or "[ABC]Alliance" */
  label: string;
  className?: string;
}

/** "Discord" button + dialog to set, test or remove the channel gift code messages are posted to. */
export default function DiscordSettingsButton({ target, label, className }: DiscordSettingsButtonProps) {
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [url, setUrl] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const targetKey = JSON.stringify(target);

  useEffect(() => {
    let isMounted = true;
    isDiscordConfigured(JSON.parse(targetKey) as DiscordTarget)
      .then((value) => isMounted && setConfigured(value))
      .catch(() => isMounted && setConfigured(false));
    return () => {
      isMounted = false;
    };
  }, [targetKey]);

  const run = async (action: () => Promise<void>, success: string) => {
    setIsBusy(true);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Discord request failed');
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const save = async () => {
    const ok = await run(() => setDiscordWebhook(target, url.trim()), 'Discord channel saved (a confirmation was posted there)');
    if (ok) {
      setConfigured(true);
      setUrl('');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Stop posting to ${label}'s Discord channel?`)) return;
    if (await run(() => setDiscordWebhook(target, null), 'Discord channel removed')) setConfigured(false);
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setIsOpen(true)}>
        Discord{configured ? ' ✓' : ''}
      </button>

      <Dialog isOpen={isOpen} title={`Discord channel · ${label}`} onClose={() => setIsOpen(false)} closeDisabled={isBusy}>
        <div className={styles.body}>
          <p className={styles.status}>
            {configured === null ? 'Checking...' : configured ? (
              <span className={styles.connected}>● Connected: gift code deliveries are posted there.</span>
            ) : (
              <span className={styles.muted}>No channel set.</span>
            )}
          </p>

          <ol className={styles.steps}>
            <li>In Discord, open the channel&apos;s settings → Integrations → Webhooks → New Webhook.</li>
            <li>Copy Webhook URL and paste it below. It stays private on the server.</li>
          </ol>

          <div className={styles.row}>
            <input
              type="url"
              className={styles.input}
              placeholder="https://discord.com/api/webhooks/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isBusy}
            />
            <button type="button" className={styles.primary} onClick={save} disabled={isBusy || !url.trim()}>
              {configured ? 'Replace' : 'Save'}
            </button>
          </div>

          {configured && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => run(() => sendDiscordTest(target), 'Test message sent')}
                disabled={isBusy}
              >
                Send test message
              </button>
              <button type="button" className={`${styles.secondary} ${styles.danger}`} onClick={remove} disabled={isBusy}>
                Remove
              </button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
