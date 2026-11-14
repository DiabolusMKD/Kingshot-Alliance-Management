"use client";

import { LegionBuildingData, Player } from "@/types";
import PlayerIdentity from "./PlayerIdentity";
import { PowerMode, getPlayerPower, getPowerLabel } from "@/utils/powerMode";
import styles from "./LegionTable.module.css";

type Legion = "legion1" | "legion2";

interface LegionTableProps {
  title: string;
  players: Player[];
  legion: Legion;
  BUILDINGS: string[];
  selectedBuilding?: string | null;
  preview?: LegionBuildingData;
  filterPlayers: (players: Player[]) => Player[];
  /** Which power is shown (and used to build the assignments) */
  powerMode: PowerMode;

  handleManualBuildingAssign: (
    legion: Legion,
    player: Player,
    building: string,
  ) => void;

  movePlayerToSubstitute: (playerId: string, legion: Legion) => void;

  movePlayerFromSubstitute?: (playerId: string, legion: Legion) => void;

  movePlayer: (
    playerId: string,
    fromCategory: string,
    toCategory: string,
  ) => void;
}

function getBuildingNameByPlayer(
  buildings: LegionBuildingData["buildings"],
  playerId: string,
): string | undefined {
  return Object.keys(buildings).find(
    (key) =>
      buildings[key].leader?.id === playerId ||
      buildings[key].support.some((s) => s.id === playerId),
  );
}

function UnassignPlayerButton({
  player,
  legion,
  movePlayer,
  movePlayerFromSubstitute,
}: {
  player: Player;
  legion: Legion;
  movePlayer: (
    playerId: string,
    fromCategory: string,
    toCategory: string,
  ) => void;
  movePlayerFromSubstitute?: (playerId: string, legion: Legion) => void;
}) {
  if (movePlayerFromSubstitute) {
    return (
      <button
        type="button"
        className={styles.unassignButton}
        onClick={() => movePlayerFromSubstitute(player.id, legion)}
      >
        Remove
      </button>
    );
  } else {
    return (
      <button
        type="button"
        className={styles.unassignButton}
        onClick={() => movePlayer(player.id, legion, "unassigned")}
      >
        Unassign
      </button>
    );
  }
}

export default function LegionTable({
  title,
  players,
  legion,
  BUILDINGS,
  selectedBuilding,
  preview,
  filterPlayers,
  powerMode,
  handleManualBuildingAssign,
  movePlayerToSubstitute,
  movePlayerFromSubstitute,
  movePlayer,
}: LegionTableProps) {
  const filtered = filterPlayers(players);

  return (
    <div className={styles.legionTable}>
      <h3 className={styles.columnTitle}>{title}</h3>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Player</th>
              <th>{getPowerLabel(powerMode)}</th>
              <th>Building</th>
              <th>Move</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((player) => (
              <tr key={`${legion}-${player.id}`}>
                <td>
                  <PlayerIdentity player={player} />
                </td>
                <td>{getPlayerPower(player, powerMode)}</td>

                <td>
                  <select
                    className={styles.tableSelect}
                    value={
                      getBuildingNameByPlayer(
                        preview?.buildings || {},
                        player.id,
                      ) || selectedBuilding || ""
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) return;

                      if (value === "substitute") {
                        movePlayerToSubstitute(player.id, legion);
                      } else {
                        handleManualBuildingAssign(legion, player, value);
                      }
                      e.target.value = "";
                    }}
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    <option value="substitute">📌 Substitute</option>

                    {BUILDINGS.map((b) => (
                      <option key={`${legion}-${b}`} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  <UnassignPlayerButton
                    player={player}
                    legion={legion}
                    movePlayer={movePlayer}
                    movePlayerFromSubstitute={movePlayerFromSubstitute}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
