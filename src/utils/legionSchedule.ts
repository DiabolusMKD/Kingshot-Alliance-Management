import { LegionResultKey } from "@/types";
import { getNotesField } from "./eventResults";

/** Start times (UTC) a legion can be scheduled at - add more here */
export const LEGION_START_TIMES = ["12:00", "14:00", "19:00"];

export interface LegionSchedule {
  /** Day of the event start (UTC), e.g. "Sunday" */
  weekday: string | null;
  /** One of LEGION_START_TIMES (UTC), null when not picked yet */
  time: string | null;
}

export type LegionSchedules = Record<LegionResultKey, LegionSchedule>;

/** Key of the schedules in the event notes */
export const LEGION_SCHEDULE_FIELD = "legionSchedule";

/** Weekday (UTC) of the event start, e.g. "Sunday" */
export function getEventWeekday(startsAt?: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/**
 * Legion start times saved in the notes. The weekday always follows the event's
 * start date (falling back to the saved one when the event has no start).
 */
export function parseLegionSchedules(
  notes: string | null | undefined,
  startsAt?: string | null,
): LegionSchedules {
  const saved = getNotesField(notes, LEGION_SCHEDULE_FIELD) as
    | Partial<Record<LegionResultKey, Partial<LegionSchedule>>>
    | undefined;
  const weekday = getEventWeekday(startsAt);

  const read = (key: LegionResultKey): LegionSchedule => {
    const entry = saved && typeof saved === "object" ? saved[key] : undefined;
    return {
      weekday: weekday ?? (typeof entry?.weekday === "string" ? entry.weekday : null),
      time: typeof entry?.time === "string" ? entry.time : null,
    };
  };

  return { legion_1: read("legion_1"), legion_2: read("legion_2") };
}

/** "Legion 1 (Sunday, 14:00 UTC)"; just the title while no time is picked */
export function formatLegionTitle(title: string, schedule?: LegionSchedule): string {
  if (!schedule?.time) return title;
  const parts = [schedule.weekday, `${schedule.time} UTC`].filter(Boolean);
  return `${title} (${parts.join(", ")})`;
}
