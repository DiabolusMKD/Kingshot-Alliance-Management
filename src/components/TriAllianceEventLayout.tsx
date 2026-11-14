"use client";

import { useState, useEffect } from "react";
import { EventResults, EventStatus, Player, PlayerAssignment } from "@/types";
import { useToast } from "./Toast";
import EventPoints, { PointsLegion, useEventPoints } from "./EventPoints";
import PlayerIdentity from "./PlayerIdentity";
import styles from "./TriAllianceEventLayout.module.css";

const MAX_LEGION_PLAYERS = 30;
const MAX_SUBSTITUTES = 10;

const TRI_ALLIANCE_PLACES = [
  { value: "1st", label: "1st place" },
  { value: "2nd", label: "2nd place" },
  { value: "3rd", label: "3rd place" },
];

interface TriAllianceEventLayoutProps {
  players: Player[];
  initialAssignments?: PlayerAssignment[];
  initialResults?: EventResults | null;
  eventStatus: EventStatus;
  onSave: (
    assignments: PlayerAssignment[],
    status: EventStatus,
    results?: EventResults,
  ) => Promise<void>;
  isSaving?: boolean;
}

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

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
                <span className={styles.power}>({player.power})</span>
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
  eventStatus,
  onSave,
  isSaving = false,
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
  const [copiedField, setCopiedField] = useState<"string" | "json" | null>(null);
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
          (a) => a.playerId === player.id,
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

  // Auto-generate on any assignment change
  useEffect(() => {
    handleGenerateString();
  }, [assignments]);

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
    const teamLabels = [
      "Team 1 (Right outer)",
      "Team 2 (Right inner)",
      "Team 3 (Left outer)",
      "Team 4 (Left inner)",
    ];
    // Distribution order by power rank: outer teams first, right before left
    const distributionOrder = [0, 2, 1, 3];

    const splitLegion = (players: Player[]) => {
      // Sort strongest -> weakest by tri-alliance power
      const sortedPlayers = [...players].sort(
        (a, b) => Number(b.trialliancePower) - Number(a.trialliancePower),
      );

      const teams: Player[][] = [[], [], [], []];
      sortedPlayers.forEach((player, index) => {
        teams[distributionOrder[index % 4]].push(player);
      });

      // Teams of 6+ get 3 offense, smaller teams 2; the rest is support
      return teams.map((team) => {
        const offenseCount = team.length >= 6 ? 3 : 2;

        return {
          offense: team.slice(0, offenseCount),
          support: team.slice(offenseCount),
        };
      });
    };

    const formatPlayers = (players: Player[]) =>
      players.map((p) => p.name).join(", ") || "None";

    const formatLegion = (title: string, legion: Player[], substitutes: Player[]) =>
      `${title}:
${splitLegion(legion)
  .map(
    (team, index) => `${teamLabels[index]}:
