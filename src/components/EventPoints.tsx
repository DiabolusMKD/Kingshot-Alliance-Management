"use client";

import { useState } from "react";
import { EventResults, LegionResultKey, Player, PlayerAssignment, SwordlandMvpType, SwordlandMvps } from "@/types";
import { getResultsPoints } from "@/utils/eventResults";
import { LegionSchedules } from "@/utils/legionSchedule";
import ResultLabel from "./ResultLabel";
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

export interface MvpTypeOption {
  value: SwordlandMvpType;
  label: string;
}

interface LegionMeta {
  status: string | null;
  mvp: string | null;
  /** Swordland: one player per MVP type */
  mvps: SwordlandMvps;
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
      mvps: initialResults?.legion_1.mvps ?? {},
    },
    legion_2: {
      status: initialResults?.legion_2.status ?? null,
      mvp: initialResults?.legion_2.mvp ?? null,
      mvps: initialResults?.legion_2.mvps ?? {},
    },
  }));

  const setPoint = (playerId: string, value: string) =>
    setPoints((prev) => ({ ...prev, [playerId]: value }));

  const setStatus = (key: LegionResultKey, status: string | null) =>
    setLegionMeta((prev) => ({ ...prev, [key]: { ...prev[key], status } }));

  // A single MVP per legion: selecting a new one replaces the previous
  const setMvp = (key: LegionResultKey, playerId: string | null) =>
    setLegionMeta((prev) => ({ ...prev, [key]: { ...prev[key], mvp: playerId } }));

  // One player per MVP type: picking a player replaces the previous one
  const setTypedMvp = (key: LegionResultKey, type: SwordlandMvpType, playerId: string | null) =>
    setLegionMeta((prev) => {
      const mvps = { ...prev[key].mvps };
      if (playerId) mvps[type] = playerId;
      else delete mvps[type];
      return { ...prev, [key]: { ...prev[key], mvps } };
    });

  const buildResults = (legions: PointsLegion[]): EventResults => {
    const results = {} as EventResults;

    legions.forEach((legion) => {
      const members = [...legion.players, ...legion.substitutes];
      // Ids compared as strings (bigint ids arrive as numbers)
      const memberIds = new Set(members.map((p) => String(p.id)));
      const { status, mvp, mvps } = legionMeta[legion.key];
      // MVPs moved out of this legion are dropped
      const legionMvps = Object.fromEntries(
        Object.entries(mvps).filter(([, id]) => id != null && memberIds.has(String(id))),
      ) as SwordlandMvps;

      results[legion.key] = {
        status,
        // Drop the MVP if they were moved out of this legion
        mvp: mvp != null && memberIds.has(String(mvp)) ? String(mvp) : null,
        mvps: legionMvps,
        players_points: members
          .filter((p) => points[p.id]?.trim())
          .map((p) => ({ [p.id]: Number(points[p.id]) })),
      };
    });

    return results;
  };

  return { points, legionMeta, setPoint, setStatus, setMvp, setTypedMvp, buildResults };
}

export type EventPointsState = ReturnType<typeof useEventPoints>;

interface EventPointsProps {
  legions: PointsLegion[];
  resultLabel: string;
  resultOptions: ResultOption[];
  state: EventPointsState;
  /** Swordland: MVP per type (one dropdown each) instead of one MVP per legion */
  mvpTypes?: MvpTypeOption[];
  /** Locked completed event: values are shown, nothing can be changed */
  readOnly?: boolean;
  /** Legion start times, shown before the result */
  schedules?: LegionSchedules;
}

