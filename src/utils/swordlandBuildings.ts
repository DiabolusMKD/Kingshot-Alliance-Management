import { BuildingAssignment, LegionBuildingData, Player, PlayerAssignment } from "@/types";

export const BUILDINGS = [
  "Sanctum North-West",
  "Sanctum South-East",
  "Abbey 1",
  "Abbey 2",
  "Abbey 3",
  "Abbey 4",
  "Bell Tower",
  "Stables",
  "Undercellars",
];

export const UNDERCELLARS = "Undercellars";

export type SwordlandLegion = "legion1" | "legion2";
export type BuildingsPreview = Record<SwordlandLegion, LegionBuildingData>;

export const emptyBuildings = (): Record<string, BuildingAssignment> =>
  Object.fromEntries(BUILDINGS.map((b) => [b, { leader: null, support: [], manual: false }]));

export const emptyPreview = (): BuildingsPreview => ({
  legion1: { buildings: emptyBuildings(), substitutes: [] },
  legion2: { buildings: emptyBuildings(), substitutes: [] },
});

type Placement = Pick<PlayerAssignment, "position" | "positionRole">;

/** Player ids are bigints that arrive as numbers: every map here is keyed by String(id) */
const key = (p: Player) => String(p.id);

/**
 * Buildings from saved / uploaded placements (building + leader/support).
 * Returns null when a player has no known building, so the caller generates instead.
 */
export function buildingsFromPlacements(
  players: Player[],
  placements: Map<string, Placement>,
  powerOf: (p: Player) => number,
): Record<string, BuildingAssignment> | null {
  const buildings = emptyBuildings();

  // Leaders first, so a support never takes a leader's spot
  const ordered = [...players].sort(
    (a, b) =>
      Number(placements.get(key(b))?.positionRole === "leader") -
        Number(placements.get(key(a))?.positionRole === "leader") || powerOf(b) - powerOf(a),
  );

  for (const player of ordered) {
    const placement = placements.get(key(player));
    const building = placement?.position ? buildings[placement.position] : undefined;
    if (!building) return null;

    if (!building.leader && (placement?.positionRole !== "support" || placement.position === UNDERCELLARS)) {
      building.leader = player;
    } else {
      building.support.push(player);
    }
  }

  // A building with only supports gets its strongest one as leader
  Object.values(buildings).forEach((b) => {
    if (!b.leader && b.support.length > 0) {
      const strongest = b.support.reduce((x, y) => (powerOf(x) >= powerOf(y) ? x : y));
      b.leader = strongest;
      b.support = b.support.filter((p) => key(p) !== key(strongest));
    }
  });

  return buildings;
}

/**
 * Buildings of one legion, strongest first: the 2 weakest hold the Undercellars, the next 8
 * lead the other buildings and the rest are spread over them as supports.
 */
export function generateBuildings(
  list: Player[],
  substitutes: Player[],
  powerOf: (p: Player) => number,
): LegionBuildingData {
  const substituteIds = new Set(substitutes.map(key));
  const sorted = list.filter((p) => !substituteIds.has(key(p))).sort((a, b) => powerOf(b) - powerOf(a));
  const buildings = emptyBuildings();
  if (!sorted.length) return { buildings, substitutes: [] };

  const [u1, u2] = sorted.slice(-2).sort((a, b) => powerOf(b) - powerOf(a));
  const rest = sorted.slice(0, -2);
  buildings[UNDERCELLARS].leader = u1 ?? null;
  if (u2) buildings[UNDERCELLARS].support.push(u2);

  const leaders = rest.slice(0, 8);
  BUILDINGS.slice(0, 8).forEach((b, i) => {
    buildings[b].leader = leaders[i] ?? null;
  });
  rest.slice(8).forEach((p, i) => buildings[BUILDINGS[i % 8]].support.push(p));

  return { buildings, substitutes };
}

// ---------------- GENERATED JSON (player ids only) ----------------

interface LegionJson {
  buildings: Record<string, { leader: string | null; support: string[] }>;
  substitutes: string[];
}

/** { legion1: { buildings: { "Bell Tower": { leader: id, support: [ids] } }, substitutes: [ids] }, legion2 } */
export function previewToJson(preview: BuildingsPreview): string {
  const legion = (data: LegionBuildingData): LegionJson => ({
    buildings: Object.fromEntries(
      BUILDINGS.map((name) => {
        const b = data.buildings?.[name];
        return [name, { leader: b?.leader?.id ?? null, support: (b?.support ?? []).map((p) => p.id) }];
      }),
    ),
    substitutes: (data.substitutes ?? []).map((p) => p.id),
  });
  return JSON.stringify({ legion1: legion(preview.legion1), legion2: legion(preview.legion2) }, null, 2);
}

/** Accepts ids or (older JSON) whole player objects */
const toId = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return null;
};

export interface ParsedBuildingsJson {
  legions: Record<SwordlandLegion, { players: Player[]; substitutes: Player[]; placements: Map<string, Placement> }>;
  /** Ids in the JSON that aren't players of this event */
  unknownIds: string[];
}

/** Reads an uploaded JSON; players are looked up by String(id) (unknown ones are reported) */
export function parseBuildingsJson(text: string, playersById: Map<string, Player>): ParsedBuildingsJson {
  const parsed = JSON.parse(text);
  if (!parsed?.legion1 || !parsed?.legion2) {
    throw new Error("Invalid JSON format. Expected legion1 and legion2 fields.");
  }

  const unknownIds = new Set<string>();
  const used = new Set<string>();
  const resolve = (value: unknown): Player | null => {
    const id = toId(value);
    if (!id || used.has(id)) return null;
    const player = playersById.get(id);
    if (!player) {
      unknownIds.add(id);
      return null;
    }
    used.add(id);
    return player;
  };

  const readLegion = (raw: { buildings?: Record<string, { leader?: unknown; support?: unknown[] }>; substitutes?: unknown[] }) => {
    const players: Player[] = [];
    const placements = new Map<string, Placement>();

    Object.entries(raw.buildings ?? {}).forEach(([name, building]) => {
      if (!BUILDINGS.includes(name)) return;
      const isUndercellars = name === UNDERCELLARS;
      const leader = resolve(building?.leader);
      if (leader) {
        players.push(leader);
        placements.set(key(leader), { position: name, positionRole: isUndercellars ? undefined : "leader" });
      }
      (building?.support ?? []).forEach((value) => {
        const player = resolve(value);
        if (!player) return;
        players.push(player);
        placements.set(key(player), { position: name, positionRole: isUndercellars ? undefined : "support" });
      });
    });

    const substitutes = (raw.substitutes ?? []).map(resolve).filter((p): p is Player => !!p);
    return { players, substitutes, placements };
  };

  return {
    legions: { legion1: readLegion(parsed.legion1), legion2: readLegion(parsed.legion2) },
    unknownIds: [...unknownIds],
  };
}
