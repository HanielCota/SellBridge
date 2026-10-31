/** The highest count a round header badge shows; above it the badge reads "9+". */
const MAX_BADGE_COUNT = 9;

/**
 * What a round header badge shows for a count: the number up to 9, then "9+".
 *
 * @param count - Unread items, a non-negative integer.
 * @returns The badge text, which the button's accessible name repeats so it matches what is seen.
 */
export function badgeCount(count: number): string {
  return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
}
