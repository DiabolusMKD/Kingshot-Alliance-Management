/** Shown on an alliance page when the alliance has no image of its own: our shield emblem */
export const DEFAULT_ALLIANCE_IMAGE_URL = '/logo-emblem.png';

/** In-game maximum number of members per alliance */
export const MAX_ALLIANCE_PLAYERS = 100;

/** Swordland / Tri Alliance: players per legion (buildings / areas) and substitutes per legion */
export const MAX_LEGION_PLAYERS = 30;
export const MAX_LEGION_SUBSTITUTES = 20;

/** Opponents per legion: Swordland is 1 vs 1, Tri Alliance is 3 alliances (2 opponents) */
export const OPPONENTS_PER_LEGION = { swordland: 1, 'tri-alliance': 2 } as const;

/** Registered combatants of an opponent until it's changed */
export const DEFAULT_REGISTERED_COMBATANTS = 30;
export const DEFAULT_REGISTERED_SUBSTITUTES = 0;
