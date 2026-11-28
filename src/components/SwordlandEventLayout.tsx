"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import LegionTable from "./LegionTable";
import KingdomPlayerPicker from "./KingdomPlayerPicker";
import BuildingPreview from "./BuildingPreview";
import EventPoints, { PointsLegion, useEventPoints } from "./EventPoints";
import { CompletedStatus, LockToggleButton } from "./EventLock";
import PlayerIdentity from "./PlayerIdentity";
import NoShowBadge, { noShowRowClass } from "./NoShowBadge";
import { useToast } from "./Toast";
import LegionTimeSelect from "./LegionTimeSelect";
import ViewAssignmentsButton from "./ViewAssignmentsButton";
import GeneratedOutput from "./GeneratedOutput";
import { useCanEdit } from "./EditMode";
import { LegionSchedules, formatLegionTitle, getLegionSchedules } from "@/utils/legionSchedule";
import { EventSaveInput } from "@/utils/eventData";
import {
  BUILDINGS,
  BuildingsPreview,
  emptyBuildings,
  emptyPreview,
  buildingsFromPlacements,
  generateBuildings,
  parseBuildingsJson,
  previewToJson,
} from "@/utils/swordlandBuildings";
import { formatCompactPower, formatPower } from "@/utils/formatNumbers";
import { SWORDLAND_MVP_TYPES } from "@/utils/swordlandMvps";
import { MAX_LEGION_PLAYERS, MAX_LEGION_SUBSTITUTES } from "@/utils/constants";
import {
  PowerMode,
  POWER_MODE_OPTIONS,
  getPlayerPower,
  getPowerLabel,
} from "@/utils/powerMode";
import {
  Player,
  PlayerAssignment,
  EventResults,
  EventStatus,
  LegionBuildingData,
} from "@/types";
import type { SeasonRoster } from "@/utils/seasonService";
import { RELIABILITY_POINTS } from "@/utils/reliability";
import styles from "./SwordlandEventLayout.module.css";

type Legion = "legion1" | "legion2";

interface LegionAssignments {
  legion1: Player[];
  legion2: Player[];
  unassigned: Player[];
}

const SWORDLAND_RESULTS = [
  { value: "win", label: "Win" },
  { value: "lose", label: "Lose" },
];

// Stable default: a fresh [] per render would re-run the init effect endlessly
const NO_PLAYERS: Player[] = [];
const NO_IDS = new Set<string>();
const NO_ROSTER: SeasonRoster = new Map();

