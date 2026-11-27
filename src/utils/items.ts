import { ItemQuantity } from '@/types';

// In-game items, shared by every feature that shows them (gift code rewards, ...).
// Items are identified by kingshot.net's slugs (e.g. "general-speedup"). The ones we
// have art for live at public/images/items/<slug>.webp; add the file and the slug here
// to give a new item its icon.
const ITEMS_WITH_ICON = new Set([
  'artisans-vision',
  'bread',
  'charm-design',
  'charm-guide',
  'community-star-avatar-frame',
  'construction-speedup',
  'gem',
  'general-speedup',
  'gift',
  'gold-key',
  'governor-stamina',
  'hero-xp',
  'iron',
  'mythic-conquest-skill-book',
  'mythic-expedition-skill-manual',
  'mythic-hero-shard',
  'platinum-key',
  'research-speedup',
  'stone',
  'training-speedup',
  'transfer-pass',
  'vip-xp',
  'wood',
]);

// Names that don't follow from the slug ("hero-xp" -> "Hero Xp")
const ITEM_LABELS: Record<string, string> = {
  gem: 'Gems',
  'hero-xp': 'Hero XP',
  'vip-xp': 'VIP XP',
  'artisans-vision': "Artisan's Vision",
  'mythic-hero-shard': 'Mythic General Hero Shard',
  'epic-hero-shard': 'Epic General Hero Shard',
  'rare-hero-shard': 'Rare General Hero Shard',
};

/** Icon URL for an item, or null when we have no art for it. */
export function itemIcon(slug: string): string | null {
  return ITEMS_WITH_ICON.has(slug) ? `/images/items/${slug}.webp` : null;
}

export function itemLabel(slug: string): string {
  return ITEM_LABELS[slug] ?? slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const grouped = new Intl.NumberFormat('en');

/** Speedups come in minutes: 5 -> "5m", 60 -> "1h", 90 -> "1h 30m", 1440 -> "1d". */
function formatDuration(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.round(minutes % 60);
  return [days && `${days}d`, hours && `${hours}h`, mins && `${mins}m`].filter(Boolean).join(' ') || '0m';
}

const isSpeedup = (slug: string) => slug.endsWith('-speedup');

/**
 * "1K ×100" for 100 × 1000 wood, "×2,027" for 2027 gems, "1K" for a single 1000-gem pack,
 * "5m ×20" for twenty 5-minute speedups.
 */
export function formatItemQuantity({ item, amount, count }: ItemQuantity): string {
  if (!amount || (amount === 1 && !isSpeedup(item))) return `×${grouped.format(count)}`;
  const size = isSpeedup(item) ? formatDuration(amount) : compact.format(amount);
  return count === 1 ? size : `${size} ×${grouped.format(count)}`;
}
