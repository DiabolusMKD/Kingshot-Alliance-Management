import { Alliance } from '@/types';
import { hashToSlug } from './slugHash';

/**
 * Builds the per-alliance URL segment: the literal word "alliance" followed
 * by an 8-character hash of the alliance's id, e.g. id 3 -> "alliance7k2m9xa0".
 */
export function getAllianceSlug(id: number): string {
  return `alliance${hashToSlug(String(id))}`;
}

export function findAllianceBySlug(alliances: Alliance[], slug: string): Alliance | undefined {
  const normalizedSlug = slug.trim().toLowerCase();
  return alliances.find((alliance) => getAllianceSlug(alliance.id) === normalizedSlug);
}
