"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./PlayerStatsChart.module.css";

export interface ChartPoint {
  id: string | number;
  /** Short x-axis label, e.g. "Nov 9" */
  label: string;
  value: number;
  /** missed: didn't show up (drawn hollow on the baseline); highlight: e.g. MVP */
  tone?: "normal" | "missed" | "highlight";
  /** Lines shown in the tooltip */
  details: string[];
}

interface PlayerStatsChartProps {
  title: string;
  points: ChartPoint[];
  formatValue: (value: number) => string;
  emptyMessage: string;
}

const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Round axis maximum: 1, 2, 2.5 or 5 x 10^n above the largest value */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Single-series line chart (one per metric, never two y-scales) with a tooltip per point */
export default function PlayerStatsChart({ title, points, formatValue, emptyMessage }: PlayerStatsChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // Draw at the real width so text never gets stretched
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = Math.max(width - PAD.left - PAD.right, 0);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  // Events are spaced evenly (one slot per event), oldest on the left
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  // At most ~6 x labels so they never collide
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 80))));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const activePoint = active !== null ? points[active] : null;

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.title}>{title}</figcaption>

      <div ref={wrapperRef} className={styles.plot} onMouseLeave={() => setActive(null)}>
        {points.length === 0 ? (
          <p className={styles.empty}>{emptyMessage}</p>
        ) : (
          width > 0 && (
            <svg width={width} height={HEIGHT} role="img" aria-label={title}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
                  <text x={PAD.left - 8} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                    {compact.format(t)}
                  </text>
                </g>
              ))}

              {points.map((p, i) =>
                i % labelEvery === 0 || i === points.length - 1 ? (
                  <text key={`x-${p.id}`} x={x(i)} y={HEIGHT - 8} className={styles.axisLabel} textAnchor="middle">
                    {p.label}
                  </text>
                ) : null,
              )}

              {points.length > 1 && <path d={path} className={styles.line} />}

              {activePoint && active !== null && (
                <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} className={styles.crosshair} />
              )}

              {points.map((p, i) => (
                <g key={p.id}>
                  {p.tone === "highlight" && <circle cx={x(i)} cy={y(p.value)} r={9} className={styles.highlightRing} />}
                  <circle
                    cx={x(i)}
                    cy={y(p.value)}
                    r={active === i ? 6 : 5}
                    className={p.tone === "missed" ? styles.dotMissed : styles.dot}
                  />
                  {/* Hit target bigger than the dot */}
                  <circle
                    cx={x(i)}
                    cy={y(p.value)}
                    r={14}
                    className={styles.hit}
                    tabIndex={0}
                    aria-label={`${p.label}: ${p.details.join(", ")}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  />
                </g>
              ))}
            </svg>
          )
        )}

        {activePoint && active !== null && (
          <div
            className={styles.tooltip}
            style={{
              left: Math.min(Math.max(x(active), 90), width - 90),
              top: Math.max(y(activePoint.value) - 12, 0),
            }}
            role="status"
          >
            <strong>{formatValue(activePoint.value)}</strong>
            {activePoint.details.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
