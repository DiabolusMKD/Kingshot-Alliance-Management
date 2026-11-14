"use client";

import { LEGION_START_TIMES, LegionSchedule } from "@/utils/legionSchedule";
import styles from "./LegionTimeSelect.module.css";

interface LegionTimeSelectProps {
  /** Used for the accessible name, e.g. "Legion 1" */
  legionTitle: string;
  schedule: LegionSchedule;
  onChange: (time: string | null) => void;
}

/** Start time (UTC) of a legion, shown next to the legion title */
export default function LegionTimeSelect({ legionTitle, schedule, onChange }: LegionTimeSelectProps) {
  // Keep a saved time visible even if it was removed from the list
  const times =
    schedule.time && !LEGION_START_TIMES.includes(schedule.time)
      ? [...LEGION_START_TIMES, schedule.time]
      : LEGION_START_TIMES;

  return (
    <span className={styles.wrapper}>
      {schedule.weekday && <span className={styles.weekday}>{schedule.weekday}</span>}
      <select
        className={styles.select}
        value={schedule.time ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={`${legionTitle} start time`}
      >
        <option value="">Start time</option>
        {times.map((time) => (
          <option key={time} value={time}>
            {time} UTC
          </option>
        ))}
      </select>
    </span>
  );
}
