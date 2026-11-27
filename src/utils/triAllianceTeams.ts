import { Player, PlayerAssignment } from "@/types";

// Tri-Alliance teams of a legion: 4 teams, each with offense and support players

export const TEAM_LABELS = [
  "Team 1 (Right outer)",
  "Team 2 (Right inner)",
  "Team 3 (Left outer)",
  "Team 4 (Left inner)",
];
// Distribution order by power rank: outer teams first, right before left
export const DISTRIBUTION_ORDER = [0, 2, 1, 3];

// Most offense players a team can have (teams of 6+ get 3 when generated, smaller teams 2)
export const MAX_OFFENSE = 3;

export type TeamRole = "offense" | "support";
export interface Team {
  offense: Player[];
  support: Player[];
}
/** Saved team positions by player id ("Team 1".."Team 4" + offense/support) */
export type Placements = Map<string, Pick<PlayerAssignment, "position" | "positionRole">>;

export const triPower = (player: Player) => Number(player.trialliancePower) || 0;
export const byTriPower = (a: Player, b: Player) => triPower(b) - triPower(a);

export const emptyTeams = (): Team[] => TEAM_LABELS.map(() => ({ offense: [], support: [] }));
export const teamSize = (team: Team) => team.offense.length + team.support.length;
/** Offense first, then support */
export const teamPlayers = (team: Team) => [...team.offense, ...team.support];

/** Splits a legion into the 4 teams (offense + support), strongest first (by tri-alliance power by default) */
export function splitLegion(players: Player[], powerOf: (player: Player) => number = triPower): Team[] {
  const sortedPlayers = [...players].sort((a, b) => powerOf(b) - powerOf(a));

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

/** Teams from saved positions, or null when any player has none */
export function teamsFromPlacements(players: Player[], placements: Placements): Team[] | null {
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

/** Saved teams when every player has a position, otherwise generated ones */
export const savedOrGeneratedTeams = (players: Player[], placements: Placements): Team[] =>
  (players.length > 0 ? teamsFromPlacements(players, placements) : null) ?? splitLegion(players);
