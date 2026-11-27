"use client";

import { ReactNode, useMemo, useState } from "react";
import { EventResults, EventStatus, Player, PlayerAssignment } from "@/types";
import { useToast } from "./Toast";
import EventPoints, { PointsLegion, useEventPoints } from "./EventPoints";
import { CompletedStatus, LockToggleButton } from "./EventLock";
import { useCanEdit } from "./EditMode";
import PlayerIdentity from "./PlayerIdentity";
import LegionTimeSelect from "./LegionTimeSelect";
import ViewAssignmentsButton from "./ViewAssignmentsButton";
import GeneratedOutput from "./GeneratedOutput";
import { AssignmentCard, AssignmentCards } from "./BuildingPreview";
import { LegionSchedules, formatLegionTitle, getLegionSchedules } from "@/utils/legionSchedule";
import { EventSaveInput } from "@/utils/eventData";
import { formatCompactPower, formatPower } from "@/utils/formatNumbers";
import { compareByRankThen, getRankOrder } from "@/utils/allianceRank";
// 30 players across the areas and 20 substitutes per legion
import { MAX_LEGION_PLAYERS, MAX_LEGION_SUBSTITUTES } from "@/utils/constants";
import styles from "./TriAllianceEventLayout.module.css";

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
  /** The opponents section; read-only while a completed event is locked */
  renderOpponents?: (readOnly: boolean) => ReactNode;
}

const TEAM_LABELS = [
  "Team 1 (Right outer)",
  "Team 2 (Right inner)",
  "Team 3 (Left outer)",
  "Team 4 (Left inner)",
];
// Distribution order by power rank: outer teams first, right before left
const DISTRIBUTION_ORDER = [0, 2, 1, 3];

// Most offense players a team can have (teams of 6+ get 3 when generated, smaller teams 2)
const MAX_OFFENSE = 3;

type LegionKey = "legion1" | "legion2";
type TeamRole = "offense" | "support";
interface Team {
  offense: Player[];
  support: Player[];
}
/** The teams of a legion; manual = moved by hand (kept when players join or leave) */
interface LegionTeams {
  teams: Team[];
  manual: boolean;
}
type Placements = Map<string, Pick<PlayerAssignment, "position" | "positionRole">>;

const SUBSTITUTES_OF = { legion1: "substituteLegion1", legion2: "substituteLegion2" } as const;

const triPower = (player: Player) => Number(player.trialliancePower) || 0;
const byTriPower = (a: Player, b: Player) => triPower(b) - triPower(a);
// Lists: highest alliance rank first, then strongest by tri-alliance power
const byRankThenTriPower = compareByRankThen(triPower);

const emptyTeams = (): Team[] => TEAM_LABELS.map(() => ({ offense: [], support: [] }));
const teamSize = (team: Team) => team.offense.length + team.support.length;
const withoutPlayer = (teams: Team[], playerId: string): Team[] =>
  teams.map((team) => ({
    offense: team.offense.filter((p) => p.id !== playerId),
    support: team.support.filter((p) => p.id !== playerId),
  }));

