// Tri-Alliance: the 3 alliances of a battle are told apart by color, known once the in-game
// matchmaking is done (ours too). Fixed order: Purple is on Yellow's right, Red on Purple's right,
// Yellow on Red's right. So each alliance's right side (Team 1 + 2) fights the left side (Team 3 + 4)
// of the alliance on its right:
//   Yellow right vs Purple left · Purple right vs Red left · Red right vs Yellow left

export const TRI_COLORS = ["yellow", "purple", "red"] as const;
export type TriColor = (typeof TRI_COLORS)[number];

export const TRI_COLOR_LABELS: Record<TriColor, string> = {
  yellow: "Yellow",
  purple: "Purple",
  red: "Red",
};

export const TRI_COLOR_HEX: Record<TriColor, string> = {
  yellow: "#eab308",
  purple: "#a855f7",
  red: "#ef4444",
};

export const isTriColor = (value: unknown): value is TriColor =>
  typeof value === "string" && (TRI_COLORS as readonly string[]).includes(value);

/** The alliance whose left side our right side fights */
export const rightOpponentColor = (color: TriColor): TriColor =>
  TRI_COLORS[(TRI_COLORS.indexOf(color) + 1) % TRI_COLORS.length];
/** The alliance whose right side our left side fights */
export const leftOpponentColor = (color: TriColor): TriColor =>
  TRI_COLORS[(TRI_COLORS.indexOf(color) + TRI_COLORS.length - 1) % TRI_COLORS.length];

export type TriSide = "right" | "left";

/** Which side of `color` fights `other` (null when a color is missing or they're the same) */
export const sideFacing = (color: TriColor | null, other: TriColor | null): TriSide | null => {
  if (!color || !other || color === other) return null;
  return rightOpponentColor(color) === other ? "right" : "left";
};

/** Team indexes of a side: outer first, then inner (Team 1/2 right, Team 3/4 left) */
export const SIDE_TEAMS: Record<TriSide, [outer: number, inner: number]> = {
  right: [0, 1],
  left: [2, 3],
};

/**
 * The colors of a legion, the only missing one filled in when the other two are known
 * (two opponents with colors give ours; ours + one opponent give the other opponent's).
 */
export function resolveColors(
  own: TriColor | null,
  opponents: (TriColor | null)[],
): { own: TriColor | null; opponents: (TriColor | null)[] } {
  const known = [own, ...opponents].filter((c): c is TriColor => !!c);
  const missingSlots = [own, ...opponents].filter((c) => !c).length;
  const distinct = new Set(known);
  // Only fill in when exactly one of the 3 is missing and the others don't clash
  if (opponents.length !== 2 || missingSlots !== 1 || distinct.size !== known.length) return { own, opponents };
  const remaining = TRI_COLORS.find((c) => !distinct.has(c))!;
  return own ? { own, opponents: opponents.map((c) => c ?? remaining) } : { own: remaining, opponents };
}
