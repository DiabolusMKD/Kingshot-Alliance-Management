"use client";

import { useEffect, useState } from "react";
import { AllianceEvent, EventResults, Player, PlayerAssignment } from "@/types";
import { loadEventEditorData } from "@/utils/eventData";
import { getPlayersByIds } from "@/utils/playerService";

/** The legacy assignments JSON lists at least one player */
function hasLegacyAssignments(event: AllianceEvent): boolean {
  try {
    const parsed = JSON.parse(event.assignments ?? "null");
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

interface LoadedEditorData {
  key: string;
  assignments: PlayerAssignment[];
  results: EventResults | null;
  /** Players saved in the event who aren't in the alliance now (SSL guests, former members) */
  extraPlayers: Player[];
  error: string | null;
}

/**
 * Saved players + results of the open event (event_player + the event's columns).
 * Reloads when the event is saved (its updatedAt changes); the editor waits for `ready`.
 */
export function useEventEditorData(
  event: AllianceEvent | null,
  alliancePlayers: Player[],
  enabled: boolean,
) {
  const key = event?.id !== undefined ? `${event.id}:${event.updatedAt ?? ""}` : "";
  const [data, setData] = useState<LoadedEditorData | null>(null);

  useEffect(() => {
    if (!event || !key || !enabled || data?.key === key) return;

    let isMounted = true;
    (async () => {
      try {
        const loaded = await loadEventEditorData(event);
        // Old events keep their assignments JSON: no readable rows then means event_player
        // can't be read (e.g. RLS without a select policy), not an empty event. Saving an
        // empty editor would remove its players, so the editor isn't shown.
        if (loaded.assignments.length === 0 && hasLegacyAssignments(event)) {
          throw new Error(
            "this event has saved assignments, but none of its event_player rows could be read. " +
              "Check that the migration ran and that event_player has a select policy (RLS).",
          );
        }
        const ownIds = new Set(alliancePlayers.map((p) => String(p.id)));
        const missingIds = loaded.assignments.map((a) => String(a.playerId)).filter((id) => !ownIds.has(id));
        const extraPlayers = missingIds.length > 0 ? await getPlayersByIds(missingIds) : [];
        if (isMounted) setData({ key, ...loaded, extraPlayers, error: null });
      } catch (error) {
        console.error("Failed to load the event's players:", error);
        if (isMounted) {
          setData({
            key,
            assignments: [],
            results: null,
            extraPlayers: [],
            error: error instanceof Error ? error.message : "Failed to load the event's players",
          });
        }
      }
    })();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, alliancePlayers]);

  const current = data?.key === key ? data : null;
  return {
    ready: !!current && !current.error,
    error: current?.error ?? null,
    assignments: current?.assignments ?? null,
    results: current?.results ?? null,
    extraPlayers: current?.extraPlayers ?? null,
  };
}