/** Splits a legion into the 4 teams (offense + support), strongest by tri-alliance power first */
function splitLegion(players: Player[]): Team[] {
  const sortedPlayers = [...players].sort(byTriPower);

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

/** Teams from saved positions ("Team 1".."Team 4" + offense/support), or null when any player has none */
function teamsFromPlacements(players: Player[], placements: Placements): Team[] | null {
  const teams = emptyTeams();
  for (const player of players) {
    const placement = placements.get(String(player.id));
    const match = /^Team ([1-4])$/.exec(placement?.position ?? "");
    const role = placement?.positionRole;
    if (!match || (role !== "offense" && role !== "support")) return null;
    teams[Number(match[1]) - 1][role].push(player);
  }
  return teams;
}

const teamsKey = (teams: Team[]) =>
  JSON.stringify(teams.map((t) => [t.offense.map((p) => p.id).sort(), t.support.map((p) => p.id).sort()]));

/** Saved/uploaded teams when every player has a position, otherwise generated ones */
function buildTeams(players: Player[], placements?: Placements): LegionTeams {
  const generated = splitLegion(players);
  const placed = placements && players.length > 0 ? teamsFromPlacements(players, placements) : null;
  if (!placed) return { teams: generated, manual: false };
  return { teams: placed, manual: teamsKey(placed) !== teamsKey(generated) };
}

/** After players joined or left a legion: generated teams are generated again, hand-made ones keep their moves */
function syncTeams(current: LegionTeams, members: Player[]): LegionTeams {
  if (!current.manual) return { teams: splitLegion(members), manual: false };
  const memberIds = new Set(members.map((p) => p.id));
  const teams = current.teams.map((team) => ({
    offense: team.offense.filter((p) => memberIds.has(p.id)),
    support: team.support.filter((p) => memberIds.has(p.id)),
  }));
  const placedIds = new Set(teams.flatMap((t) => [...t.offense, ...t.support]).map((p) => p.id));
  // Newcomers go to the smallest team as support
  members
    .filter((p) => !placedIds.has(p.id))
    .forEach((player) => {
      const smallest = DISTRIBUTION_ORDER.reduce((best, i) => (teamSize(teams[i]) < teamSize(teams[best]) ? i : best));
      teams[smallest].support.push(player);
    });
  return { teams, manual: true };
}

interface LegionAssignments {
  legion1: Player[];
  legion2: Player[];
  substituteLegion1: Player[];
  substituteLegion2: Player[];
  unassigned: Player[];
}

function RankBadge({ rank }: { rank?: string | null }) {
  if (!rank) return <span className={styles.noRank}>-</span>;
  return (
    <span className={`${styles.rankBadge} ${getRankOrder(rank) <= 1 ? styles.rankHigh : ""}`}>{rank}</span>
  );
}

const positionValue = (index: number, role: TeamRole) => `${index}-${role}`;

// Defined outside the main component so it isn't remounted (losing scroll position) on every render
function LegionPlayersTable({
  title,
  players,
  category,
  onMove,
  teams,
  onPlace,
}: {
  title: string;
  players: Player[];
  category: string;
  onMove: (playerId: string, fromCategory: string, toCategory: string) => void;
  /** Legion players: their team, changed by hand with onPlace (substitutes have none) */
  teams?: Team[];
  onPlace?: (player: Player, value: string) => void;
}) {
  const canEdit = useCanEdit();
  const positionOf = (player: Player) => {
    const index = teams?.findIndex((t) => t.offense.some((p) => p.id === player.id) || t.support.some((p) => p.id === player.id)) ?? -1;
    if (index === -1 || !teams) return "";
    return positionValue(index, teams[index].offense.some((p) => p.id === player.id) ? "offense" : "support");
  };

  return (
    <div className={styles.column}>
      <h3 className={styles.columnTitle}>{title}</h3>
      {players.length === 0 ? (
        <p className={styles.empty}>No players</p>
      ) : (
        <div className={styles.legionTableWrapper}>
          <table className={`${styles.table} ${styles.compactTable}`}>
            <thead>
              <tr>
                <th>Player</th>
                <th>Rank</th>
                <th>TA Power</th>
                {teams && <th>Team</th>}
                <th>Move</th>
              </tr>
            </thead>
            <tbody>
              {[...players].sort(byRankThenTriPower).map((player) => (
                <tr key={player.id}>
                  <td>
                    <PlayerIdentity player={player} />
                  </td>
                  <td>
                    <RankBadge rank={player.allianceRank} />
                  </td>
                  <td className={styles.powerCell} title={formatPower(player.trialliancePower)}>
                    {formatCompactPower(player.trialliancePower)}
                  </td>
                  {teams && (
                    <td>
                      <select
                        value={positionOf(player)}
                        onChange={(e) => onPlace?.(player, e.target.value)}
                        className={styles.select}
                        disabled={!canEdit}
                        aria-label={`Team of ${player.name}`}
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {TEAM_LABELS.map((label, index) => (
                          <optgroup key={label} label={label}>
                            <option value={positionValue(index, "offense")}>Team {index + 1} · Offense</option>
                            <option value={positionValue(index, "support")}>Team {index + 1} · Support</option>
                          </optgroup>
                        ))}
                        <option value="substitute">📌 Substitute</option>
                      </select>
                    </td>
                  )}
                  <td>
                    <select
                      value={category}
                      onChange={(e) => onMove(player.id, category, e.target.value)}
                      className={styles.select}
                      disabled={!canEdit}
                      aria-label={`Move ${player.name}`}
                    >
                      <option value="unassigned">Unassigned</option>
                      <option value="legion1">Legion 1</option>
                      <option value="legion2">Legion 2</option>
                      <option value="substituteLegion1">Substitute Legion 1</option>
                      <option value="substituteLegion2">Substitute Legion 2</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The event's players by their saved legion, plus the saved team positions */
function assignmentsFrom(players: Player[], saved: PlayerAssignment[]) {
  const next: LegionAssignments = {
    legion1: [],
    legion2: [],
    substituteLegion1: [],
    substituteLegion2: [],
    unassigned: [],
  };
  players.forEach((player) => {
    // Saved ids are strings, player ids arrive as numbers (bigint)
    const legion = saved.find((a) => String(a.playerId) === String(player.id))?.legion;
    if (
      legion === "legion1" ||
      legion === "legion2" ||
      legion === "substituteLegion1" ||
      legion === "substituteLegion2"
    ) {
      next[legion].push(player);
    } else {
      next.unassigned.push(player);
    }
  });
  const placements: Placements = new Map(
    saved.map((a) => [String(a.playerId), { position: a.position, positionRole: a.positionRole }]),
  );
  return { assignments: next, placements };
}

const teamsOf = (assignments: LegionAssignments, placements?: Placements): Record<LegionKey, LegionTeams> => ({
  legion1: buildTeams(assignments.legion1, placements),
  legion2: buildTeams(assignments.legion2, placements),
});

/** One card per team (offense + support) and one for the substitutes */
const teamCards = (teams: Team[], substitutes: Player[]): AssignmentCard[] => [
  ...teams.map((team, index) => ({
    name: TEAM_LABELS[index],
    count: teamSize(team),
    groups: [
      { role: "Offense", players: [...team.offense].sort(byTriPower) },
      { role: "Support", players: [...team.support].sort(byTriPower) },
    ],
  })),
  { name: "Substitutes", count: substitutes.length, groups: [{ players: [...substitutes].sort(byTriPower) }] },
];

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
  renderOpponents,
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
  const [notes, setNotes] = useState(initialNotes);
  const [legionSchedules, setLegionSchedules] = useState<LegionSchedules>(initialLegionSchedules);
  // Players by legion + the teams of each legion, from the saved assignments (and positions)
  const [initial] = useState(() => assignmentsFrom(players, initialAssignments));
  const [assignments, setAssignments] = useState<LegionAssignments>(initial.assignments);
  const [legionTeams, setLegionTeams] = useState<Record<LegionKey, LegionTeams>>(() =>
    teamsOf(initial.assignments, initial.placements),
  );
  // Rebuilt from the saved assignments when the players or the saved assignments change
  const [source, setSource] = useState({ players, initialAssignments });
  if (source.players !== players || source.initialAssignments !== initialAssignments) {
    const next = assignmentsFrom(players, initialAssignments);
    setSource({ players, initialAssignments });
    setAssignments(next.assignments);
    setLegionTeams(teamsOf(next.assignments, next.placements));
  }

  const [jsonInput, setJsonInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonModalError, setJsonModalError] = useState("");

  /** New legions; the teams follow (generated again, or hand-made ones keep their moves) */
  const changeAssignments = (next: LegionAssignments) => {
    setAssignments(next);
    setLegionTeams((prev) => ({
      legion1: syncTeams(prev.legion1, next.legion1),
      legion2: syncTeams(prev.legion2, next.legion2),
    }));
  };

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
      assignments[toCategory].length >= MAX_LEGION_SUBSTITUTES
    ) {
      toast.warning(`A legion can't have more than ${MAX_LEGION_SUBSTITUTES} substitutes.`);
      return;
    }

    const newAssignments = { ...assignments };

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

    changeAssignments(newAssignments);
  };

  /** Manual team change of a legion player: "<team index>-offense|support" or "substitute" */
  const placePlayer = (legion: LegionKey, player: Player, value: string) => {
    if (value === "substitute") {
      movePlayer(player.id, legion, SUBSTITUTES_OF[legion]);
      return;
    }
    const match = /^([0-3])-(offense|support)$/.exec(value);
    if (!match) return;
    const index = Number(match[1]);
    const role = match[2] as TeamRole;
    const teams = withoutPlayer(legionTeams[legion].teams, player.id);
    if (role === "offense" && teams[index].offense.length >= MAX_OFFENSE) {
      toast.warning(`A team can't have more than ${MAX_OFFENSE} offense players. Move one to support first.`);
      return;
    }
    teams[index] = { ...teams[index], [role]: [...teams[index][role], player] };
    setLegionTeams((prev) => ({ ...prev, [legion]: { teams, manual: true } }));
  };

  // Drops the hand-made moves of a legion
  const regenerateTeams = (legion: LegionKey) =>
    setLegionTeams((prev) => ({ ...prev, [legion]: { teams: splitLegion(assignments[legion]), manual: false } }));

  const filterPlayers = (playerList: Player[]) => {
    return playerList.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.aliasName.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  };

  // Generated string + JSON, from the teams (manual moves included) and the legion start times
  const [generatedString, generatedJson] = useMemo(() => {
    const formatPlayers = (players: Player[]) =>
      [...players].sort(byTriPower).map((p) => p.name).join(", ") || "None";

    const formatLegion = (title: string, teams: Team[], substitutes: Player[]) =>
      `${title}:
${teams
  .map(
    (team, index) => `${TEAM_LABELS[index]}:
- Offense: ${formatPlayers(team.offense)}
- Support: ${formatPlayers(team.support)}`,
  )
  .join("\n")}
Substitutions: ${formatPlayers(substitutes)}`;

    const fullString = `${formatLegion(formatLegionTitle("Legion 1", legionSchedules.legion_1), legionTeams.legion1.teams, assignments.substituteLegion1)}

${formatLegion(formatLegionTitle("Legion 2", legionSchedules.legion_2), legionTeams.legion2.teams, assignments.substituteLegion2)}`;

    // JSON with player ids only (the players are looked up again on upload)
    const toJson = (teams: Team[], substitutes: Player[]) => ({
      teams: teams.map((team) => ({
        offense: team.offense.map((p) => p.id),
        support: team.support.map((p) => p.id),
      })),
      substitutes: substitutes.map((p) => p.id),
    });
    const jsonData = {
      legion1: toJson(legionTeams.legion1.teams, assignments.substituteLegion1),
      legion2: toJson(legionTeams.legion2.teams, assignments.substituteLegion2),
    };

    return [fullString, JSON.stringify(jsonData, null, 2)];
  }, [assignments, legionTeams, legionSchedules]);

  const handleReset = () => {
    if (!confirm("Reset all assignments? Every player goes back to Unassigned. Nothing is saved until you click Save.")) return;
    const cleared: LegionAssignments = {
      legion1: [],
      legion2: [],
      substituteLegion1: [],
      substituteLegion2: [],
      unassigned: players,
    };
    setAssignments(cleared);
    setLegionTeams(teamsOf(cleared));

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
        ["substituteLegion1", MAX_LEGION_SUBSTITUTES],
        ["substituteLegion2", MAX_LEGION_SUBSTITUTES],
      ];
      const overflow: Player[] = [];
      limits.forEach(([key, max]) => {
        overflow.push(...newAssignments[key].slice(max));
        newAssignments[key] = newAssignments[key].slice(0, max);
      });

      if (overflow.length > 0) {
        newAssignments.unassigned.push(...overflow);
        toast.warning(
          `Too many players in the JSON (max ${MAX_LEGION_PLAYERS} per legion and ${MAX_LEGION_SUBSTITUTES} substitutes). These players were left unassigned: ${overflow.map((p) => p.name).join(", ")}`,
        );
      }

      if (unknownCount > 0) {
        toast.warning(
          `${unknownCount} player${unknownCount === 1 ? " isn't" : "s aren't"} in this event and ${unknownCount === 1 ? "was" : "were"} skipped.`,
        );
      }

      // Team positions from the JSON (new format); older JSON gets generated teams
      const placements: Placements = new Map();
      [parsed.legion1, parsed.legion2].forEach((legionData: LegionJson) =>
        (legionData.teams ?? []).forEach((team, index) => {
          const position = `Team ${index + 1}`;
          toIds(team?.offense).forEach((id) => placements.set(id, { position, positionRole: "offense" }));
          toIds(team?.support).forEach((id) => placements.set(id, { position, positionRole: "support" }));
        }),
      );

      setAssignments(newAssignments);
      setLegionTeams(teamsOf(newAssignments, placements));
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

    // Team + role of each legion player (manual moves included, as in the generated string)
    const positions = new Map<string, Pick<PlayerAssignment, "position" | "positionRole">>();
    [legionTeams.legion1.teams, legionTeams.legion2.teams].forEach((teams) =>
      teams.forEach((team, index) => {
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
  const showAssignments = !isLocked && (!isCompleted || assignmentsExpanded);

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
      {/* Opponents of each legion */}
      {renderOpponents?.(readOnly)}

      {/* Points (completed events only) */}
      {isCompleted && (
        <>
          {readOnly && <CompletedStatus />}
          <EventPoints
            legions={pointsLegions}
            resultLabel="Place"
            resultOptions={TRI_ALLIANCE_PLACES}
            state={pointsState}
            readOnly={readOnly}
            schedules={legionSchedules}
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
                  <th>Rank</th>
                  <th>Tri Alliance Power</th>
                  <th>Power</th>
                  <th>Assign</th>
                </tr>
              </thead>
              <tbody>
                {filterPlayers(assignments.unassigned).sort(byRankThenTriPower).map((player) => (
                  <tr key={player.id}>
                    <td>
                      <PlayerIdentity player={player} />
                    </td>
                    <td>
                      <RankBadge rank={player.allianceRank} />
                    </td>
                    <td className={styles.powerCell} title={formatPower(player.trialliancePower)}>
                      {formatCompactPower(player.trialliancePower)}
                    </td>
                    <td className={styles.powerCell} title={formatPower(player.power)}>
                      {formatCompactPower(player.power)}
                    </td>
                    <td>
                      <select
                        value="unassigned"
                        disabled={!canEdit}
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
                <LegionPlayersTable
                  title={`Players (${assignments[column.legion].length}/${MAX_LEGION_PLAYERS})`}
                  players={filterPlayers(assignments[column.legion])}
                  category={column.legion}
                  onMove={movePlayer}
                  teams={legionTeams[column.legion].teams}
                  onPlace={(player, value) => placePlayer(column.legion, player, value)}
                />
                <LegionPlayersTable
                  title={`Substitutes (${assignments[column.substitutes].length}/${MAX_LEGION_SUBSTITUTES})`}
                  players={filterPlayers(assignments[column.substitutes])}
                  category={column.substitutes}
                  onMove={movePlayer}
                />
                {legionTeams[column.legion].manual && (
                  <div className={styles.manualBar}>
                    <span>Teams changed by hand.</span>
                    {canEdit && (
                      <button type="button" className={styles.regenerateButton} onClick={() => regenerateTeams(column.legion)}>
                        Generate again
                      </button>
                    )}
                  </div>
                )}
                <AssignmentCards
                  title="Teams"
                  idPrefix={column.legion}
                  cards={teamCards(legionTeams[column.legion].teams, assignments[column.substitutes])}
                  powerOf={triPower}
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
          readOnly={readOnly}
          placeholder={readOnly ? "No notes." : "Anything to remember about this event..."}
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
            <button type="button" className={styles.resetButton} onClick={handleReset}>
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