- Offense: ${formatPlayers(team.offense)}
- Support: ${formatPlayers(team.support)}`,
  )
  .join("\n")}
Substitutions: ${formatPlayers(substitutes)}`;

    const fullString = `${formatLegion("Legion 1", assignments.legion1, assignments.substituteLegion1)}

${formatLegion("Legion 2", assignments.legion2, assignments.substituteLegion2)}`;

    setGeneratedString(fullString);

    // Generate JSON
    const jsonData = {
      legion1: {
        leftOffense: assignments.legion1.slice(0, Math.floor(assignments.legion1.length / 2)).map((p) => ({ id: p.id, name: p.name, power: p.power })),
        rightOffense: assignments.legion1.slice(Math.floor(assignments.legion1.length / 2), Math.floor(assignments.legion1.length / 2) * 2).map((p) => ({ id: p.id, name: p.name, power: p.power })),
        substitutes: assignments.substituteLegion1.map((p) => ({ id: p.id, name: p.name, power: p.power })),
      },
      legion2: {
        leftOffense: assignments.legion2.slice(0, Math.floor(assignments.legion2.length / 2)).map((p) => ({ id: p.id, name: p.name, power: p.power })),
        rightOffense: assignments.legion2.slice(Math.floor(assignments.legion2.length / 2), Math.floor(assignments.legion2.length / 2) * 2).map((p) => ({ id: p.id, name: p.name, power: p.power })),
        substitutes: assignments.substituteLegion2.map((p) => ({ id: p.id, name: p.name, power: p.power })),
      },
    };

    setGeneratedJson(JSON.stringify(jsonData, null, 2));
  };

  const handleReset = () => {
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

      // Extract player IDs from the JSON and find matching players
      const extractPlayers = (legionData: any): string[] => {
        const playerIds: string[] = [];

        if (legionData.leftOffense) {
          playerIds.push(...legionData.leftOffense.map((p: any) => p.id));
        }
        if (legionData.rightOffense) {
          playerIds.push(...legionData.rightOffense.map((p: any) => p.id));
        }
        if (legionData.substitutes) {
          playerIds.push(...legionData.substitutes.map((p: any) => p.id));
        }

        return playerIds;
      };

      const legion1Ids = extractPlayers(parsed.legion1);
      const legion2Ids = extractPlayers(parsed.legion2);
      const allImportedIds = new Set([...legion1Ids, ...legion2Ids]);

      const newAssignments: LegionAssignments = {
        legion1: [],
        legion2: [],
        substituteLegion1: [],
        substituteLegion2: [],
        unassigned: [],
      };

      // Assign players based on imported data
      players.forEach((player) => {
        if (legion1Ids.includes(player.id)) {
          newAssignments.legion1.push(player);
        } else if (legion2Ids.includes(player.id)) {
          newAssignments.legion2.push(player);
        } else {
          newAssignments.unassigned.push(player);
        }
      });

      // Handle substitutes if present in the JSON
      if (parsed.legion1.substitutes && Array.isArray(parsed.legion1.substitutes)) {
        const substituteIds = parsed.legion1.substitutes.map((p: any) => p.id);
        newAssignments.substituteLegion1 = newAssignments.legion1.filter((p) =>
          substituteIds.includes(p.id),
        );
        newAssignments.legion1 = newAssignments.legion1.filter(
          (p) => !substituteIds.includes(p.id),
        );
      }

      if (parsed.legion2.substitutes && Array.isArray(parsed.legion2.substitutes)) {
        const substituteIds = parsed.legion2.substitutes.map((p: any) => p.id);
        newAssignments.substituteLegion2 = newAssignments.legion2.filter((p) =>
          substituteIds.includes(p.id),
        );
        newAssignments.legion2 = newAssignments.legion2.filter(
          (p) => !substituteIds.includes(p.id),
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

      setAssignments(newAssignments);
      setJsonInput("");
      setShowJsonModal(false);
    } catch (error) {
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

    categories.forEach((legion) => {
      assignments[legion].forEach((p) => {
        allAssignments.push({
          playerId: p.id,
          legion,
          name: p.name,
          triAlliancePower: p.trialliancePower,
          power: p.power,
          });
      });
    });

    // Results (points, places, MVPs) are only saved for completed events
    await onSave(
      allAssignments,
      currentEventStatus,
      currentEventStatus === "completed" ? pointsState.buildResults(pointsLegions) : undefined,
    );
  };

  const handleCopy = async (field: "string" | "json", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy to clipboard");
    }
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
    },
    {
      title: "Legion 2",
      legion: "legion2",
      substitutes: "substituteLegion2",
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
                    <td>{player.trialliancePower}</td>
                    <td>{player.power}</td>
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

          <h2 className={styles.legionsHeader}>Legion Assignments</h2>

          {/* One column per legion: players, then substitutes */}
          <div className={styles.legionsContainer}>
            {legionColumns.map((column) => (
              <div key={column.legion} className={styles.legionGroup}>
                <h3 className={styles.legionGroupTitle}>{column.title}</h3>
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

      {/* Actions */}
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

        {showAssignments && (
          <>
            <button
              onClick={handleReset}
              className={styles.resetButton}
              type="button"
            >
              Reset
            </button>

            <button
              onClick={() => setShowJsonModal(true)}
              className={styles.uploadJsonButton}
            >
              Upload JSON
            </button>
          </>
        )}

        <button
          onClick={handleSave}
          className={styles.saveButton}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Outputs are shown together with the assignments */}
      {showAssignments && (
        <>
          {/* Generated String and JSON side by side */}
          <div className={styles.outputsContainer}>
            {[
              { field: "string" as const, label: "Generated String", value: generatedString },
              { field: "json" as const, label: "Generated JSON", value: generatedJson },
            ]
              .filter((output) => output.value)
              .map((output) => (
                <div key={output.field} className={styles.textAreaWrapper}>
                  <div className={styles.outputHeader}>
                    <label htmlFor={`generated-${output.field}`} className={styles.label}>
                      {output.label}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCopy(output.field, output.value)}
                      className={styles.copyButton}
                      title={`Copy ${output.label.toLowerCase()}`}
                      aria-label={`Copy ${output.label.toLowerCase()}`}
                    >
                      {copiedField === output.field ? <CheckIcon /> : <CopyIcon />}
                      {copiedField === output.field ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    id={`generated-${output.field}`}
                    value={output.value}
                    readOnly
                    className={styles.textarea}
                  />
                </div>
              ))}
          </div>
        </>
      )}

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
    </div>
  );
}
