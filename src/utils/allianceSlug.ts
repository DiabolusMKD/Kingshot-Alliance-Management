import { Alliance } from '@/types';

const SLUG_LENGTH = 8;
const SLUG_SPACE = Math.pow(36, SLUG_LENGTH);

/**
 * Deterministically hashes an alliance id into an 8-character
 * base36 string (cyrb53-derived) so the id isn't exposed directly in URLs.
 */
function hashAllianceId(id: number): string {
  const str = String(id);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return (hash % SLUG_SPACE).toString(36).padStart(SLUG_LENGTH, '0');
}

/**
 * Builds the per-alliance URL segment: the literal word "alliance" followed
 * by an 8-character hash of the alliance's id, e.g. id 3 -> "alliance7k2m9xa0".
 */
export function getAllianceSlug(id: number): string {
  return `alliance${hashAllianceId(id)}`;
}

export function findAllianceBySlug(alliances: Alliance[], slug: string): Alliance | undefined {
  const normalizedSlug = slug.trim().toLowerCase();
  return alliances.find((alliance) => getAllianceSlug(alliance.id) === normalizedSlug);
}
