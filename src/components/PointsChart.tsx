"use client";

import { LegionResultKey, Player } from "@/types";
import styles from "./PointsChart.module.css";

interface ChartLegion {
  key: LegionResultKey;
  title: string;
  result: string | null;
  mvp: string | null;
  players: Player[];
  substitutes: Player[];
}

interface PointsChartProps {
  legions: ChartLegion[];
  points: Record<string, string>;
}

interface ChartRow {
  id: string;
  name: string;
  points: number;
  isSubstitute: boolean;
  isMvp: boolean;
}

const formatNumber = (value: number) => value.toLocaleString("en-US");

function toRows(legion: ChartLegion, points: Record<string, string>): ChartRow[] {
  const rows = [
    ...legion.players.map((p) => ({ player: p, isSubstitute: false })),
    ...legion.substitutes.map((p) => ({ player: p, isSubstitute: true })),
  ]
    .filter(({ player }) => points[player.id]?.trim())
    .map(({ player, isSubstitute }) => ({
      id: player.id,
      name: player.name,
      points: Number(points[player.id]) || 0,
      isSubstitute,
      isMvp: legion.mvp === player.id,
    }));

  // Ranked: highest points first
  return rows.sort((a, b) => b.points - a.points);
}

/**
 * Ranked horizontal bars of every player's points, one panel per legion.
 * Both legions share one scale so their bars compare directly.
 */
export default function PointsChart({ legions, points }: PointsChartProps) {
  const panels = legions.map((legion) => ({ legion, rows: toRows(legion, points) }));
  const maxPoints = Math.max(1, ...panels.flatMap(({ rows }) => rows.map((r) => r.points)));

  return (
    <section className={styles.section} aria-label="Points overview">
      <h3 className={styles.header}>Points overview</h3>
      <div className={styles.grid}>
        {panels.map(({ legion, rows }) => {
          const memberCount = legion.players.length + legion.substitutes.length;
          const total = rows.reduce((sum, r) => sum + r.points, 0);
          const average = rows.length ? Math.round(total / rows.length) : 0;
          const top = rows[0];

          return (
            <div key={legion.key} className={styles.card}>
              <div className={styles.cardHeader}>
                <h4 className={styles.cardTitle}>{legion.title}</h4>
                {legion.result && <span className={styles.result}>{legion.result}</span>}
              </div>

              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt>Total</dt>
                  <dd>{formatNumber(total)}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Average</dt>
                  <dd>{formatNumber(average)}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Top scorer</dt>
                  <dd className={styles.statName}>{top ? top.name : "—"}</dd>
                </div>
              </dl>

              {rows.length === 0 ? (
                <p className={styles.empty}>Enter points to see the ranking.</p>
              ) : (
                <ol className={styles.bars}>
                  {rows.map((row) => {
                    const description = `${row.name}: ${formatNumber(row.points)} points${
                      row.isSubstitute ? ", substitute" : ""
                    }${row.isMvp ? ", MVP" : ""}`;

                    return (
                      <li
                        key={row.id}
                        className={styles.row}
                        title={description}
                        aria-label={description}
                        tabIndex={0}
                      >
                        <span className={styles.name}>
                          {row.isMvp && (
                            <span className={styles.mvp}>
                              <span aria-hidden="true">★</span> MVP
                            </span>
                          )}
                          <span className={styles.nameText}>{row.name}</span>
                          {row.isSubstitute && <span className={styles.sub}>Sub</span>}
                        </span>
                        <span className={styles.track}>
                          <span
                            className={styles.bar}
                            style={{ width: `${(row.points / maxPoints) * 100}%` }}
                          />
                          <span className={styles.value}>{formatNumber(row.points)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {rows.length < memberCount && (
                <p className={styles.footnote}>
                  {memberCount - rows.length} of {memberCount} players have no points yet
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
