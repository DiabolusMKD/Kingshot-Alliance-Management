"use client";

import { useEffect, useMemo, useState } from "react";
import { AllianceEvent, EventResults, Player, PlayerAssignment } from "@/types";
import { loadEventEditorData } from "@/utils/eventData";
import { getPlayersByIds } from "@/utils/playerService";
import { getPowersAtOrNone, hasEventStarted, PowerSnapshot, withPowersAt } from "@/utils/powerHistory";

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
  /** Started events: each player's powers just before the start (null: current powers) */
  startPowers: Map<string, PowerSnapshot> | null;
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
        const currentExtraPlayers = missingIds.length > 0 ? await getPlayersByIds(missingIds) : [];
        const startPowers =
          hasEventStarted(event) && event.startsAt
            ? await getPowersAtOrNone(
                [...alliancePlayers, ...currentExtraPlayers].map((p) => p.id),
                event.startsAt,
              )
            : null;
        const extraPlayers = withPowersAt(currentExtraPlayers, startPowers);
        if (isMounted) setData({ key, ...loaded, extraPlayers, startPowers, error: null });
      } catch (error) {
        console.error("Failed to load the event's players:", error);
        if (isMounted) {
          setData({
            key,
            assignments: [],
            results: null,
            extraPlayers: [],
            startPowers: null,
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
  const startPowers = current?.startPowers ?? null;
  // Same array as long as the players and powers don't change (the editors re-initialize on a new one)
  const players = useMemo(() => withPowersAt(alliancePlayers, startPowers), [alliancePlayers, startPowers]);

  return {
    /** The alliance's players, with their powers just before the start for started events */
    players,
    /** The powers are the ones recorded before the event started */
    usesStartPowers: !!startPowers && startPowers.size > 0,
    ready: !!current && !current.error,
    error: current?.error ?? null,
    assignments: current?.assignments ?? null,
    results: current?.results ?? null,
    extraPlayers: current?.extraPlayers ?? null,
  };
}
