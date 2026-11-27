"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alliance, AllianceEvent, LegionBuildingData, LegionResultKey, Player } from "@/types";
import Navigation from "@/components/Navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import EventOpponents, { OpponentsState } from "@/components/EventOpponents";
import { useEventEditorData } from "@/components/useEventEditorData";
import { getPlayers } from "@/utils/playerService";
import { getAlliancesByKingdomId } from "@/utils/allianceService";
import { findAllianceBySlug } from "@/utils/allianceSlug";
import { findEventBySlug } from "@/utils/eventSlug";
import { getAllianceEvents } from "@/utils/eventService";
import { getPowerMode, getPlayerPower, getPowerLabel } from "@/utils/powerMode";
import { formatEventDateTimeUtc, formatLegionTitle, getLegionSchedules } from "@/utils/legionSchedule";
import {
  BUILDINGS,
  SwordlandLegion,
  UNDERCELLARS,
  buildingsFromPlacements,
  generateBuildings,
} from "@/utils/swordlandBuildings";
import { formatAllianceLabel } from "@/utils/allianceLabel";
import { formatCompactPower, formatNumbers } from "@/utils/formatNumbers";
import { MAX_LEGION_PLAYERS, MAX_LEGION_SUBSTITUTES } from "@/utils/constants";
import { useCanEdit } from "@/components/EditMode";
import styles from "@/components/EventAssignments.module.css";

const EVENT_ID = 1; // Swordland

const LEGIONS: { key: SwordlandLegion; resultKey: LegionResultKey; title: string }[] = [
  { key: "legion1", resultKey: "legion_1", title: "Legion 1" },
  { key: "legion2", resultKey: "legion_2", title: "Legion 2" },
];

interface PageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
  searchParams: Promise<{ event?: string | string[] }>;
}

/** Leader first, then the supports */
const buildingPlayers = (data: LegionBuildingData, building: string): Player[] => {
  const b = data.buildings?.[building];
  return b ? [...(b.leader ? [b.leader] : []), ...b.support] : [];
};

/** The opponent's predicted buildings, or why there are none */
interface Prediction {
  opponentLabel: string;
  kingdomId: number;
  data: LegionBuildingData | null;
  note?: string;
}

/**
 * The event's saved assignments on one page (opened in a new tab from the event), its opponents
 * and a simulation of the opponents' buildings next to ours.
 */
