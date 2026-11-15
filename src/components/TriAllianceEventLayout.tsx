"use client";

import { useState, useEffect } from "react";
import { EventResults, EventStatus, Player, PlayerAssignment } from "@/types";
import { useToast } from "./Toast";
import EventPoints, { PointsLegion, useEventPoints } from "./EventPoints";
import PlayerIdentity from "./PlayerIdentity";
import LegionTimeSelect from "./LegionTimeSelect";
import ViewAssignmentsButton from "./ViewAssignmentsButton";
import GeneratedOutput from "./GeneratedOutput";
import { LegionSchedules, formatLegionTitle, getLegionSchedules } from "@/utils/legionSchedule";
import { EventSaveInput } from "@/utils/eventData";
import { formatPower } from "@/utils/formatNumbers";
import styles from "./TriAllianceEventLayout.module.css";

const MAX_LEGION_PLAYERS = 30;
const MAX_SUBSTITUTES = 10;

const TRI_ALLIANCE_PLACES = [
  { value: "1st", label: "1st place" },
  { value: "2nd", label: "2nd place" },
  { value: "3rd", label: "3rd place" },
];

interface TriAllianceEventLayoutProps {
  /** The alliance's players + players saved in this event who left it */
  players: Player[];
  initialAssignments?: PlayerAssignment[];
  initialResults?: EventResults | null;
  /** Legion start times (+ weekday of the event) */
  initialLegionSchedules?: LegionSchedules;
  /** Plain-text note of the event's creator */
  initialNotes?: string;
  eventStatus: EventStatus;
  onSave: (input: EventSaveInput) => Promise<void>;
  isSaving?: boolean;
  /** Deletes the event (shown only while it isn't completed) */
  onDelete?: () => void;
}

const TEAM_LABELS = [
  "Team 1 (Right outer)",
  "Team 2 (Right inner)",
  "Team 3 (Left outer)",
  "Team 4 (Left inner)",
];
// Distribution order by power rank: outer teams first, right before left
const DISTRIBUTION_ORDER = [0, 2, 1, 3];

/** Splits a legion into the 4 teams (offense + support), strongest by tri-alliance power first */
function splitLegion(players: Player[]) {
  const sortedPlayers = [...players].sort(
    (a, b) => Number(b.trialliancePower) - Number(a.trialliancePower),
  );

  const teams: Player[][] = [[], [], [], []];
  sortedPlayers.forEach((player, index) => {
    teams[DISTRIBUTION_ORDER[index % 4]].push(player);
  });

  // Teams of 6+ get 3 offense, smaller teams 2; the rest is support
  return teams.map((team) => {
    const offenseCount = team.length >= 6 ? 3 : 2;
    return {
      offense: team.slice(0, offenseCount),
      support: team.slice(offenseCount),
    };
  });
}

interface LegionAssignments {
  legion1: Player[];
  legion2: Player[];
  substituteLegion1: Player[];
  substituteLegion2: Player[];
  unassigned: Player[];
}

// Defined outside the main component so it isn't remounted (losing scroll position) on every render
function PlayerSelectBox({
  title,
  players,
  category,
  onMove,
}: {
  title: string;
  players: Player[];
  category: string;
  onMove: (playerId: string, fromCategory: string, toCategory: string) => void;
}) {
  return (
    <div className={styles.column}>
      <h3 className={styles.columnTitle}>{title}</h3>
      <div className={styles.playerList}>
        {players.map((player) => (
          <div key={player.id} className={styles.playerItem}>
            <span className={styles.playerName}>
              <PlayerIdentity player={player}>
                <span className={styles.power}>({formatPower(player.power)})</span>
              </PlayerIdentity>
            </span>
            <select
              value={category}
              onChange={(e) => onMove(player.id, category, e.target.value)}
              className={styles.select}
            >
              <option value="unassigned">Unassigned</option>
              <option value="legion1">Legion 1</option>
              <option value="legion2">Legion 2</option>
              <option value="substituteLegion1">Substitute Legion 1</option>
              <option value="substituteLegion2">Substitute Legion 2</option>
            </select>
          </div>
        ))}
        {players.length === 0 && <p className={styles.empty}>No players</p>}
      </div>
    </div>
  );
}

