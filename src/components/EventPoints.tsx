"use client";

import { useState } from "react";
import { EventResults, LegionResultKey, Player, PlayerAssignment } from "@/types";
import { getResultsPoints } from "@/utils/eventResults";
import PointsChart from "./PointsChart";
import styles from "./EventPoints.module.css";

export interface PointsLegion {
  key: LegionResultKey;
  title: string;
  players: Player[];
  substitutes: Player[];
}

export interface ResultOption {
  value: string;
  label: string;
}

interface LegionMeta {
  status: string | null;
  mvp: string | null;
}

/** Points saved by older versions inside the assignments (before results moved to notes) */
function getLegacyPoints(assignments: PlayerAssignment[]): Record<string, string> {
  const legacyPoints: Record<string, string> = {};
  assignments.forEach((a) => {
    if (a.points !== undefined && a.points !== null) {
      legacyPoints[a.playerId] = String(a.points);
    }
  });
  return legacyPoints;
}

/**
 * Holds the editable points, legion result and MVP state of a completed event,
 * prepopulated from the saved results (alliance_event.notes).
 */
export function useEventPoints(
  initialAssignments: PlayerAssignment[],
  initialResults: EventResults | null,
) {
  // Points per player id, kept as input strings until save
  const [points, setPoints] = useState<Record<string, string>>(() => {
    if (!initialResults) return getLegacyPoints(initialAssignments);
    return Object.fromEntries(
      Object.entries(getResultsPoints(initialResults)).map(([id, value]) => [id, String(value)]),
    );
  });

  const [legionMeta, setLegionMeta] = useState<Record<LegionResultKey, LegionMeta>>(() => ({
    legion_1: {
      status: initialResults?.legion_1.status ?? null,
      mvp: initialResults?.legion_1.mvp ?? null,
    },
    legion_2: {
      status: initialResults?.legion_2.status ?? null,
      mvp: initialResults?.legion_2.mvp ?? null,
    },
  }));

  const setPoint = (playerId: string, value: string) =>
    setPoints((prev) => ({ ...prev, [playerId]: value }));

  const setStatus = (key: LegionResultKey, status: string | null) =>
    setLegionMeta((prev) => ({ ...prev, [key]: { ...prev[key], status } }));

  // A single MVP per legion: selecting a new one replaces the previous
  const setMvp = (key: LegionResultKey, playerId: string | null) =>
    setLegionMeta((prev) => ({ ...prev, [key]: { ...prev[key], mvp: playerId } }));

  const buildResults = (legions: PointsLegion[]): EventResults => {
    const results = {} as EventResults;

    legions.forEach((legion) => {
      const members = [...legion.players, ...legion.substitutes];
      const memberIds = new Set(members.map((p) => p.id));
      const { status, mvp } = legionMeta[legion.key];

      results[legion.key] = {
        status,
        // Drop the MVP if they were moved out of this legion
        mvp: mvp && memberIds.has(mvp) ? mvp : null,
        players_points: members
          .filter((p) => points[p.id]?.trim())
          .map((p) => ({ [p.id]: Number(points[p.id]) })),
      };
    });

    return results;
  };

  return { points, legionMeta, setPoint, setStatus, setMvp, buildResults };
}

export type EventPointsState = ReturnType<typeof useEventPoints>;

interface EventPointsProps {
  legions: PointsLegion[];
  resultLabel: string;
  resultOptions: ResultOption[];
  state: EventPointsState;
}

function PointsList({
  title,
  legionKey,
  players,
  state,
}: {
  title: string;
  legionKey: LegionResultKey;
  players: Player[];
  state: EventPointsState;
}) {
  const mvp = state.legionMeta[legionKey].mvp;

  return (
    <div className={styles.column}>
      <h4 className={styles.columnTitle}>{title}</h4>
      <div className={styles.playerList}>
        {players.map((player) => (
          <div key={player.id} className={styles.playerItem}>
            <label htmlFor={`points-${player.id}`} className={styles.playerName}>
              {player.name}
            </label>
            <input
              id={`points-${player.id}`}
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="Points"
              value={state.points[player.id] ?? ""}
              onChange={(e) => state.setPoint(player.id, e.target.value)}
              className={styles.input}
            />
            <select
              value={mvp === player.id ? "mvp" : ""}
              onChange={(e) =>
                state.setMvp(
                  legionKey,
                  e.target.value === "mvp" ? player.id : mvp === player.id ? null : mvp,
                )
              }
              className={`${styles.select} ${mvp === player.id ? styles.mvpSelected : ""}`}
              aria-label={`MVP for ${player.name}`}
            >
              <option value="">None</option>
              <option value="mvp">MVP</option>
            </select>
          </div>
        ))}
        {players.length === 0 && <p className={styles.empty}>No players</p>}
      </div>
    </div>
  );
}

export default function EventPoints({
  legions,
  resultLabel,
  resultOptions,
  state,
}: EventPointsProps) {
  const hasPlayers = legions.some(
    (legion) => legion.players.length > 0 || legion.substitutes.length > 0,
  );

  return (
    <section>
      <h2 className={styles.header}>Points</h2>
      {!hasPlayers ? (
        <p className={styles.empty}>No players assigned to this event.</p>
      ) : (
        <>
          {/* One column per legion: players, then substitutes */}
          <div className={styles.container}>
            {legions.map((legion) => (
              <div key={legion.key} className={styles.legionGroup}>
                <div className={styles.legionGroupHeader}>
                  <h3 className={styles.legionGroupTitle}>{legion.title}</h3>
                  <select
                    value={state.legionMeta[legion.key].status ?? ""}
                    onChange={(e) => state.setStatus(legion.key, e.target.value || null)}
                    className={styles.resultSelect}
                    aria-label={`${legion.title} ${resultLabel.toLowerCase()}`}
                  >
                    <option value="">{resultLabel}</option>
                    {resultOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <PointsList
                  title={`Players (${legion.players.length})`}
                  legionKey={legion.key}
                  players={legion.players}
                  state={state}
                />
                {legion.substitutes.length > 0 && (
                  <PointsList
                    title={`Substitutes (${legion.substitutes.length})`}
                    legionKey={legion.key}
                    players={legion.substitutes}
                    state={state}
                  />
                )}
              </div>
            ))}
          </div>

          <PointsChart
            legions={legions.map((legion) => ({
              key: legion.key,
              title: legion.title,
              result:
                resultOptions.find((o) => o.value === state.legionMeta[legion.key].status)
                  ?.label ?? null,
              mvp: state.legionMeta[legion.key].mvp,
              players: legion.players,
              substitutes: legion.substitutes,
            }))}
            points={state.points}
          />
        </>
      )}
    </section>
  );
}
