"use client";

import styles from "./ResultLabel.module.css";

const RESULT_LABELS: Record<string, string> = {
  win: "Win",
  lose: "Lose",
  "1st": "1st place",
  "2nd": "2nd place",
  "3rd": "3rd place",
};

/** "Win", "Lose", "1st place"... (unknown values as they are) */
export const formatResult = (result: string) => RESULT_LABELS[result] ?? result;

// Tri Alliance places: gold, silver, bronze
const PLACE_COLORS: Record<string, string> = { "1st": "#f5c542", "2nd": "#c0c7d1", "3rd": "#cd7f32" };

/** Trophy; Tri Alliance shows the place number in the cup */
function TrophyIcon({ color, place }: { color: string; place?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path d="M7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M6.5 2.5h11V9a5.5 5.5 0 0 1-11 0z" fill={color} />
      <rect x="11" y="14" width="2" height="4" fill={color} />
      <rect x="7" y="18" width="10" height="3.5" rx="1" fill={color} />
      {place && (
        <text x="12" y="8.6" textAnchor="middle" dominantBaseline="middle" className={styles.trophyNumber}>
          {place}
        </text>
      )}
    </svg>
  );
}

/** White flag: the legion lost */
function FlagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path d="M5 21V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 4h12l-2.5 4 2.5 4H5z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

/** Result with its icon: Win trophy / Lose flag, Tri Alliance place trophy */
export default function ResultLabel({ result, className }: { result: string; className?: string }) {
  const place = PLACE_COLORS[result] ? result.replace(/\D/g, "") : null;
  return (
    <span className={`${styles.result} ${result === "lose" ? styles.lose : ""} ${className ?? ""}`}>
      {result === "win" && <TrophyIcon color={PLACE_COLORS["1st"]} />}
      {result === "lose" && <FlagIcon />}
      {place && <TrophyIcon color={PLACE_COLORS[result]} place={place} />}
      {formatResult(result)}
    </span>
  );
}

