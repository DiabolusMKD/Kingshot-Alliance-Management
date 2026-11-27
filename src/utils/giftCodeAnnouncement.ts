import { GiftCode } from '@/types';
import { formatItemQuantity, itemLabel } from './items';

// The message shared in game / on Discord when a redemption run starts.

export interface AnnouncementPlayer {
  name: string;
  jailed?: boolean;
}

export interface GiftCodeAnnouncementInput {
  codes: GiftCode[];
  /** Who receives the codes, e.g. "every player in Kingdom 1010", "every member of [ABC]Alliance" */
  target: string;
  /** Players left out of this delivery (hand-picked or jailed) */
  excluded?: AnnouncementPlayer[];
}

const listCodes = (codes: string[]) =>
  codes.length <= 1 ? codes.join('') : `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;

/** Bullet list of a code's items, or null when kingshot.net doesn't list them. */
function rewardLines(code: GiftCode): string[] | null {
  if (code.reward?.kind !== 'items' || code.reward.items.length === 0) return null;
  return code.reward.items.map((item) => `• ${itemLabel(item.item)} ${formatItemQuantity(item)}`);
}

export function buildGiftCodeAnnouncement({ codes, target, excluded = [] }: GiftCodeAnnouncementInput): string {
  const names = codes.map((c) => c.code);
  const plural = codes.length > 1;
  const lines: string[] = [
    '🎁 Gift code delivery started! 🎁',
    '',
    `We're delivering the new gift code${plural ? 's' : ''} ${listCodes(names)} to ${target}! 🚀`,
  ];

  // Rewards: one list for a single code, one per code otherwise
  const withRewards = codes.map((code) => ({ code: code.code, rewards: rewardLines(code) })).filter((c) => c.rewards);
  if (withRewards.length > 0) {
    lines.push('');
    if (!plural) {
      lines.push('🎉 Rewards:', ...withRewards[0].rewards!);
    } else {
      withRewards.forEach(({ code, rewards }, index) => {
        if (index > 0) lines.push('');
        lines.push(`🎉 ${code}:`, ...rewards!);
      });
    }
  }

  lines.push(
    '',
    'Nothing to do on your side: keep an eye on your in-game mail and collect your rewards as they arrive. Enjoy! 💪'
  );

  if (excluded.length > 0) {
    const jailed = excluded.filter((p) => p.jailed).map((p) => p.name);
    const others = excluded.filter((p) => !p.jailed).map((p) => p.name);
    lines.push('', `⛔ Not included this time (${excluded.length}):`);
    if (others.length > 0) lines.push(others.join(', '));
    if (jailed.length > 0) lines.push(`🔒 Jailed: ${jailed.join(', ')}`);
  }

  return lines.join('\n');
}
