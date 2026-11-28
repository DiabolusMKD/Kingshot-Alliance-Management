"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alliance, AllianceEvent, LegionResultKey, Player } from "@/types";
import Navigation from "@/components/Navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import EventOpponents, { OpponentsState } from "@/components/EventOpponents";
import { useEventEditorData } from "@/components/useEventEditorData";
import { getPlayers } from "@/utils/playerService";
import { getAlliancesByKingdomId } from "@/utils/allianceService";
import { findAllianceBySlug } from "@/utils/allianceSlug";
import { findEventBySlug } from "@/utils/eventSlug";
import { getAllianceEvents } from "@/utils/eventService";
import { formatEventDateTimeUtc, formatLegionTitle, getLegionSchedules } from "@/utils/legionSchedule";
import {
  Placements,
  TEAM_LABELS,
  Team,
  byTriPower,
  savedOrGeneratedTeams,
  splitLegion,
  teamPlayers,
  triPower,
} from "@/utils/triAllianceTeams";
import {
  SIDE_TEAMS,
  TRI_COLOR_HEX,
  TRI_COLOR_LABELS,
  TriColor,
  TriSide,
  legionSides,
  resolveColors,
  sideFacing,
} from "@/utils/triAllianceColors";
import { formatAllianceLabel } from "@/utils/allianceLabel";
import { formatCompactPower, formatNumbers } from "@/utils/formatNumbers";
import { MAX_LEGION_PLAYERS, MAX_LEGION_SUBSTITUTES } from "@/utils/constants";
import { useCanEdit } from "@/components/EditMode";
import styles from "@/components/EventAssignments.module.css";

const EVENT_ID = 2; // Tri-Alliance

type TriLegion = "legion1" | "legion2";

const LEGIONS: { key: TriLegion; substitutes: string; resultKey: LegionResultKey; title: string }[] = [
  { key: "legion1", substitutes: "substituteLegion1", resultKey: "legion_1", title: "Legion 1" },
  { key: "legion2", substitutes: "substituteLegion2", resultKey: "legion_2", title: "Legion 2" },
];

interface PageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
  searchParams: Promise<{ event?: string | string[] }>;
}

interface LegionTeams {
  teams: Team[];
  substitutes: Player[];
}

/** An opponent's predicted teams, or why there are none */
interface Prediction {
  opponentId: number;
  /** Set, or the only color left */
  color: TriColor | null;
  opponentLabel: string;
  kingdomId: number;
  data: LegionTeams | null;
  note?: string;
}

const sortedTeam = (team: Team): Team => ({
  offense: [...team.offense].sort(byTriPower),
  support: [...team.support].sort(byTriPower),
});

/**
 * The event's saved teams on one page (opened in a new tab from the event, shareable), its opponents
 * and, once opponents are added, a simulation of their teams next to ours.
 */