export default function TriAllianceEventLayout({
  players,
  initialAssignments = [],
  initialResults = null,
  initialLegionSchedules = getLegionSchedules(null),
  initialNotes = "",
  eventStatus,
  onSave,
  isSaving = false,
  onDelete,
}: TriAllianceEventLayoutProps) {
  const toast = useToast();
  const [currentEventStatus, setCurrentEventStatus] =
    useState<EventStatus>(eventStatus);
  // Points, legion results and MVPs of a completed event
  const pointsState = useEventPoints(initialAssignments, initialResults);
  // Completed events open on the points view; assignments are shown on demand
  const [assignmentsExpanded, setAssignmentsExpanded] = useState(
    eventStatus !== "completed",
  );
  const [notes, setNotes] = useState(initialNotes);
  const [legionSchedules, setLegionSchedules] = useState<LegionSchedules>(initialLegionSchedules);
  const [assignments, setAssignments] = useState<LegionAssignments>({
    legion1: [],
    legion2: [],
    substituteLegion1: [],
    substituteLegion2: [],
    unassigned: [],
  });

  const [generatedString, setGeneratedString] = useState("");
  const [generatedJson, setGeneratedJson] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonModalError, setJsonModalError] = useState("");

  useEffect(() => {

    // Load initial assignments or default to unassigned
    if (initialAssignments.length > 0) {
      const newAssignments: LegionAssignments = {
        legion1: [],
        legion2: [],
        substituteLegion1: [],
        substituteLegion2: [],
        unassigned: [],
      };

      players.forEach((player) => {
        const assignment = initialAssignments.find(
          // Saved ids are strings, player ids arrive as numbers (bigint)
          (a) => String(a.playerId) === String(player.id),
        );
        if (!assignment) {
          newAssignments.unassigned.push(player);
        } else if (assignment.legion === "legion1") {
          newAssignments.legion1.push(player);
        } else if (assignment.legion === "legion2") {
          newAssignments.legion2.push(player);
        } else if (assignment.legion === "substituteLegion1") {
          newAssignments.substituteLegion1.push(player);
        } else if (assignment.legion === "substituteLegion2") {
          newAssignments.substituteLegion2.push(player);
        }
      });
      setAssignments(newAssignments);
    } else {
      setAssignments((prev) => ({
        ...prev,
        unassigned: players,
      }));
    }
  }, [players, initialAssignments]);

  // Auto-generate on any assignment or start time change
  useEffect(() => {
    handleGenerateString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, legionSchedules]);

  const movePlayer = (
    playerId: string,
    fromCategory: string,
    toCategory: string,
  ) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    if (
      (toCategory === "legion1" || toCategory === "legion2") &&
      assignments[toCategory].length >= MAX_LEGION_PLAYERS
    ) {
      toast.warning(`A legion can't have more than ${MAX_LEGION_PLAYERS} players. Add them as substitutes instead.`);
      return;
    }

    if (
      (toCategory === "substituteLegion1" || toCategory === "substituteLegion2") &&
      assignments[toCategory].length >= MAX_SUBSTITUTES
    ) {
      toast.warning(`A legion can't have more than ${MAX_SUBSTITUTES} substitutes.`);
      return;
    }

    setAssignments((prev) => {
      const newAssignments = { ...prev };

      // Remove from source
      Object.keys(newAssignments).forEach((key) => {
        newAssignments[key as keyof LegionAssignments] = newAssignments[
          key as keyof LegionAssignments
        ].filter((p) => p.id !== playerId);
      });

      // Add to destination (validate that toCategory is a valid key)
      const validKeys = Object.keys(newAssignments) as (keyof LegionAssignments)[];
      if (validKeys.includes(toCategory as keyof LegionAssignments)) {
        newAssignments[toCategory as keyof LegionAssignments].push(player);
      } else {
        newAssignments.unassigned.push(player);
      }

      return newAssignments;
    });
  };

  const filterPlayers = (playerList: Player[]) => {
    return playerList.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.aliasName.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  };

  const handleGenerateString = () => {
    const formatPlayers = (players: Player[]) =>
      players.map((p) => p.name).join(", ") || "None";

    const formatLegion = (title: string, legion: Player[], substitutes: Player[]) =>
      `${title}:
${splitLegion(legion)
  .map(
    (team, index) => `${TEAM_LABELS[index]}:
- Offense: ${formatPlayers(team.offense)}
- Support: ${formatPlayers(team.support)}`,
  )
  .join("\n")}
Substitutions: ${formatPlayers(substitutes)}`;

    const fullString = `${formatLegion(formatLegionTitle("Legion 1", legionSchedules.legion_1), assignments.legion1, assignments.substituteLegion1)}

${formatLegion(formatLegionTitle("Legion 2", legionSchedules.legion_2), assignments.legion2, assignments.substituteLegion2)}`;

    setGeneratedString(fullString);

    // JSON with player ids only (the players are looked up again on upload)
    const toJson = (legion: Player[], substitutes: Player[]) => ({
      teams: splitLegion(legion).map((team) => ({
        offense: team.offense.map((p) => p.id),
        support: team.support.map((p) => p.id),
      })),
      substitutes: substitutes.map((p) => p.id),
    });
    const jsonData = {
      legion1: toJson(assignments.legion1, assignments.substituteLegion1),
      legion2: toJson(assignments.legion2, assignments.substituteLegion2),
    };

    setGeneratedJson(JSON.stringify(jsonData, null, 2));
  };

  const handleReset = () => {
    if (!confirm("Reset all assignments? Every player goes back to Unassigned. Nothing is saved until you click Save.")) return;
    setAssignments({
      legion1: [],
      legion2: [],
      substituteLegion1: [],
      substituteLegion2: [],
      unassigned: players,
    });

    setGeneratedString("");
    setGeneratedJson("");
    setJsonInput("");
    setSearchTerm("");
    setJsonModalError("");
    setShowJsonModal(false);
  };

  const handleJsonImport = () => {
    setJsonModalError("");
    try {
      const parsed = JSON.parse(jsonInput);

      // Validate JSON structure
      if (!parsed.legion1 || !parsed.legion2) {
        setJsonModalError("Invalid JSON format. Expected legion1 and legion2 fields.");
        return;
      }

      // Player ids (or, in older JSON, player objects with an id)
      const toIds = (list: unknown): string[] =>
        Array.isArray(list)
          ? list
              .map((value) =>
                typeof value === "string" || typeof value === "number"
                  ? String(value)
                  : value && typeof value === "object" && "id" in value
                    ? String((value as { id: unknown }).id)
                    : null,
              )
              .filter((id): id is string => !!id)
          : [];

      type LegionJson = {
        teams?: { offense?: unknown; support?: unknown }[];
        leftOffense?: unknown;
        rightOffense?: unknown;
        substitutes?: unknown;
      };
      const extractPlayers = (legionData: LegionJson): string[] => [
        ...(legionData.teams ?? []).flatMap((team) => [...toIds(team?.offense), ...toIds(team?.support)]),
        ...toIds(legionData.leftOffense),
        ...toIds(legionData.rightOffense),
        ...toIds(legionData.substitutes),
      ];

      const legion1Ids = extractPlayers(parsed.legion1);
      const legion2Ids = extractPlayers(parsed.legion2);
      const knownIds = new Set(players.map((p) => String(p.id)));
      const unknownCount = new Set([...legion1Ids, ...legion2Ids].filter((id) => !knownIds.has(id))).size;

      const newAssignments: LegionAssignments = {
        legion1: [],
        legion2: [],
        substituteLegion1: [],
        substituteLegion2: [],
        unassigned: [],
      };

      // Assign players based on imported data
      players.forEach((player) => {
        if (legion1Ids.includes(String(player.id))) {
          newAssignments.legion1.push(player);
        } else if (legion2Ids.includes(String(player.id))) {
          newAssignments.legion2.push(player);
        } else {
          newAssignments.unassigned.push(player);
        }
      });

      // Handle substitutes if present in the JSON
      if (parsed.legion1.substitutes && Array.isArray(parsed.legion1.substitutes)) {
        const substituteIds = toIds(parsed.legion1.substitutes);
        newAssignments.substituteLegion1 = newAssignments.legion1.filter((p) =>
          substituteIds.includes(String(p.id)),
        );
        newAssignments.legion1 = newAssignments.legion1.filter(
          (p) => !substituteIds.includes(String(p.id)),
        );
      }

      if (parsed.legion2.substitutes && Array.isArray(parsed.legion2.substitutes)) {
        const substituteIds = toIds(parsed.legion2.substitutes);
        newAssignments.substituteLegion2 = newAssignments.legion2.filter((p) =>
          substituteIds.includes(String(p.id)),
        );
        newAssignments.legion2 = newAssignments.legion2.filter(
          (p) => !substituteIds.includes(String(p.id)),
        );
      }

      // Players over the limits stay unassigned
      const limits: [keyof LegionAssignments, number][] = [
        ["legion1", MAX_LEGION_PLAYERS],
        ["legion2", MAX_LEGION_PLAYERS],
        ["substituteLegion1", MAX_SUBSTITUTES],
        ["substituteLegion2", MAX_SUBSTITUTES],
      ];
      const overflow: Player[] = [];
      limits.forEach(([key, max]) => {
        overflow.push(...newAssignments[key].slice(max));
        newAssignments[key] = newAssignments[key].slice(0, max);
      });

      if (overflow.length > 0) {
        newAssignments.unassigned.push(...overflow);
        toast.warning(
          `Too many players in the JSON (max ${MAX_LEGION_PLAYERS} per legion and ${MAX_SUBSTITUTES} substitutes). These players were left unassigned: ${overflow.map((p) => p.name).join(", ")}`,
        );
      }

      if (unknownCount > 0) {
        toast.warning(
          `${unknownCount} player${unknownCount === 1 ? " isn't" : "s aren't"} in this event and ${unknownCount === 1 ? "was" : "were"} skipped.`,
        );
      }

      setAssignments(newAssignments);
      setJsonInput("");
      setShowJsonModal(false);
    } catch {
      setJsonModalError("Invalid JSON format. Please check and try again.");
    }
  };

  const handleSave = async () => {
    const allAssignments: PlayerAssignment[] = [];
    const categories = [
      "legion1",
      "legion2",
      "substituteLegion1",
      "substituteLegion2",
    ] as const;

    // Team + role of each legion player (same split as the generated string)
    const positions = new Map<string, Pick<PlayerAssignment, "position" | "positionRole">>();
    [assignments.legion1, assignments.legion2].forEach((legionPlayers) =>
      splitLegion(legionPlayers).forEach((team, index) => {
        const position = `Team ${index + 1}`;
        team.offense.forEach((p) => positions.set(p.id, { position, positionRole: "offense" }));
        team.support.forEach((p) => positions.set(p.id, { position, positionRole: "support" }));
      }),
    );

    categories.forEach((legion) => {
      assignments[legion].forEach((p) => {
        allAssignments.push({
          playerId: p.id,
          legion,
          name: p.name,
          triAlliancePower: p.trialliancePower,
          power: p.power,
          totalPower: p.power,
          ...(legion.startsWith("substitute") ? {} : positions.get(p.id)),
        });
      });
    });

    // Results (points, places, MVPs) are only saved for completed events
    await onSave({
      status: currentEventStatus,
      assignments: allAssignments,
      results: currentEventStatus === "completed" ? pointsState.buildResults(pointsLegions) : undefined,
      legionSchedules,
      notes,
    });
  };

  const isCompleted = currentEventStatus === "completed";

  const pointsLegions: PointsLegion[] = [
    {
      key: "legion_1",
      title: "Legion 1",
      players: assignments.legion1,
      substitutes: assignments.substituteLegion1,
    },
    {
      key: "legion_2",
      title: "Legion 2",
      players: assignments.legion2,
      substitutes: assignments.substituteLegion2,
    },
  ];
  const showAssignments = !isCompleted || assignmentsExpanded;

  const legionColumns = [
    {
      title: "Legion 1",
      legion: "legion1",
      substitutes: "substituteLegion1",
      scheduleKey: "legion_1",
    },
    {
      title: "Legion 2",
      legion: "legion2",
      substitutes: "substituteLegion2",
      scheduleKey: "legion_2",
    },
  ] as const;

  return (
    <div className={styles.container}>
      {/* Points (completed events only) */}
      {isCompleted && (
        <>
          <EventPoints
            legions={pointsLegions}
            resultLabel="Place"
            resultOptions={TRI_ALLIANCE_PLACES}
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
          <div className={styles.searchWrapper}>
            <input
              type="text"
              placeholder="Search by player name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <h2 className={styles.playersHeader}>
            Players ({assignments.unassigned.length} unassigned)
          </h2>

          {/* Players Assignment Table */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tri Alliance Power</th>
                  <th>Power</th>
                  <th>Assign</th>
                </tr>
              </thead>
              <tbody>
                {filterPlayers(assignments.unassigned).map((player) => (
                  <tr key={player.id}>
                    <td>
                      <PlayerIdentity player={player} />
                    </td>
                    <td className={styles.powerCell}>{formatPower(player.trialliancePower)}</td>
                    <td className={styles.powerCell}>{formatPower(player.power)}</td>
                    <td>
                      <select
                        value="unassigned"
                        onChange={(e) =>
                          movePlayer(player.id, "unassigned", e.target.value)
                        }
                        className={styles.tableSelect}
                      >
                        <option value="unassigned">Unassigned</option>
                        <option value="legion1">Legion 1</option>
                        <option value="legion2">Legion 2</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The generated string in a modal */}
          <div className={styles.viewAssignments}>
            <ViewAssignmentsButton text={generatedString} />
          </div>

          <h2 className={styles.legionsHeader}>Legion Assignments</h2>

          {/* One column per legion: players, then substitutes */}
          <div className={styles.legionsContainer}>
            {legionColumns.map((column) => (
              <div key={column.legion} className={styles.legionGroup}>
                <h3 className={styles.legionGroupTitle}>
                  <span>{column.title}</span>
                  <LegionTimeSelect
                    legionTitle={column.title}
                    schedule={legionSchedules[column.scheduleKey]}
                    onChange={(time) =>
                      setLegionSchedules((prev) => ({
                        ...prev,
                        [column.scheduleKey]: { ...prev[column.scheduleKey], time },
                      }))
                    }
                  />
                </h3>
                <PlayerSelectBox
                  title={`Players (${assignments[column.legion].length}/${MAX_LEGION_PLAYERS})`}
                  players={filterPlayers(assignments[column.legion])}
                  category={column.legion}
                  onMove={movePlayer}
                />
                <PlayerSelectBox
                  title={`Substitutes (${assignments[column.substitutes].length}/${MAX_SUBSTITUTES})`}
                  players={filterPlayers(assignments[column.substitutes])}
                  category={column.substitutes}
                  onMove={movePlayer}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Note of the event's creator */}
      <div className={styles.notesField}>
        <label htmlFor="eventNotes" className={styles.label}>
          Notes
        </label>
        <textarea
          id="eventNotes"
          className={styles.notesTextarea}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to remember about this event..."
          rows={3}
        />
      </div>

      {/* Generated String and JSON side by side, collapsed until opened (shown with the assignments) */}
      {showAssignments && (
        <div className={styles.outputsContainer}>
          <GeneratedOutput id="generated-string" label="Generated String" value={generatedString} />
          <GeneratedOutput id="generated-json" label="Generated JSON" value={generatedJson} />
        </div>
      )}

      {/* ACTIONS: assignment tools (left) and status + save (right) */}
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
            <button type="button" className={styles.resetButton} onClick={handleReset}>
              Reset assignments
            </button>
          </div>
        )}

        <div className={`${styles.actionGroup} ${styles.saveGroup}`}>
          <select
            value={currentEventStatus}
            onChange={(e) => setCurrentEventStatus(e.target.value as EventStatus)}
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

      {/* JSON Import Modal */}
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
                onClick={handleJsonImport}
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
      {onDelete && eventStatus !== "completed" && (
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
    </div>
  );
}
