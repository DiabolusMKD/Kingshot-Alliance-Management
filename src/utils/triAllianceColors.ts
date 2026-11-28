// Tri-Alliance: the 3 alliances of a battle are told apart by color, known once the in-game
// matchmaking is done (ours too). Fixed order: Blue is on Yellow's right, Red on Blue's right,
// Yellow on Red's right. So each alliance's right side (Team 1 + 2) fights the left side (Team 3 + 4)
// of the alliance on its right:
//   Yellow right vs Blue left · Blue right vs Red left · Red right vs Yellow left

export const TRI_COLORS = ["yellow", "blue", "red"] as const;
export type TriColor = (typeof TRI_COLORS)[number];

export const TRI_COLOR_LABELS: Record<TriColor, string> = {
  yellow: "Yellow",
  blue: "Blue",
  red: "Red",
};

export const TRI_COLOR_HEX: Record<TriColor, string> = {
  yellow: "#eab308",
  blue: "#3b82f6",
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

/** The alliance a side of ours fights: its color and tag (null while that opponent isn't added) */
export interface FacingAlliance {
  color: TriColor;
  tag: string | null;
}

/** Our color in a legion (set, or the only one left) and who our right and left sides fight */
export function legionSides(
  own: TriColor | null,
  opponents: { color?: TriColor | null; allianceTag: string }[],
): { own: TriColor | null; right: FacingAlliance | null; left: FacingAlliance | null } {
  const resolved = resolveColors(own, opponents.map((o) => o.color ?? null));
  const facing = (target: TriColor | null): FacingAlliance | null => {
    if (!target) return null;
    const index = resolved.opponents.indexOf(target);
    return { color: target, tag: index === -1 ? null : opponents[index].allianceTag };
  };
  const ownColor = resolved.own;
  return {
    own: ownColor,
    right: facing(ownColor ? rightOpponentColor(ownColor) : null),
    left: facing(ownColor ? leftOpponentColor(ownColor) : null),
  };
}

/** "Blue [ABC]" (or just the color) */
export const formatFacing = (facing: FacingAlliance) =>
  `${TRI_COLOR_LABELS[facing.color]}${facing.tag ? ` [${facing.tag}]` : ""}`;