export default function SwordlandAssignmentsPage({ params, searchParams }: PageProps) {
  const { kingdomId, allianceSlug } = use(params);
  const { event: eventParam } = use(searchParams);
  const eventSlug = Array.isArray(eventParam) ? eventParam[0] : eventParam;
  const kingdomIdNumber = Number(kingdomId);

  const [alliance, setAlliance] = useState<Alliance | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [event, setEvent] = useState<AllianceEvent | null | undefined>(undefined);
  const [opponents, setOpponents] = useState<OpponentsState | null>(null);
  const [showSimulation, setShowSimulation] = useState(false);
  const canEdit = useCanEdit();

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const match = findAllianceBySlug(await getAlliancesByKingdomId(kingdomIdNumber), allianceSlug) ?? null;
        if (!isMounted) return;
        setAlliance(match);
        if (!match) return;
        const [playerRows, events] = await Promise.all([
          getPlayers(match.id, kingdomIdNumber),
          getAllianceEvents(match.id, EVENT_ID),
        ]);
        if (!isMounted) return;
        setPlayers(playerRows);
        setEvent(eventSlug ? findEventBySlug(events, eventSlug) ?? null : null);
      } catch (error) {
        console.error("Failed to load the assignments:", error);
        if (isMounted) setEvent(null);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [kingdomIdNumber, allianceSlug, eventSlug]);

  const editorData = useEventEditorData(event ?? null, players, !!event);
  const powerMode = getPowerMode(event);
  const schedules = getLegionSchedules(event ?? null);

  // Our buildings, as saved (generated like the editor when a player has no saved building)
  const ours = useMemo(() => {
    if (!editorData.ready || !editorData.assignments) return null;
    const pool = new Map(
      [...editorData.players, ...(editorData.extraPlayers ?? [])].map((p) => [String(p.id), p]),
    );
    const powerOf = (p: Player) => getPlayerPower(p, powerMode);
    const placements = new Map(
      editorData.assignments.map((a) => [String(a.playerId), { position: a.position, positionRole: a.positionRole }]),
    );
    const inLegion = (legion: string) =>
      editorData
        .assignments!.filter((a) => a.legion === legion)
        .map((a) => pool.get(String(a.playerId)))
        .filter((p): p is Player => !!p);

    return Object.fromEntries(
      LEGIONS.map(({ key }) => {
        const list = inLegion(key);
        const substitutes = inLegion(`substitute_${key}`);
        const saved = list.length > 0 ? buildingsFromPlacements(list, placements, powerOf) : null;
        const data: LegionBuildingData = saved
          ? { buildings: saved, substitutes }
          : generateBuildings(list, substitutes, powerOf);
        return [key, data];
      }),
    ) as Record<SwordlandLegion, LegionBuildingData>;
  }, [editorData.ready, editorData.assignments, editorData.players, editorData.extraPlayers, powerMode]);

  // The opponents' buildings: their strongest registered players (by power), placed like ours
  const predictions = useMemo(() => {
    if (!opponents) return null;
    return Object.fromEntries(
      LEGIONS.map(({ key, resultKey }) => {
        const opponent = opponents.opponents.find((o) => o.legion === resultKey);
        if (!opponent) return [key, null];
        const opponentAlliance =
          opponent.allianceId != null ? opponents.alliances.get(Number(opponent.allianceId)) : undefined;
        const label = opponentAlliance ? formatAllianceLabel(opponentAlliance) : `[${opponent.allianceTag}]`;
        const roster = opponent.allianceId != null ? opponents.players.get(Number(opponent.allianceId)) ?? [] : [];
        if (roster.length === 0) {
          return [key, { opponentLabel: label, kingdomId: opponent.kingdomId, data: null, note: "No players of this alliance in the app." }];
        }

        const sorted = [...roster].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
        const combatantCount = Math.min(opponent.registeredCombatants, MAX_LEGION_PLAYERS);
        const substituteCount = Math.min(opponent.registeredSubstitutes ?? 0, MAX_LEGION_SUBSTITUTES);
        const combatants = sorted.slice(0, combatantCount);
        const substitutes = sorted.slice(combatantCount, combatantCount + substituteCount);
        const missing = combatantCount + substituteCount - combatants.length - substitutes.length;
        const prediction: Prediction = {
          opponentLabel: label,
          kingdomId: opponent.kingdomId,
          data: generateBuildings(combatants, substitutes, (p) => p.power ?? 0),
          note:
            missing > 0
              ? `Registered ${combatantCount} + ${substituteCount} substitutes, but only ${roster.length} players are in the app.`
              : undefined,
        };
        return [key, prediction];
      }),
    ) as Record<SwordlandLegion, Prediction | null>;
  }, [opponents]);

  const powerOf = (p: Player) => getPlayerPower(p, powerMode);
  // The simulation compares by power on both sides: the opponents' Swordland power isn't known
  const totalPower = (p: Player) => p.power ?? 0;

  const renderShell = (content: React.ReactNode) => (
    <>
      <Navigation />
      <main className={styles.main}>
        <div className={styles.container}>
          <Breadcrumbs />
          {content}
        </div>
      </main>
    </>
  );

  if (alliance === null) return renderShell(<p>Alliance not found.</p>);
  if (event === null) return renderShell(<p>Event not found.</p>);
  if (!alliance || !event) return renderShell(<p>Loading the assignments...</p>);

  const editorHref = `/${kingdomId}/${allianceSlug}/events/swordland?event=${eventSlug}`;

  return renderShell(
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Swordland Assignments</h1>
          <p className={styles.subtitle}>
            {formatAllianceLabel(alliance)} · {formatEventDateTimeUtc(event.startsAt) ?? "No date set"} · by{" "}
            {getPowerLabel(powerMode)}
          </p>
        </div>
        <Link href={editorHref} className={styles.secondaryButton}>
          Open the event
        </Link>
      </header>
      {canEdit && (
        <p className={styles.hint}>
          The saved assignments. Changes in the event show here after saving it and reloading this page.
        </p>
      )}

      {editorData.error ? (
        <p className={styles.error}>Couldn&apos;t load the event&apos;s players: {editorData.error}</p>
      ) : !ours ? (
        <p>Loading the assignments...</p>
      ) : (
        LEGIONS.map(({ key, resultKey, title }) => (
          <section key={key} className={styles.legion}>
            <h2 className={styles.legionTitle}>{formatLegionTitle(title, schedules[resultKey])}</h2>
            <div className={styles.buildingGrid}>
              {BUILDINGS.map((building) => {
                const list = buildingPlayers(ours[key], building);
                return (
                  <article key={building} className={styles.building}>
                    <h3 className={styles.buildingTitle}>
                      {building}
                      <PlayerCount players={list} power={powerOf} />
                    </h3>
                    {list.length === 0 ? (
                      <p className={styles.muted}>None</p>
                    ) : (
                      <ol className={styles.playerList}>
                        {list.map((p, i) => (
                          <li key={p.id} className={i === 0 && building !== UNDERCELLARS ? styles.leader : undefined}>
                            <span className={styles.playerName}>{p.name}</span>
                            <span className={styles.playerPower} title={formatNumbers(powerOf(p))}>
                              {formatCompactPower(powerOf(p))}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>
                );
              })}
              <article className={`${styles.building} ${styles.substitutes}`}>
                <h3 className={styles.buildingTitle}>
                  Substitutes
                  <PlayerCount players={ours[key].substitutes} power={powerOf} />
                </h3>
                {ours[key].substitutes.length === 0 ? (
                  <p className={styles.muted}>None</p>
                ) : (
                  <ol className={styles.playerList}>
                    {ours[key].substitutes.map((p) => (
                      <li key={p.id}>
                        <span className={styles.playerName}>{p.name}</span>
                        <span className={styles.playerPower} title={formatNumbers(powerOf(p))}>
                          {formatCompactPower(powerOf(p))}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            </div>
          </section>
        ))
      )}

      <section className={styles.opponents}>
        <EventOpponents
          eventId={event.id!}
          eventType="swordland"
          ownAllianceId={alliance.id}
          readOnly={event.status === "completed" || !canEdit}
          onChange={setOpponents}
        />
        <div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setShowSimulation((v) => !v)}
            disabled={!ours || !opponents || opponents.opponents.length === 0}
            title={opponents?.opponents.length === 0 ? "Add an opponent first" : undefined}
          >
            {showSimulation ? "Hide the simulation" : "Simulate opponents' assignments"}
          </button>
        </div>
      </section>

      {showSimulation && ours && predictions && (
        <section className={styles.simulation}>
          <h2 className={styles.sectionTitle}>Predicted Assignments</h2>
          <p className={styles.hint}>
            A guess: the opponent&apos;s strongest players by power, as many as they registered, then their
            substitutes, placed on the buildings the same way as ours. Their Swordland power isn&apos;t known, so both
            sides are compared by power; the stronger side of each building is highlighted.
          </p>
          {LEGIONS.map(({ key, resultKey, title }) => {
            const prediction = predictions[key];
            return (
              <div key={key} className={styles.legion}>
                <h3 className={styles.legionTitle}>
                  {formatLegionTitle(title, schedules[resultKey])}
                  {prediction && (
                    <span className={styles.versus}>
                      vs {prediction.opponentLabel} #{prediction.kingdomId}
                    </span>
                  )}
                </h3>
                {!prediction ? (
                  <p className={styles.muted}>No opponent for this legion.</p>
                ) : !prediction.data ? (
                  <p className={styles.muted}>{prediction.note}</p>
                ) : (
                  <>
                    {prediction.note && <p className={styles.warning}>{prediction.note}</p>}
                    <div className={styles.matchGrid}>
                      {[...BUILDINGS, "Substitutes"].map((building) => {
                        const isSubs = building === "Substitutes";
                        const left = isSubs ? ours[key].substitutes : buildingPlayers(ours[key], building);
                        const right = isSubs
                          ? prediction.data!.substitutes
                          : buildingPlayers(prediction.data!, building);
                        return (
                          <Matchup
                            key={building}
                            title={building}
                            left={left}
                            right={right}
                            power={totalPower}
                            markLeader={!isSubs && building !== UNDERCELLARS}
                            scroll={isSubs}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>,
  );
}

/** One building: our players on the left, theirs on the right */
function Matchup({
  title,
  left,
  right,
  power,
  markLeader,
  scroll = false,
}: {
  title: string;
  left: Player[];
  right: Player[];
  power: (p: Player) => number;
  markLeader: boolean;
  /** Long lists (substitutes) scroll inside a shorter box */
  scroll?: boolean;
}) {
  const leftTotal = left.reduce((sum, p) => sum + power(p), 0);
  const rightTotal = right.reduce((sum, p) => sum + power(p), 0);
  const side = (list: Player[], align: "left" | "right") => (
    <ol className={`${styles.matchSide} ${align === "right" ? styles.matchRight : ""}`}>
      {list.length === 0 ? (
        <li className={styles.muted}>None</li>
      ) : (
        list.map((p, i) => (
          <li key={p.id} className={markLeader && i === 0 ? styles.leader : undefined}>
            <span className={styles.playerName}>{p.name}</span>
            <span className={styles.playerPower} title={formatNumbers(power(p))}>
              {formatCompactPower(power(p))}
            </span>
          </li>
        ))
      )}
    </ol>
  );

  return (
    <article className={styles.match}>
      <h4 className={styles.matchTitle}>
        <span className={leftTotal >= rightTotal ? styles.stronger : undefined}>{formatCompactPower(leftTotal)}</span>
        <span>{title}</span>
        <span className={rightTotal > leftTotal ? styles.stronger : undefined}>{formatCompactPower(rightTotal)}</span>
      </h4>
      <div className={`${styles.matchBody} ${scroll ? styles.scrollBox : ""}`}>
        {side(left, "left")}
        <span className={styles.vs} aria-label="versus">
          vs
        </span>
        {side(right, "right")}
      </div>
    </article>
  );
}

/** "5 (1.2B)": the number of players and their total power */
function PlayerCount({ players, power }: { players: Player[]; power: (p: Player) => number }) {
  const total = players.reduce((sum, p) => sum + power(p), 0);
  return (
    <span className={styles.buildingCount} title={`${players.length} players · ${formatNumbers(total)} total power`}>
      {players.length} ({formatCompactPower(total)})
    </span>
  );
}
