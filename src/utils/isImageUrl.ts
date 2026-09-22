/**
 * Distinguishes an actual image URL from plain text/number values that a
 * user may enter into an image field (e.g. a level number instead of a URL).
 */
export function isImageUrl(value: string): boolean {
  return /^(https?:\/\/|data:image\/|\/)/i.test(value.trim());
}

/**
 * Caps a non-URL level value (expected to be 1-30 chars) to 2 characters so
 * it never breaks the fixed-size level badge/box layout.
 */
export function truncateLevelLabel(value: string): string {
  return value.trim().slice(0, 2);
}
