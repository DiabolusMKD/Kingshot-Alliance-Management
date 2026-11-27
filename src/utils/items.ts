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

/** "1K ×100" for 100 × 1000 wood, "×2,027" for 2027 gems, "1K" for a single 1000-gem pack. */
export function formatItemQuantity({ amount, count }: ItemQuantity): string {
  if (!amount || amount === 1) return `×${grouped.format(count)}`;
  return count === 1 ? compact.format(amount) : `${compact.format(amount)} ×${grouped.format(count)}`;
}
