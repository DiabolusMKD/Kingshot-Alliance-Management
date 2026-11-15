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
