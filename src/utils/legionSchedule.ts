import { AllianceEvent, LegionResultKey } from "@/types";

/** Start times (UTC) a legion can be scheduled at - add more here */
export const LEGION_START_TIMES = ["12:00", "14:00", "19:00"];

export interface LegionSchedule {
  /** Day of the event start (UTC), e.g. "Sunday" */
  weekday: string | null;
  /** One of LEGION_START_TIMES (UTC), null when not picked yet */
  time: string | null;
}

export type LegionSchedules = Record<LegionResultKey, LegionSchedule>;

/** Weekday (UTC) of the event start, e.g. "Sunday" */
export function getEventWeekday(startsAt?: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** Legion start times of the event (columns) + the weekday of its start */
export function getLegionSchedules(
  event?: Pick<AllianceEvent, "startsAt" | "legion1StartTime" | "legion2StartTime"> | null,
): LegionSchedules {
  const weekday = getEventWeekday(event?.startsAt);
  return {
    legion_1: { weekday, time: event?.legion1StartTime ?? null },
    legion_2: { weekday, time: event?.legion2StartTime ?? null },
  };
}

/** "Legion 1 (Sunday, 14:00 UTC)"; just the title while no time is picked */
export function formatLegionTitle(title: string, schedule?: LegionSchedule): string {
  if (!schedule?.time) return title;
  const parts = [schedule.weekday, `${schedule.time} UTC`].filter(Boolean);
  return `${title} (${parts.join(", ")})`;
}

/** "Nov 22, 2026, 14:00 UTC" (24-hour, UTC); null without a valid date */
export function formatEventDateTimeUtc(startsAt?: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  return `${day}, ${time} UTC`;
}

// ---------------- Event start: datetime-local inputs are UTC ----------------

/** "2026-11-22T14:00" typed in a datetime-local input, read as UTC -> ISO; null when invalid */
export function utcInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 16)}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO -> "2026-11-22T14:00" (UTC) for a datetime-local input */
export function isoToUtcInput(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}
