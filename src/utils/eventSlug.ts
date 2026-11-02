import { AllianceEvent } from '@/types';
import { hashToSlug } from './slugHash';

/**
 * Builds the URL value for an alliance event (used as ?event=...), e.g. "ev3k9x0m2a".
 * Salted with "event:" so an event and an alliance with the same id get different slugs.
 */
export function getEventSlug(id: number): string {
  return `ev${hashToSlug(`event:${id}`)}`;
}

export function findEventBySlug(events: AllianceEvent[], slug: string): AllianceEvent | undefined {
  const normalizedSlug = slug.trim().toLowerCase();
  return events.find((event) => event.id !== undefined && getEventSlug(event.id) === normalizedSlug);
}