export default function TriAllianceAssignmentsPage({ params, searchParams }: PageProps) {
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
  const schedules = getLegionSchedules(event ?? null);

  // Our teams, as saved (generated like the editor when a player has no saved team)
  const ours = useMemo(() => {
    if (!editorData.ready || !editorData.assignments) return null;
    const pool = new Map(
      [...editorData.players, ...(editorData.extraPlayers ?? [])].map((p) => [String(p.id), p]),
    );
    const placements: Placements = new Map(
      editorData.assignments.map((a) => [String(a.playerId), { position: a.position, positionRole: a.positionRole }]),
    );
    const inLegion = (legion: string) =>
      editorData
        .assignments!.filter((a) => a.legion === legion)
        .map((a) => pool.get(String(a.playerId)))
        .filter((p): p is Player => !!p);

    return Object.fromEntries(
      LEGIONS.map(({ key, substitutes }) => [
        key,
        {
          teams: savedOrGeneratedTeams(inLegion(key), placements).map(sortedTeam),
          substitutes: inLegion(substitutes).sort(byTriPower),
        },
      ]),
    ) as Record<TriLegion, LegionTeams>;
  }, [editorData.ready, editorData.assignments, editorData.players, editorData.extraPlayers]);

  // The opponents' teams: their strongest registered players (by power), split like ours
  const predictions = useMemo(() => {
    if (!opponents) return null;
    return Object.fromEntries(
      LEGIONS.map(({ key, resultKey }) => [
        key,
        opponents.opponents
          .filter((o) => o.legion === resultKey)
          .map((opponent, index, legionOpponents): Prediction => {
            const color = resolveColors(
              opponents.ownColors[resultKey],
              legionOpponents.map((o) => o.color ?? null),
            ).opponents[index];
            const opponentAlliance =
              opponent.allianceId != null ? opponents.alliances.get(Number(opponent.allianceId)) : undefined;
            const label = opponentAlliance ? formatAllianceLabel(opponentAlliance) : `[${opponent.allianceTag}]`;
            const base = { opponentId: opponent.id, color, opponentLabel: label, kingdomId: opponent.kingdomId };
            const roster =
              opponent.allianceId != null ? opponents.players.get(Number(opponent.allianceId)) ?? [] : [];
            if (roster.length === 0) return { ...base, data: null, note: "No players of this alliance in the app." };

            const sorted = [...roster].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
            const combatantCount = Math.min(opponent.registeredCombatants, MAX_LEGION_PLAYERS);
            const substituteCount = Math.min(opponent.registeredSubstitutes ?? 0, MAX_LEGION_SUBSTITUTES);
            const combatants = sorted.slice(0, combatantCount);
            const substitutes = sorted.slice(combatantCount, combatantCount + substituteCount);
            const missing = combatantCount + substituteCount - combatants.length - substitutes.length;
            return {
              ...base,
              data: { teams: splitLegion(combatants, (p) => p.power ?? 0), substitutes },
              note:
                missing > 0
                  ? `Registered ${combatantCount} + ${substituteCount} substitutes, but only ${roster.length} players are in the app.`
                  : undefined,
            };
          }),
      ]),
    ) as Record<TriLegion, Prediction[]>;
  }, [opponents]);

  const hasOpponents = (opponents?.opponents.length ?? 0) > 0;

  // Our color in each legion (set, or the only one left) and who each of our sides fights
  const sides = useMemo(() => {
    if (!opponents) return null;
    return Object.fromEntries(
      LEGIONS.map(({ key, resultKey }) => {
        const legionOpponents = opponents.opponents.filter((o) => o.legion === resultKey);
        return [key, legionSides(opponents.ownColors[resultKey], legionOpponents)];
      }),
    ) as Record<TriLegion, ReturnType<typeof legionSides>>;
  }, [opponents]);
  // The simulation compares by power on both sides: the opponents' tri-alliance power isn't known
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

  const editorHref = `/${kingdomId}/${allianceSlug}/events/tri-alliance?event=${eventSlug}`;

  const playerItems = (list: Player[], power: (p: Player) => number, marked = 0) =>
    list.map((p, i) => (
      <li key={p.id} className={i < marked ? styles.leader : undefined}>
        <span className={styles.playerName}>{p.name}</span>
        <span className={styles.playerPower} title={formatNumbers(power(p))}>
          {formatCompactPower(power(p))}
        </span>
      </li>
    ));

  return renderShell(
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Tri-Alliance Assignments</h1>
          <p className={styles.subtitle}>
            {formatAllianceLabel(alliance)} · {formatEventDateTimeUtc(event.startsAt) ?? "No date set"} · by
            Tri-Alliance Power
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
            <h2 className={styles.legionTitle}>
              {formatLegionTitle(title, schedules[resultKey])}
              {sides?.[key].own && (
                <span className={styles.versus}>
                  We are <ColorName color={sides[key].own!} />
                </span>
              )}
            </h2>
            <div className={styles.buildingGrid}>
              {ours[key].teams.map((team, index) => (
                <article key={TEAM_LABELS[index]} className={styles.building}>
                  <h3 className={styles.buildingTitle}>
                    {TEAM_LABELS[index]}
                    <PlayerCount players={teamPlayers(team)} power={triPower} />
                  </h3>
                  {(() => {
                    const facing = sides?.[key][index < 2 ? "right" : "left"];
                    return facing ? (
                      <p className={styles.facingLine}>
                        vs <ColorName color={facing.color} />
                        {facing.tag && ` [${facing.tag}]`} {index < 2 ? "left" : "right"} side
                      </p>
                    ) : null;
                  })()}
                  <p className={styles.roleLabel}>Offense</p>
                  {team.offense.length === 0 ? (
                    <p className={styles.muted}>None</p>
                  ) : (
                    <ol className={styles.playerList}>{playerItems(team.offense, triPower, team.offense.length)}</ol>
                  )}
                  <p className={styles.roleLabel}>Support</p>
                  {team.support.length === 0 ? (
                    <p className={styles.muted}>None</p>
                  ) : (
                    <ol className={styles.playerList}>{playerItems(team.support, triPower)}</ol>
                  )}
                </article>
              ))}
              <article className={`${styles.building} ${styles.substitutes}`}>
                <h3 className={styles.buildingTitle}>
                  Substitutes
                  <PlayerCount players={ours[key].substitutes} power={triPower} />
                </h3>
                {ours[key].substitutes.length === 0 ? (
                  <p className={styles.muted}>None</p>
                ) : (
                  <ol className={styles.playerList}>{playerItems(ours[key].substitutes, triPower)}</ol>
                )}
              </article>
            </div>
          </section>
        ))
      )}

      <section className={styles.opponents}>
        <EventOpponents
          eventId={event.id!}
          eventType="tri-alliance"
          ownAllianceId={alliance.id}
          readOnly={event.status === "completed" || !canEdit}
          onChange={setOpponents}
        />
        {/* Only once there's someone to simulate */}
        {hasOpponents && (
          <div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setShowSimulation((v) => !v)}
              disabled={!ours}
            >
              {showSimulation ? "Hide the simulation" : "Simulate opponents' assignments"}
            </button>
          </div>
        )}
      </section>

      {showSimulation && hasOpponents && ours && predictions && (
        <section className={styles.simulation}>
          <h2 className={styles.sectionTitle}>Predicted Assignments</h2>
          <p className={styles.hint}>
            A guess: each opponent&apos;s strongest players by power, as many as they registered, then their
            substitutes, split into the teams the same way as ours. Their tri-alliance power isn&apos;t known, so both
            sides are compared by power; the stronger side of each team is highlighted. Once the matchmaking is done
            and the colors are set (ours too), each side is matched with the side it fights: Blue is on Yellow&apos;s
            right, Red on Blue&apos;s right and Yellow on Red&apos;s right.
          </p>
          {LEGIONS.map(({ key, resultKey, title }) => (
            <div key={key} className={styles.legion}>
              <h3 className={styles.legionTitle}>{formatLegionTitle(title, schedules[resultKey])}</h3>
              {predictions[key].length === 0 ? (
                <p className={styles.muted}>No opponents for this legion.</p>
              ) : (
                predictions[key].map((prediction) => (
                  <div key={prediction.opponentId} className={styles.opponentBlock}>
                    <h4 className={styles.opponentTitle}>
                      vs {prediction.color && <ColorName color={prediction.color} />} {prediction.opponentLabel} #
                      {prediction.kingdomId}
                      {(() => {
                        const side = sideFacing(sides?.[key].own ?? null, prediction.color);
                        return side ? (
                          <span className={styles.sideHint}>
                            our {side} side (Team {side === "right" ? "1 + 2" : "3 + 4"}) vs their{" "}
                            {side === "right" ? "left" : "right"} side
                          </span>
                        ) : (
                          <span className={styles.sideHint}>set the colors to see which sides fight</span>
                        );
                      })()}
                    </h4>
                    {!prediction.data ? (
                      <p className={styles.muted}>{prediction.note}</p>
                    ) : (
                      <>
                        {prediction.note && <p className={styles.warning}>{prediction.note}</p>}
                        <div className={styles.matchGrid}>
                          {(() => {
                            const side = sideFacing(sides?.[key].own ?? null, prediction.color);
                            // Colors known: our side against the side of theirs it faces
                            if (side) {
                              const theirSide: TriSide = side === "right" ? "left" : "right";
                              return SIDE_TEAMS[side].map((ourIndex, i) => {
                                const theirIndex = SIDE_TEAMS[theirSide][i];
                                return (
                                  <Matchup
                                    key={TEAM_LABELS[ourIndex]}
                                    title={`${TEAM_LABELS[ourIndex]} vs their ${TEAM_LABELS[theirIndex]}`}
                                    left={ours[key].teams[ourIndex]}
                                    right={prediction.data!.teams[theirIndex]}
                                    power={totalPower}
                                  />
                                );
                              });
                            }
                            return ours[key].teams.map((team, index) => (
                              <Matchup
                                key={TEAM_LABELS[index]}
                                title={TEAM_LABELS[index]}
                                left={team}
                                right={prediction.data!.teams[index]}
                                power={totalPower}
                              />
                            ));
                          })()}
                          <Matchup
                            title="Substitutes"
                            left={{ offense: [], support: ours[key].substitutes }}
                            right={{ offense: [], support: prediction.data.substitutes }}
                            power={totalPower}
                            scroll
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </section>
      )}
    </>,
  );
}

function ColorName({ color }: { color: TriColor }) {
  return (
    <span className={styles.colorName} style={{ "--swatch": TRI_COLOR_HEX[color] } as React.CSSProperties}>
      {TRI_COLOR_LABELS[color]}
    </span>
  );
}

/** One team: our players on the left, theirs on the right (offense marked) */
function Matchup({
  title,
  left,
  right,
  power,
  scroll = false,
}: {
  title: string;
  left: Team;
  right: Team;
  power: (p: Player) => number;
  /** Long lists (substitutes) scroll inside a shorter box */
  scroll?: boolean;
}) {
  const sum = (team: Team) => teamPlayers(team).reduce((total, p) => total + power(p), 0);
  const leftTotal = sum(left);
  const rightTotal = sum(right);
  const side = (team: Team, align: "left" | "right") => {
    const list = teamPlayers(team);
    return (
      <ol className={`${styles.matchSide} ${align === "right" ? styles.matchRight : ""}`}>
        {list.length === 0 ? (
          <li className={styles.muted}>None</li>
        ) : (
          list.map((p, i) => (
            <li key={p.id} className={i < team.offense.length ? styles.leader : undefined}>
              <span className={styles.playerName}>{p.name}</span>
              <span className={styles.playerPower} title={formatNumbers(power(p))}>
                {formatCompactPower(power(p))}
              </span>
            </li>
          ))
        )}
      </ol>
    );
  };

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
