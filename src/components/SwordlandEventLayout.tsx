"use client";

import { useEffect, useMemo, useState } from "react";
import LegionTable from "./LegionTable";
import KingdomPlayerPicker from "./KingdomPlayerPicker";
import BuildingPreview from "./BuildingPreview";
import EventPoints, { PointsLegion, useEventPoints } from "./EventPoints";
import {
  Player,
  PlayerAssignment,
  EventResults,
  EventStatus,
  LegionBuildingData,
  BuildingAssignment,
} from "@/types";
import styles from "./SwordlandEventLayout.module.css";

type Legion = "legion1" | "legion2";

interface LegionAssignments {
  legion1: Player[];
  legion2: Player[];
  unassigned: Player[];
}

interface PreviewState {
  legion1: LegionBuildingData;
  legion2: LegionBuildingData;
}

const BUILDINGS = [
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

const SWORDLAND_RESULTS = [
  { value: "win", label: "Win" },
  { value: "lose", label: "Lose" },
];

// Stable default: a fresh [] per render would re-run the init effect endlessly
const NO_PLAYERS: Player[] = [];

const emptyBuildings = (): Record<string, BuildingAssignment> =>
  Object.fromEntries(
    BUILDINGS.map((b) => [b, { leader: null, support: [], manual: false }]),
  );

export default function SwordlandEventLayout({
  players,
  externalPlayers = NO_PLAYERS,
  summitLeague,
  initialAssignments = [],
  initialResults = null,
  eventStatus = "not-started",
  onSave,
  isSaving,
}: {
  /** The alliance's own players */
  players: Player[];
  /** Other-alliance players already saved in this (SLS) event */
  externalPlayers?: Player[];
  /** Set for SLS events: lets players from other alliances of the kingdom be added */
  summitLeague?: { kingdomId: number; allianceId: number };
  initialAssignments?: PlayerAssignment[];
  initialResults?: EventResults | null;
  eventStatus?: EventStatus;
  onSave: (
    a: PlayerAssignment[],
    status: EventStatus,
    results?: EventResults,
  ) => Promise<void>;
  isSaving?: boolean;
}) {
  // SLS: other-alliance players in this event (saved ones + ones added now)
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

  const [legionSubstitutes, setLegionSubstitutes] = useState<{
    legion1: Player[];
    legion2: Player[];
  }>({
    legion1: [],
    legion2: [],
  });

  const [search, setSearch] = useState("");
  const [jsonOut, setJsonOut] = useState("");
  const [textOut, setTextOut] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonModalError, setJsonModalError] = useState("");

  const [preview, setPreview] = useState<PreviewState>({
    legion1: { buildings: emptyBuildings(), substitutes: [] },
    legion2: { buildings: emptyBuildings(), substitutes: [] },
  });

  // ---------------- INIT ----------------
  // Rebuilds from the saved assignments when the event or the alliance players change.
  // Adding an other-alliance player (SLS) doesn't go through here, so unsaved moves stay.
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

    setAssignments(next);
    setLegionSubstitutes(nextSubstitutes);
    setAddedPlayers(externalPlayers);
  }, [players, externalPlayers, initialAssignments]);

  // ---------------- SLS: ADD / REMOVE OTHER-ALLIANCE PLAYERS ----------------
  const addExternalPlayer = (player: Player, to: keyof LegionAssignments) => {
    if (allPlayers.some((p) => p.id === player.id)) return;
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
    if (!player) return;

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
    if (!player) return;

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

  const movePlayerFromSubstitute = (id: string, legion: Legion) => {
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
              a.swordlandPower > b.swordlandPower ? a : b,
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
      } else if (player.swordlandPower > destination.leader.swordlandPower) {
        destination.support.unshift(destination.leader);
        destination.leader = player;
      } else {
        destination.support.push(player);
      }

      return copy;
    });
  }

  // Auto-generate on any change
  useEffect(() => {
    handleGenerate();
  }, [assignments, legionSubstitutes]);

  // ---------------- FILTER ----------------
  const filter = (list: Player[]) =>
    list.filter((p) =>
      (p.name + (p.aliasName ?? ""))
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

  // ---------------- BUILD LOGIC ----------------
  const generateBuildings = (
    list: Player[],
    substitutes: Player[],
  ): LegionBuildingData => {
    const substituteIds = new Set(substitutes.map((p) => p.id));

    const sorted = [...list]
      .filter((p) => !substituteIds.has(p.id))
      .sort((a, b) => b.swordlandPower - a.swordlandPower);

    const buildings: Record<string, BuildingAssignment> = emptyBuildings();

    if (!sorted.length) {
      return { buildings, substitutes: [] };
    }

    const under = sorted.slice(-2);
    const rest = sorted.slice(0, -2);

    const [u1, u2] = under.sort((a, b) => b.swordlandPower - a.swordlandPower);

    buildings["Undercellars"].leader = u1 ?? null;
    if (u2) buildings["Undercellars"].support.push(u2);

    const leaders = rest.slice(0, 8);
    const leaderIds = new Set(leaders.map((p) => p.id));

    BUILDINGS.slice(0, 8).forEach((b, i) => {
      buildings[b].leader = leaders[i] ?? null;
    });

    const supportPool = rest.filter((p) => !leaderIds.has(p.id));

    let i = 0;
    for (const p of supportPool) {
      const b = BUILDINGS[i % 8];
      buildings[b].support.push(p);
      i++;
    }

    return {
      buildings,
      substitutes,
    };
  };

  // ---------------- GENERATE ----------------
  const handleGenerate = () => {
    const l1 = generateBuildings(
      assignments.legion1,
      legionSubstitutes.legion1,
    );

    const l2 = generateBuildings(
      assignments.legion2,
      legionSubstitutes.legion2,
    );

    const json = { legion1: l1, legion2: l2 };

    setJsonOut(JSON.stringify(json, null, 2));

    const format = (title: string, data: LegionBuildingData) => {
      const buildingText = BUILDINGS.map((b) => {
        const x = data.buildings[b];

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
        data.substitutes.length > 0
          ? `\n\nSubstitutes\n${data.substitutes.map((p) => p.name).join(", ")}`
          : "";

      return `${title}

${buildingText}${substitutesText}`;
    };

    setTextOut(`${format("Legion 1", l1)}\n\n${format("Legion 2", l2)}`);

    setPreview({ legion1: l1, legion2: l2 });
  };

  // ---------------- SAVE ----------------
  const handleSave = async () => {
    const payload: PlayerAssignment[] = [
      ...assignments.legion1.map((p) => ({
        playerId: p.id,
        legion: "legion1" as const,
        name: p.name,
        power: p.swordlandPower,
      })),
      ...assignments.legion2.map((p) => ({
        playerId: p.id,
        legion: "legion2" as const,
        name: p.name,
        power: p.swordlandPower,
      })),
      ...legionSubstitutes.legion1.map((p) => ({
        playerId: p.id,
        legion: "substitute_legion1" as const,
        name: p.name,
        power: p.swordlandPower,
      })),
      ...legionSubstitutes.legion2.map((p) => ({
        playerId: p.id,
        legion: "substitute_legion2" as const,
        name: p.name,
        power: p.swordlandPower,
      })),
    ];

    // Results (points, win/lose, MVPs) are only saved for completed events
    await onSave(
      payload,
      currentEventStatus,
      currentEventStatus === "completed" ? pointsState.buildResults(pointsLegions) : undefined,
    );
  };

  // Reset everything
  const reset = () => {
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
    setJsonOut("");
    setTextOut("");
    setJsonModalError("");
    setShowJsonModal(false);
    setPreview({
      legion1: { buildings: emptyBuildings(), substitutes: [] },
      legion2: { buildings: emptyBuildings(), substitutes: [] },
    });
  };

  // Upload JSON from modal
  const uploadJson = () => {
    setJsonModalError("");
    try {
      const parsed = JSON.parse(jsonInput);

      if (!parsed.legion1 || !parsed.legion2) {
        setJsonModalError(
          "Invalid JSON format. Expected legion1 and legion2 fields.",
        );
        return;
      }

      const extract = (data: LegionBuildingData) => {
        const all: Player[] = [];

        Object.values(data.buildings).forEach((b) => {
          if (b.leader) all.push(b.leader);
          all.push(...b.support);
        });

        return all;
      };

      setAssignments({
        legion1: extract(parsed.legion1),
        legion2: extract(parsed.legion2),
        unassigned: [],
      });

      setLegionSubstitutes({
        legion1: parsed.legion1.substitutes || [],
        legion2: parsed.legion2.substitutes || [],
      });

      setPreview(parsed);
      setShowJsonModal(false);
      setJsonInput("");
    } catch (error) {
      setJsonModalError("Invalid JSON. Please check the format and try again.");
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
  const showAssignments = !isCompleted || assignmentsExpanded;

  return (
    <div className={styles.container}>
      {/* POINTS (completed events only) */}
      {isCompleted && (
        <>
          <EventPoints
            legions={pointsLegions}
            resultLabel="Result"
            resultOptions={SWORDLAND_RESULTS}
            state={pointsState}
          />
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
        </>
      )}

      {showAssignments && (
        <>
          {/* SEARCH */}
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

          {/* UNASSIGNED */}
          <h2 className={styles.playersHeader}>
            Unassigned ({assignments.unassigned.length})
          </h2>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <tbody>
                {filter(assignments.unassigned).map((p) => (
                  <tr key={`u-${p.id}`}>
                    <td>
                      {p.name}
                      {externalIds.has(p.id) && (
                        <span className={styles.externalBadge} title="Player from another alliance (SLS)">
                          other alliance
                        </span>
                      )}
                    </td>
                    <td>{p.swordlandPower}</td>
                    <td>
                      <select
                        className={styles.tableSelect}
                        onChange={(e) =>
                          e.target.value === "remove"
                            ? removeExternalPlayer(p.id)
                            : movePlayer(p.id, "unassigned", e.target.value as any)
                        }
                        defaultValue=""
                      >
                        <option value="">Move</option>
                        <option value="legion1">Legion 1</option>
                        <option value="legion2">Legion 2</option>
                        {externalIds.has(p.id) && <option value="remove">Remove from event</option>}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SLS: strongest players of the kingdom from other alliances */}
          {summitLeague && (
            <KingdomPlayerPicker
              kingdomId={summitLeague.kingdomId}
              excludeAllianceId={summitLeague.allianceId}
              inEventIds={new Set(allPlayers.map((p) => p.id))}
              filterPlayers={filter}
              onAdd={addExternalPlayer}
            />
          )}

          {/* LEGIONS */}
          <div className={styles.legionsContainer}>
            <div className={styles.legionGroup}>
              <h3 className={styles.legionGroupTitle}>Legion 1</h3>
              <LegionTable
                title={`Players (${assignments.legion1.length})`}
                players={assignments.legion1}
                legion="legion1"
                BUILDINGS={BUILDINGS}
                filterPlayers={filter}
                handleManualBuildingAssign={handleManualBuildingAssign}
                movePlayerToSubstitute={movePlayerToSubstitute}
                movePlayer={movePlayer}
                preview={preview?.legion1 || undefined}
              />

              {/* Substitutes for Legion 1 */}
              <LegionTable
                title={`Substitutes (${legionSubstitutes.legion1.length})`}
                players={legionSubstitutes.legion1}
                legion="legion1"
                BUILDINGS={[]}
                selectedBuilding={"substitute"}
                filterPlayers={filter}
                handleManualBuildingAssign={() => {}}
                movePlayerToSubstitute={() => {}}
                movePlayer={() => {}}
                movePlayerFromSubstitute={movePlayerFromSubstitute}
              />
            </div>

            <div className={styles.legionGroup}>
              <h3 className={styles.legionGroupTitle}>Legion 2</h3>
              <LegionTable
                title={`Players (${assignments.legion2.length})`}
                players={assignments.legion2}
                legion="legion2"
                BUILDINGS={BUILDINGS}
                filterPlayers={filter}
                handleManualBuildingAssign={handleManualBuildingAssign}
                movePlayerToSubstitute={movePlayerToSubstitute}
                movePlayer={movePlayer}
                preview={preview?.legion2 || undefined}
              />

              {/* Substitutes for Legion 2 */}
              <LegionTable
                title={`Substitutes (${legionSubstitutes.legion2.length})`}
                players={legionSubstitutes.legion2}
                legion="legion2"
                BUILDINGS={[]}
                selectedBuilding={"substitute"}
                filterPlayers={filter}
                handleManualBuildingAssign={() => {}}
                movePlayerToSubstitute={() => {}}
                movePlayer={() => {}}
                movePlayerFromSubstitute={movePlayerFromSubstitute}
              />
            </div>
          </div>
        </>
      )}

      {/* ACTIONS */}
      <div className={styles.actions}>
        <select
          value={currentEventStatus}
          onChange={(e) => setCurrentEventStatus(e.target.value as EventStatus)}
          className={styles.statusSelect}
          name="eventStatus"
        >
          <option value="not-started">Not Started</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
        </select>
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>

        {showAssignments && (
          <>
            <button
              className={styles.uploadJsonButton}
              onClick={() => setShowJsonModal(true)}
            >
              Upload JSON
            </button>

            <button className={styles.resetButton} onClick={reset}>
              Reset
            </button>
          </>
        )}
      </div>

      {/* Outputs are shown together with the assignments */}
      {showAssignments && (
        <>
          {/* OUTPUTS */}
          {textOut && (
            <div className={styles.textAreaWrapper}>
              <label htmlFor="textOutput" className={styles.label}>
                Generated String
              </label>
              <textarea
                id="textOutput"
                className={styles.textarea}
                value={textOut}
                readOnly
              />
            </div>
          )}

          {jsonOut && (
            <div className={styles.textAreaWrapper}>
              <label htmlFor="jsonOutput" className={styles.label}>
                Generated JSON
              </label>
              <textarea
                id="jsonOutput"
                className={styles.textarea}
                value={jsonOut}
                readOnly
              />
            </div>
          )}
        </>
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

      {showAssignments && (
        <>
          {/* PREVIEW */}
          <div className={styles.previewContainer}>
            <BuildingPreview
              title="Legion 1"
              legion="legion1"
              legionData={preview.legion1}
              BUILDINGS={BUILDINGS}
              moveSubstitute={() => {}}
            />

            <BuildingPreview
              title="Legion 2"
              legion="legion2"
              legionData={preview.legion2}
              BUILDINGS={BUILDINGS}
              moveSubstitute={() => {}}
            />
          </div>
        </>
      )}
    </div>
  );
}