/** Swordland: one dropdown per MVP type, listing the legion's players and substitutes */
function MvpPicker({
  legion,
  mvpTypes,
  state,
  readOnly,
}: {
  legion: PointsLegion;
  mvpTypes: MvpTypeOption[];
  state: EventPointsState;
  readOnly: boolean;
}) {
  const members = [...legion.players, ...legion.substitutes];
  const mvps = state.legionMeta[legion.key].mvps;

  return (
    <div className={styles.mvpPicker}>
      {mvpTypes.map((type) => {
        const id = `mvp-${legion.key}-${type.value}`;
        const selected = mvps[type.value] ?? "";
        if (readOnly) {
          const winner = members.find((p) => String(p.id) === selected);
          return (
            <div key={type.value} className={styles.mvpField}>
              <span className={styles.mvpLabel}>{type.label}</span>
              <span className={`${styles.readOnlyValue} ${winner ? styles.mvpWinner : ""}`}>
                {winner ? winner.name : "—"}
              </span>
            </div>
          );
        }
        return (
          <div key={type.value} className={styles.mvpField}>
            <label htmlFor={id} className={styles.mvpLabel}>
              {type.label}
            </label>
            <select
              id={id}
              value={selected}
              onChange={(e) => state.setTypedMvp(legion.key, type.value, e.target.value || null)}
              className={`${styles.select} ${selected ? styles.mvpSelected : ""}`}
            >
              <option value="">None</option>
              {members.map((player) => (
                <option key={player.id} value={String(player.id)}>
                  {player.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function PointsList({
  title,
  legionKey,
  players,
  state,
  showMvpSelect,
  readOnly,
}: {
  title: string;
  legionKey: LegionResultKey;
  players: Player[];
  state: EventPointsState;
  showMvpSelect: boolean;
  readOnly: boolean;
}) {
  const mvp = state.legionMeta[legionKey].mvp;
  const isMvp = (player: Player) => mvp != null && String(mvp) === String(player.id);

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
              placeholder={readOnly ? "—" : "Points"}
              value={state.points[player.id] ?? ""}
              onChange={(e) => state.setPoint(player.id, e.target.value)}
              readOnly={readOnly}
              className={`${styles.input} ${readOnly ? styles.inputReadOnly : ""}`}
            />
            {showMvpSelect && readOnly && isMvp(player) && <span className={styles.mvpTag}>MVP</span>}
            {showMvpSelect && !readOnly && (
            <select
              value={isMvp(player) ? "mvp" : ""}
              onChange={(e) =>
                state.setMvp(
                  legionKey,
                  e.target.value === "mvp" ? String(player.id) : isMvp(player) ? null : mvp,
                )
              }
              className={`${styles.select} ${isMvp(player) ? styles.mvpSelected : ""}`}
              aria-label={`MVP for ${player.name}`}
            >
              <option value="">None</option>
              <option value="mvp">MVP</option>
            </select>
            )}
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
  mvpTypes,
  readOnly = false,
  schedules,
}: EventPointsProps) {
  // Players with their MVP labels per legion (chart)
  const mvpLabels = (key: LegionResultKey): Record<string, string[]> => {
    const labels: Record<string, string[]> = {};
    const add = (id: string | null | undefined, label: string) => {
      if (id == null) return;
      labels[String(id)] = [...(labels[String(id)] ?? []), label];
    };
    const meta = state.legionMeta[key];
    if (mvpTypes) mvpTypes.forEach((type) => add(meta.mvps[type.value], type.label));
    // Older Swordland events / Tri Alliance: one MVP
    add(meta.mvp, "MVP");
    return labels;
  };

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
                  <div className={styles.legionGroupMeta}>
                  {/* Start time, then the result */}
                  {schedules?.[legion.key].time && (
                    <span className={styles.legionStart}>
                      {[schedules[legion.key].weekday, `${schedules[legion.key].time} UTC`].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {readOnly ? (
                    state.legionMeta[legion.key].status ? (
                      <ResultLabel result={state.legionMeta[legion.key].status!} className={styles.resultLabel} />
                    ) : (
                      <span className={styles.noResult}>No {resultLabel.toLowerCase()}</span>
                    )
                  ) : (
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
                  )}
                  </div>
                </div>
                {mvpTypes && <MvpPicker legion={legion} mvpTypes={mvpTypes} state={state} readOnly={readOnly} />}
                <PointsList
                  title={`Players (${legion.players.length})`}
                  legionKey={legion.key}
                  players={legion.players}
                  state={state}
                  showMvpSelect={!mvpTypes}
                  readOnly={readOnly}
                />
                {legion.substitutes.length > 0 && (
                  <PointsList
                    title={`Substitutes (${legion.substitutes.length})`}
                    legionKey={legion.key}
                    players={legion.substitutes}
                    state={state}
                    showMvpSelect={!mvpTypes}
                    readOnly={readOnly}
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
              mvpLabels: mvpLabels(legion.key),
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