export default function SwordlandEventLayout({
  players,
  externalPlayers = NO_PLAYERS,
  summitLeague,
  initialAssignments = [],
  initialResults = null,
  initialPowerMode = "swordland",
  initialLegionSchedules = getLegionSchedules(null),
  initialNotes = "",
  noShowIds = NO_IDS,
  seasonRoster = NO_ROSTER,
  rosterLocked = false,
  eventStatus = "not-started",
  onSave,
  isSaving,
  onDelete,
  renderOpponents,
}: {
  /** The alliance's own players */
  players: Player[];
  /** Players saved in this event who aren't in the alliance now (SSL guests, former members) */
  externalPlayers?: Player[];
  /** Set for SSL events: lets players from other alliances of the kingdom be added */
  summitLeague?: { kingdomId: number; allianceId: number };
  initialAssignments?: PlayerAssignment[];
  initialResults?: EventResults | null;
  /** Power saved with the event */
  initialPowerMode?: PowerMode;
  /** Legion start times (+ weekday of the event) */
  initialLegionSchedules?: LegionSchedules;
  /** Plain-text note of the event's creator */
  initialNotes?: string;
  /** SSL season: players assigned to a building in the season's last event who scored 0 (marked red) */
  noShowIds?: Set<string>;
  /** SSL: players registered for the season (its first event) -> the legion they started in */
  seasonRoster?: SeasonRoster;
  /** SSL after the season's first event: only the roster plays, nobody is added or removed */
  rosterLocked?: boolean;
  eventStatus?: EventStatus;
  onSave: (input: EventSaveInput) => Promise<void>;
  isSaving?: boolean;
  /** Deletes the event (shown only while it isn't completed) */
  onDelete?: () => void;
  /** The opponents section; read-only while a completed event is locked */
  renderOpponents?: (readOnly: boolean) => ReactNode;
}) {
  // SSL: other-alliance players in this event (saved ones + ones added now)
  const [addedPlayers, setAddedPlayers] = useState<Player[]>(externalPlayers);
  const allPlayers = useMemo(() => [...players, ...addedPlayers], [players, addedPlayers]);
  const externalIds = useMemo(() => new Set(addedPlayers.map((p) => p.id)), [addedPlayers]);

  const [assignments, setAssignments] = useState<LegionAssignments>({
    legion1: [],
    legion2: [],
    unassigned: [],
  });

  const [currentEventStatus, setCurrentEventStatus] =
    useState<EventStatus>(eventStatus);

  // Points, legion results and MVPs of a completed event
  const pointsState = useEventPoints(initialAssignments, initialResults);
  // Completed events open on the points view; assignments are shown on demand
  const [assignmentsExpanded, setAssignmentsExpanded] = useState(
    eventStatus !== "completed",
  );
  // A saved completed event opens locked (view only); Unlock makes it editable again
  const [isLocked, setIsLocked] = useState(eventStatus === "completed");
  // View only (no edit key in the URL, see EditMode): everything is shown as if locked, assignments without changing them
  const canEdit = useCanEdit();
  const readOnly = isLocked || !canEdit;
  // Choosing Completed switches to the points view, like a saved completed event
  const changeStatus = (status: EventStatus) => {
    setCurrentEventStatus(status);
    if (status === "completed") setAssignmentsExpanded(false);
  };
  // Lock goes back to the saved completed view (an unsaved status change is dropped)
  const toggleLock = () => {
    if (!isLocked) {
      setCurrentEventStatus(eventStatus);
      setAssignmentsExpanded(false);
    }
    setIsLocked(!isLocked);
  };

  const [legionSubstitutes, setLegionSubstitutes] = useState<{
    legion1: Player[];
    legion2: Player[];
  }>({
    legion1: [],
    legion2: [],
  });

  const [search, setSearch] = useState("");
  // Power used to build the buildings and shown in the tables (only one at a time)
  const [powerMode, setPowerMode] = useState<PowerMode>(initialPowerMode);
  const powerOf = (p: Player) => getPlayerPower(p, powerMode);
  const [legionSchedules, setLegionSchedules] = useState<LegionSchedules>(initialLegionSchedules);
  const [notes, setNotes] = useState(initialNotes);
  const toast = useToast();
  const [jsonInput, setJsonInput] = useState("");
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonModalError, setJsonModalError] = useState("");

  const [preview, setPreview] = useState<BuildingsPreview>(emptyPreview);
  // Buildings to show for a given assignments state instead of generating them
  // (saved positions on open, an uploaded JSON); used once by the generate effect
  const pendingPreview = useRef<{ assignments: LegionAssignments; preview: BuildingsPreview } | null>(null);

  /** Buildings of both legions from placements, or null when any player has none */
  const previewFromPlacements = (
    legions: LegionAssignments,
    substitutes: { legion1: Player[]; legion2: Player[] },
    placements: Map<string, Pick<PlayerAssignment, "position" | "positionRole">>,
  ): BuildingsPreview | null => {
    const power = (p: Player) => getPlayerPower(p, powerMode);
    const l1 = buildingsFromPlacements(legions.legion1, placements, power);
    const l2 = buildingsFromPlacements(legions.legion2, placements, power);
    if (!l1 || !l2 || legions.legion1.length + legions.legion2.length === 0) return null;
    return {
      legion1: { buildings: l1, substitutes: substitutes.legion1 },
      legion2: { buildings: l2, substitutes: substitutes.legion2 },
    };
  };

  // ---------------- INIT ----------------
  // Rebuilds from the saved assignments when the event or the alliance players change.
  // Adding an other-alliance player (SSL) doesn't go through here, so unsaved moves stay.
  useEffect(() => {
    const pool = [...players, ...externalPlayers];
    const next: LegionAssignments = {
      legion1: [],
      legion2: [],
      unassigned: [],
    };

    const nextSubstitutes = {
      legion1: [] as Player[],
      legion2: [] as Player[],
    };

    pool.forEach((p) => {
      const found = initialAssignments.find((a) => String(a.playerId) === String(p.id));

      if (!found) next.unassigned.push(p);
      else if (found.legion === "legion1" || found.legion === "legion2") {
        next[found.legion].push(p);
      } else if (found.legion === "substitute_legion1") {
        nextSubstitutes.legion1.push(p);
      } else if (found.legion === "substitute_legion2") {
        nextSubstitutes.legion2.push(p);
      } else {
        next.unassigned.push(p);
      }
    });

    // Saved buildings (manual moves included) are shown as they were saved
    const savedPlacements = new Map(
      initialAssignments.map((a) => [String(a.playerId), { position: a.position, positionRole: a.positionRole }]),
    );
    const saved = previewFromPlacements(next, nextSubstitutes, savedPlacements);
    pendingPreview.current = saved ? { assignments: next, preview: saved } : null;

    setAssignments(next);
    setLegionSubstitutes(nextSubstitutes);
    setAddedPlayers(externalPlayers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, externalPlayers, initialAssignments]);

  // ---------------- LIMITS ----------------
  // 30 players on the buildings and 20 substitutes per legion
  const isLegionFull = (legion: string) => {
    if ((legion !== "legion1" && legion !== "legion2") || assignments[legion].length < MAX_LEGION_PLAYERS) return false;
    toast.warning(`A legion can't have more than ${MAX_LEGION_PLAYERS} players on the buildings. Add them as substitutes instead.`);
    return true;
  };
  const areSubstitutesFull = (legion: Legion) => {
    if (legionSubstitutes[legion].length < MAX_LEGION_SUBSTITUTES) return false;
    toast.warning(`A legion can't have more than ${MAX_LEGION_SUBSTITUTES} substitutes.`);
    return true;
  };

  // ---------------- SSL: ADD / REMOVE OTHER-ALLIANCE PLAYERS ----------------
  const addExternalPlayer = (player: Player, to: keyof LegionAssignments) => {
    if (allPlayers.some((p) => p.id === player.id)) return;
    if (isLegionFull(to)) return;
    setAddedPlayers((prev) => [...prev, player]);
    setAssignments((prev) => ({ ...prev, [to]: [...prev[to], player] }));
  };

  // Only from Unassigned: drops the player from this event's pool again
  const removeExternalPlayer = (id: string) => {
    setAddedPlayers((prev) => prev.filter((p) => p.id !== id));
    setAssignments((prev) => ({ ...prev, unassigned: prev.unassigned.filter((p) => p.id !== id) }));
  };

  // ---------------- MOVE ----------------
  const movePlayer = (id: string, from: string, to: string) => {
    const player = allPlayers.find((p) => p.id === id);
    if (!player || isLegionFull(to)) return;

    setAssignments((prev) => {
      const copy = {
        legion1: [...prev.legion1],
        legion2: [...prev.legion2],
        unassigned: [...prev.unassigned],
      };

      const fromKey = from as keyof LegionAssignments;
      const toKey = to as keyof LegionAssignments;

      copy[fromKey] = copy[fromKey].filter((p) => p.id !== id);
      copy[toKey].push(player);

      return copy;
    });
  };

  // Move player to/from substitute
  const movePlayerToSubstitute = (id: string, legion: Legion) => {
    const player = allPlayers.find((p) => p.id === id);
    if (!player || areSubstitutesFull(legion)) return;

    // Remove from legion
    setAssignments((prev) => ({
      ...prev,
      [legion]: prev[legion].filter((p) => p.id !== id),
    }));

    // Add to substitutes
    setLegionSubstitutes((prev) => {
      const exists = prev[legion].some((p) => p.id === id);
      if (exists) return prev;
      return {
        ...prev,
        [legion]: [...prev[legion], player],
      };
    });
  };

  // SSL season roster: from Unassigned straight to the substitutes of the player's season legion
  const moveUnassignedToSubstitute = (id: string, legion: Legion) => {
    const player = allPlayers.find((p) => p.id === id);
    if (!player || areSubstitutesFull(legion)) return;
    setAssignments((prev) => ({ ...prev, unassigned: prev.unassigned.filter((p) => p.id !== id) }));
    setLegionSubstitutes((prev) =>
      prev[legion].some((p) => p.id === id) ? prev : { ...prev, [legion]: [...prev[legion], player] },
    );
  };

  const movePlayerFromSubstitute = (id: string, legion: Legion) => {
    if (isLegionFull(legion)) return;
    // Remove from substitutes
    setLegionSubstitutes((prev) => ({
      ...prev,
      [legion]: prev[legion].filter((p) => p.id !== id),
    }));
    // Add back to legion
    setAssignments((prev) => {
      const player = allPlayers.find((p) => p.id === id);
      if (!player) return prev;

      return {
        ...prev,
        [legion]: [...prev[legion], player],
      };
    });
  };

  function handleManualBuildingAssign(
    legion: Legion,
    player: Player,
    building: string,
  ) {
    setPreview((prev) => {
      const copy = structuredClone(prev);

      const buildings = copy[legion].buildings;
      const destination = buildings[building];

      // Find the player's current building and role
      let sourceBuilding = null;
      let wasLeader = false;

      for (const b of Object.values(buildings)) {
        if (b.leader?.id === player.id) {
          sourceBuilding = b;
          wasLeader = true;
          break;
        }

        if (b.support.some((s) => s.id === player.id)) {
          sourceBuilding = b;
          break;
        }
      }

      // Already assigned to this building → do nothing
      if (sourceBuilding === destination) {
        return prev;
      }

      // Remove player from current building
      if (sourceBuilding) {
        if (wasLeader) {
          if (sourceBuilding.support.length > 0) {
            // Promote strongest support to leader
            const strongest = sourceBuilding.support.reduce((a, b) =>
              powerOf(a) > powerOf(b) ? a : b,
            );

            sourceBuilding.support = sourceBuilding.support.filter(
              (p) => p.id !== strongest.id,
            );

            sourceBuilding.leader = strongest;
          } else {
            sourceBuilding.leader = null;
          }
        } else {
          sourceBuilding.support = sourceBuilding.support.filter(
            (p) => p.id !== player.id,
          );
        }
      }

      // Prevent duplicate entries in destination support
      destination.support = destination.support.filter(
        (p) => p.id !== player.id,
      );

      // Place player in destination
      if (!destination.leader) {
        destination.leader = player;
      } else if (powerOf(player) > powerOf(destination.leader)) {
        destination.support.unshift(destination.leader);
        destination.leader = player;
      } else {
        destination.support.push(player);
      }

      return copy;
    });
  }

  // Auto-generate on any change (also when switching the power the buildings are built from)
  useEffect(() => {
    const pending = pendingPreview.current;
    if (pending && pending.assignments === assignments) {
      pendingPreview.current = null;
      setPreview(pending.preview);
      return;
    }
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, legionSubstitutes, powerMode]);

  // ---------------- FILTER ----------------
  const filter = (list: Player[]) =>
    list.filter((p) =>
      (p.name + (p.aliasName ?? ""))
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

  // ---------------- GENERATE ----------------
  const handleGenerate = () => {
    const l1 = generateBuildings(assignments.legion1, legionSubstitutes.legion1, powerOf);
    const l2 = generateBuildings(assignments.legion2, legionSubstitutes.legion2, powerOf);

    setPreview({ legion1: l1, legion2: l2 });
  };

  // ---------------- GENERATED STRING ----------------
  // Built from the building cards (manual moves included) and the legion start times
  const textOut = useMemo(() => {
    const format = (title: string, data: LegionBuildingData) => {
      const buildingText = BUILDINGS.map((b) => {
        // An uploaded JSON may miss buildings until it's regenerated
        const x = data.buildings?.[b] ?? { leader: null, support: [] };

        if (b === "Undercellars") {
          const players = [
            ...(x.leader ? [x.leader.name] : []),
            ...x.support.map((p) => p.name),
          ];

          return `${b}\n${players.join(", ") || "None"}`;
        }

        return `${b}
Leader: ${x.leader?.name ?? "None"}
Support: ${x.support.map((p) => p.name).join(", ") || "None"}`;
      }).join("\n\n");

      const substitutesText =
        data.substitutes?.length > 0
          ? `\n\nSubstitutes\n${data.substitutes.map((p) => p.name).join(", ")}`
          : "";

      return `${title}

${buildingText}${substitutesText}`;
    };

    return [
      format(formatLegionTitle("Legion 1", legionSchedules.legion_1), preview.legion1),
      format(formatLegionTitle("Legion 2", legionSchedules.legion_2), preview.legion2),
    ].join("\n\n");
  }, [preview, legionSchedules]);

  // Player ids only; uploading it looks the players up again
  const jsonOut = useMemo(() => previewToJson(preview), [preview]);

  // ---------------- SAVE ----------------
  const handleSave = async () => {
    // Building + role of each player, from the cards (manual moves included)
    const positions = new Map<string, Pick<PlayerAssignment, "position" | "positionRole">>();
    (["legion1", "legion2"] as const).forEach((legion) => {
      Object.entries(preview[legion].buildings ?? {}).forEach(([building, data]) => {
        const isUndercellars = building === "Undercellars";
        if (data.leader) {
          positions.set(data.leader.id, { position: building, positionRole: isUndercellars ? undefined : "leader" });
        }
        data.support.forEach((p) =>
          positions.set(p.id, { position: building, positionRole: isUndercellars ? undefined : "support" }),
        );
      });
    });

    const toAssignment = (p: Player, legion: string): PlayerAssignment => ({
      playerId: p.id,
      legion,
      name: p.name,
      power: p.swordlandPower,
      swordlandPower: p.swordlandPower,
      totalPower: p.power,
      ...(legion.startsWith("substitute") ? {} : positions.get(p.id)),
    });

    const payload: PlayerAssignment[] = [
      ...assignments.legion1.map((p) => toAssignment(p, "legion1")),
      ...assignments.legion2.map((p) => toAssignment(p, "legion2")),
      ...legionSubstitutes.legion1.map((p) => toAssignment(p, "substitute_legion1")),
      ...legionSubstitutes.legion2.map((p) => toAssignment(p, "substitute_legion2")),
    ];

    // Results (points, win/lose, MVPs) are only saved for completed events
    await onSave({
      status: currentEventStatus,
      assignments: payload,
      results: currentEventStatus === "completed" ? pointsState.buildResults(pointsLegions) : undefined,
      powerMode,
      legionSchedules,
      notes,
    });
  };

  // Reset everything
  const reset = () => {
    const message =
      seasonRoster.size > 0
        ? "Reset all assignments? Season players go back to the Season Roster (in the legion they started the season in), the others to Unassigned. Nothing is saved until you click Save."
        : "Reset all assignments? Every player goes back to Unassigned. Nothing is saved until you click Save.";
    if (!confirm(message)) return;
    setAssignments({
      legion1: [],
      legion2: [],
      unassigned: allPlayers,
    });
    setLegionSubstitutes({
      legion1: [],
      legion2: [],
    });
    setSearch("");
    setJsonInput("");
    setJsonModalError("");
    setShowJsonModal(false);
    setPreview({
      legion1: { buildings: emptyBuildings(), substitutes: [] },
      legion2: { buildings: emptyBuildings(), substitutes: [] },
    });
  };

  // Upload JSON from modal: player ids -> players of this event, buildings as in the JSON
  const uploadJson = () => {
    setJsonModalError("");
    let parsed;
    try {
      parsed = parseBuildingsJson(jsonInput, new Map(allPlayers.map((p) => [String(p.id), p])));
    } catch (error) {
      setJsonModalError(
        error instanceof SyntaxError
          ? "Invalid JSON. Please check the format and try again."
          : (error as Error).message,
      );
      return;
    }

    const { legion1, legion2 } = parsed.legions;
    // Players over the limits stay unassigned
    const overflow: Player[] = [];
    const cap = (list: Player[], max: number) => {
      overflow.push(...list.slice(max));
      return list.slice(0, max);
    };
    [legion1, legion2].forEach((l) => {
      l.players = cap(l.players, MAX_LEGION_PLAYERS);
      l.substitutes = cap(l.substitutes, MAX_LEGION_SUBSTITUTES);
    });
    const inEvent = new Set(
      [legion1, legion2].flatMap((l) => [...l.players, ...l.substitutes]).map((p) => String(p.id)),
    );
    const nextAssignments: LegionAssignments = {
      legion1: legion1.players,
      legion2: legion2.players,
      unassigned: allPlayers.filter((p) => !inEvent.has(String(p.id))),
    };
    const nextSubstitutes = { legion1: legion1.substitutes, legion2: legion2.substitutes };
    const placements = new Map([...legion1.placements, ...legion2.placements]);
    const uploaded = previewFromPlacements(nextAssignments, nextSubstitutes, placements);
    pendingPreview.current = uploaded ? { assignments: nextAssignments, preview: uploaded } : null;

    setAssignments(nextAssignments);
    setLegionSubstitutes(nextSubstitutes);
    setShowJsonModal(false);
    setJsonInput("");

    if (overflow.length > 0) {
      toast.warning(
        `Too many players in the JSON (max ${MAX_LEGION_PLAYERS} per legion and ${MAX_LEGION_SUBSTITUTES} substitutes). These players were left unassigned: ${overflow.map((p) => p.name).join(", ")}`,
      );
    }

    if (parsed.unknownIds.length > 0) {
      toast.warning(
        `${parsed.unknownIds.length} player${parsed.unknownIds.length === 1 ? " isn't" : "s aren't"} in this event and ${parsed.unknownIds.length === 1 ? "was" : "were"} skipped.`,
      );
    }
  };

  const isCompleted = currentEventStatus === "completed";

  const pointsLegions: PointsLegion[] = [
    {
      key: "legion_1",
      title: "Legion 1",
      players: assignments.legion1,
      substitutes: legionSubstitutes.legion1,
    },
    {
      key: "legion_2",
      title: "Legion 2",
      players: assignments.legion2,
      substitutes: legionSubstitutes.legion2,
    },
  ];
  const showAssignments = !isLocked && (!isCompleted || assignmentsExpanded);

  // SSL: unassigned season players (by the legion they started the season in) vs everyone else
  const rosterUnassigned = (legion: "legion_1" | "legion_2") =>
    assignments.unassigned.filter((p) => seasonRoster.get(String(p.id)) === legion);
  const otherUnassigned = assignments.unassigned.filter((p) => !seasonRoster.has(String(p.id)));
  const rosterLeftOut = assignments.unassigned.length - otherUnassigned.length;

  // `rosterLegion`: season roster players stay in the legion they started the season in (Play / Substitute)
  const renderPoolTable = (list: Player[], keyPrefix: string, rosterLegion?: Legion) => (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Player</th>
          <th>{getPowerLabel(powerMode)}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {filter(list)
          .sort((a, b) => powerOf(b) - powerOf(a))
          .map((p) => (
            <tr key={`${keyPrefix}-${p.id}`} className={noShowIds.has(String(p.id)) ? noShowRowClass : undefined}>
              <td>
                <PlayerIdentity player={p}>
                  {noShowIds.has(String(p.id)) && <NoShowBadge />}
                  {externalIds.has(p.id) && (
                    <span
                      className={styles.externalBadge}
                      title="Not in this alliance now (SSL guest or former member)"
                    >
                      not in alliance
                    </span>
                  )}
                </PlayerIdentity>
              </td>
              <td className={styles.powerCell} title={formatPower(powerOf(p))}>
                {formatCompactPower(powerOf(p))}
              </td>
              <td>
                <select
                  className={styles.tableSelect}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const target = e.target.value;
                    if (target === "remove") removeExternalPlayer(p.id);
                    else if (rosterLegion && target === "play") movePlayer(p.id, "unassigned", rosterLegion);
                    else if (rosterLegion && target === "substitute") moveUnassignedToSubstitute(p.id, rosterLegion);
                    else if (!rosterLegion && target) movePlayer(p.id, "unassigned", target);
                  }}
                  value=""
                >
                  <option value="">Move</option>
                  {rosterLegion ? (
                    <>
                      <option value="play">Play</option>
                      <option value="substitute">Substitute</option>
                    </>
                  ) : (
                    <>
                      <option value="legion1">Legion 1</option>
                      <option value="legion2">Legion 2</option>
                    </>
                  )}
                  {externalIds.has(p.id) && !rosterLocked && !rosterLegion && (
                    <option value="remove">Remove from event</option>
                  )}
                </select>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  return (
    <div className={styles.container}>
      {/* OPPONENTS of each legion */}
      {renderOpponents?.(readOnly)}

      {/* POINTS (completed events only) */}
      {isCompleted && (
        <>
          {readOnly && <CompletedStatus />}
          <EventPoints
            legions={pointsLegions}
            resultLabel="Result"
            resultOptions={SWORDLAND_RESULTS}
            state={pointsState}
            readOnly={readOnly}
            schedules={legionSchedules}
            mvpTypes={SWORDLAND_MVP_TYPES}
          />
          {!isLocked && (
          <div className={styles.editAssignmentsBar}>
            <button
              type="button"
              onClick={() => setAssignmentsExpanded((prev) => !prev)}
              className={styles.uploadJsonButton}
              aria-expanded={assignmentsExpanded}
            >
              {assignmentsExpanded ? "Hide assignments" : "Edit assignments"}
            </button>
          </div>
          )}
        </>
      )}

      {showAssignments && (
        <>
          {/* SEARCH + POWER USED FOR THE ASSIGNMENTS */}
          <div className={styles.toolbar}>
            <div className={styles.searchWrapper}>
              <input
                className={styles.searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
              />
              {search && (
                <button className={styles.clearButton} onClick={() => setSearch("")}>
                  ✕
                </button>
              )}
            </div>

            <label className={styles.powerModeField}>
              <span className={styles.powerModeLabel}>Assign by</span>
              <select
                className={styles.statusSelect}
                disabled={!canEdit}
                value={powerMode}
                onChange={(e) => setPowerMode(e.target.value as PowerMode)}
                name="powerMode"
              >
                {POWER_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* SSL: season players not assigned in this event, by the legion they started the season in */}
          {seasonRoster.size > 0 && (
            <section className={styles.seasonRoster}>
              <div className={styles.poolHeader}>
                <h2 className={styles.playersHeader}>Season Roster ({rosterLeftOut})</h2>
              </div>
              <p className={styles.rosterHint}>
                {rosterLocked
                  ? "The season's players (everyone on a building or a substitute in its first event), locked for the season: nobody can be added or removed. "
                  : "Registered for the season (players of its first event). "}
                Not assigned yet, under the legion they started the season in. Anyone still here when the event is
                completed gets {RELIABILITY_POINTS.seasonNotAssigned} reliability points: they count in the
                season&apos;s matchmaking.
              </p>
              <div className={styles.rosterGrid}>
                {(["legion_1", "legion_2"] as const).map((legion, index) => {
                  const list = rosterUnassigned(legion);
                  return (
                    <div key={legion} className={styles.poolColumn}>
                      <h3 className={styles.rosterTitle}>
                        Started in Legion {index + 1} ({list.length})
                      </h3>
                      {list.length === 0 ? (
                        <p className={styles.rosterEmpty}>Everyone is assigned.</p>
                      ) : (
                        <div className={styles.tableWrapper}>{renderPoolTable(list, `r${index + 1}`, index === 0 ? "legion1" : "legion2")}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* UNASSIGNED (+ SSL kingdom players side by side); not with a locked season roster */}
          {!rosterLocked && (
          <div className={summitLeague && canEdit ? styles.poolGrid : undefined}>
            <div className={styles.poolColumn}>
              <div className={styles.poolHeader}>
                <h2 className={styles.playersHeader}>
                  Unassigned ({otherUnassigned.length})
                </h2>
              </div>

              <div className={styles.poolBody}>
                <div className={styles.tableWrapper}>
                  {renderPoolTable(otherUnassigned, "u")}
                </div>
              </div>
            </div>

            {/* SSL: players of the kingdom from other alliances */}
            {summitLeague && canEdit && (
              <div className={styles.poolColumn}>
                <KingdomPlayerPicker
                  kingdomId={summitLeague.kingdomId}
                  excludeAllianceId={summitLeague.allianceId}
                  inEventIds={new Set(allPlayers.map((p) => p.id))}
                  filterPlayers={filter}
                  powerMode={powerMode}
                  onAdd={addExternalPlayer}
                />
              </div>
            )}
          </div>
          )}

          {/* The generated string in a modal */}
          <ViewAssignmentsButton text={textOut} />

          {/* LEGIONS: players, substitutes, then the building cards */}
          <div className={styles.legionsContainer}>
            {(["legion1", "legion2"] as const).map((legion, index) => (
              <div key={legion} className={styles.legionGroup}>
                <h3 className={styles.legionGroupTitle}>
                  <span>Legion {index + 1}</span>
                  <LegionTimeSelect
                    legionTitle={`Legion ${index + 1}`}
                    schedule={legionSchedules[legion === "legion1" ? "legion_1" : "legion_2"]}
                    onChange={(time) => {
                      const key = legion === "legion1" ? "legion_1" : "legion_2";
                      setLegionSchedules((prev) => ({ ...prev, [key]: { ...prev[key], time } }));
                    }}
                  />
                </h3>
                <LegionTable
                  title={`Players (${assignments[legion].length}/${MAX_LEGION_PLAYERS})`}
                  players={assignments[legion]}
                  legion={legion}
                  BUILDINGS={BUILDINGS}
                  filterPlayers={filter}
                  powerMode={powerMode}
                  noShowIds={noShowIds}
                  handleManualBuildingAssign={handleManualBuildingAssign}
                  movePlayerToSubstitute={movePlayerToSubstitute}
                  movePlayer={movePlayer}
                  preview={preview[legion]}
                />

                <LegionTable
                  title={`Substitutes (${legionSubstitutes[legion].length}/${MAX_LEGION_SUBSTITUTES})`}
                  players={legionSubstitutes[legion]}
                  legion={legion}
                  BUILDINGS={[]}
                  selectedBuilding={"substitute"}
                  filterPlayers={filter}
                  powerMode={powerMode}
                  noShowIds={noShowIds}
                  handleManualBuildingAssign={() => {}}
                  movePlayerToSubstitute={() => {}}
                  movePlayer={() => {}}
                  movePlayerFromSubstitute={movePlayerFromSubstitute}
                />

                <BuildingPreview
                  title="Buildings"
                  legion={legion}
                  legionData={preview[legion]}
                  BUILDINGS={BUILDINGS}
                  powerMode={powerMode}
                  noShowIds={noShowIds}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* NOTE of the event's creator */}
      <div className={styles.notesField}>
        <label htmlFor="eventNotes" className={styles.label}>
          Notes
        </label>
        <textarea
          id="eventNotes"
          className={styles.notesTextarea}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          readOnly={readOnly}
          placeholder={readOnly ? "No notes." : "Anything to remember about this event..."}
          rows={3}
        />
      </div>

      {/* OUTPUTS side by side, collapsed until opened (shown with the assignments) */}
      {showAssignments && (
        <div className={styles.outputsContainer}>
          <GeneratedOutput id="textOutput" label="Generated String" value={textOut} />
          <GeneratedOutput id="jsonOutput" label="Generated JSON" value={jsonOut} />
        </div>
      )}

      {/* ACTIONS: assignment tools (left) and status + save (right) */}
      {!readOnly && (
      <div className={styles.actionsBar}>
        {showAssignments && (
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.uploadJsonButton}
              onClick={() => setShowJsonModal(true)}
            >
              Upload JSON
            </button>
            <button type="button" className={styles.resetButton} onClick={reset}>
              Reset assignments
            </button>
          </div>
        )}

        <div className={`${styles.actionGroup} ${styles.saveGroup}`}>
          <select
            value={currentEventStatus}
            onChange={(e) => changeStatus(e.target.value as EventStatus)}
            className={styles.statusSelect}
            name="eventStatus"
            aria-label="Event status"
          >
            <option value="not-started">Not Started</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
          </select>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      )}

      {/* UPLOAD JSON MODAL */}
      {showJsonModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>Upload JSON Configuration</h2>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Paste JSON here..."
              className={styles.modalTextarea}
            />
            {jsonModalError && (
              <div className={styles.errorMessage}>{jsonModalError}</div>
            )}
            <div className={styles.modalActions}>
              <button
                onClick={() => {
                  setShowJsonModal(false);
                  setJsonInput("");
                  setJsonModalError("");
                }}
                className={styles.cancelButton}
              >
                Cancel
              </button>
              <button
                onClick={uploadJson}
                disabled={!jsonInput.trim()}
                className={styles.loadButton}
              >
                Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Very bottom: delete, apart from the other actions (only while the event isn't completed) */}
      {onDelete && canEdit && eventStatus !== "completed" && (
        <div className={styles.deleteRow}>
          <button
            type="button"
            className={`${styles.resetButton} ${styles.deleteEventButton}`}
            onClick={onDelete}
            disabled={isSaving}
          >
            Delete event
          </button>
        </div>
      )}

      {/* Very bottom of a saved completed event: Unlock to edit, Lock to go back to the view */}
      {eventStatus === "completed" && canEdit && <LockToggleButton isLocked={isLocked} onToggle={toggleLock} />}
    </div>
  );
}
