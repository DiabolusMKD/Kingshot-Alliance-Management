"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alliance, EventType, Player } from "@/types";
import Navigation from "@/components/Navigation";
import Breadcrumbs, { Crumb } from "@/components/Breadcrumbs";
import ZoomableImage from "@/components/ZoomableImage";
import PlayerStatsChart, { ChartPoint } from "@/components/PlayerStatsChart";
import { getPlayerById, getPlayerByPlayerId } from "@/utils/playerService";
import { getAllianceById } from "@/utils/allianceService";
import { getAllianceSlug } from "@/utils/allianceSlug";
import { formatAllianceLabel } from "@/utils/allianceLabel";
import { formatPower } from "@/utils/formatNumbers";
import { isImageUrl, truncateLevelLabel } from "@/utils/isImageUrl";
import {
  EVENT_TYPE_LABELS,
  PlayerEventEntry,
  getPlayerEventHistory,
  summarizeEntries,
} from "@/utils/playerHistory";
import styles from "./page.module.css";

interface PlayerPageProps {
  params: Promise<{ kingdomId: string; playerId: string }>;
}

const EVENT_TYPES: EventType[] = ["swordland", "tri-alliance"];

// Same colors as the events list
const STATUS_STYLES: Record<string, string> = {
  "not-started": styles.statusNotStarted,
  ongoing: styles.statusOngoing,
  completed: styles.statusCompleted,
};

const RESULT_LABELS: Record<string, string> = { win: "Win", lose: "Lose" };
const formatResult = (result: string) => RESULT_LABELS[result] ?? result;

const formatDate = (iso: string | null, options: Intl.DateTimeFormatOptions) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...options }) : "—";

/** Swordland's power chart: which power it shows */
type SwordlandPowerView = "swordland" | "power";
const SWORDLAND_POWER_VIEWS: { value: SwordlandPowerView; label: string; title: string }[] = [
  { value: "swordland", label: "Swordland power", title: "Swordland power at the event" },
  { value: "power", label: "Total power", title: "Total power at the event" },
];

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={styles.statTile}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </div>
  );
}

function EventTypeSection({ type, entries }: { type: EventType; entries: PlayerEventEntry[] }) {
  const [powerView, setPowerView] = useState<SwordlandPowerView>("swordland");
  const ofType = entries.filter((e) => e.type === type);
  const summary = summarizeEntries(type, entries);
  const title = EVENT_TYPE_LABELS[type];

  if (ofType.length === 0) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.empty}>No {title} events yet.</p>
      </section>
    );
  }

  const shortDate = (e: PlayerEventEntry) => formatDate(e.startsAt, { month: "short", day: "numeric" });
  const legionLabel = (e: PlayerEventEntry) => `Legion ${e.legion === "legion_1" ? 1 : 2}`;

  // Points: completed events only; missed ones (score 0) are drawn hollow on the baseline
  const pointsData: ChartPoint[] = ofType
    .filter((e) => e.status === "completed")
    .map((e) => ({
      id: e.allianceEventId,
      label: shortDate(e),
      value: e.points ?? 0,
      tone: !e.attended ? "missed" : e.isMvp ? "highlight" : "normal",
      details: [
        formatDate(e.startsAt, { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
        `${legionLabel(e)}${e.isSubstitute ? " · substitute" : ""}`,
        ...(e.result ? [`Result: ${formatResult(e.result)}`] : []),
        ...(e.isMvp ? ["MVP"] : []),
        ...(!e.attended ? ["Didn't show up (no score)"] : []),
      ],
    }));

  // Swordland: the selected power; Tri Alliance: the power saved with the event
  const powerOf = (e: PlayerEventEntry) =>
    type === "swordland" ? (powerView === "power" ? e.totalPower : e.swordlandPower) : e.power;
  const powerTitle =
    type === "swordland"
      ? SWORDLAND_POWER_VIEWS.find((v) => v.value === powerView)!.title
      : "Tri Alliance power at the event";

  const powerData: ChartPoint[] = ofType
    .filter((e) => powerOf(e) !== null)
    .map((e) => ({
      id: e.allianceEventId,
      label: shortDate(e),
      value: powerOf(e) ?? 0,
      details: [formatDate(e.startsAt, { weekday: "short", month: "short", day: "numeric", year: "numeric" })],
    }));

  const resultsText = Object.entries(summary.results)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([result, count]) => `${count} ${formatResult(result)}`)
    .join(" · ");

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>

      <div className={styles.stats}>
        <StatTile label="Events" value={String(summary.assigned)} hint={`${summary.completed} completed`} />
        <StatTile
          label="Showed up"
          value={summary.attendanceRate === null ? "—" : `${Math.round(summary.attendanceRate * 100)}%`}
          hint={`${summary.attended} of ${summary.completed} completed`}
        />
        <StatTile label="Total points" value={formatPower(summary.totalPoints)} />
        <StatTile
          label="Average points"
          value={summary.averagePoints === null ? "—" : formatPower(Math.round(summary.averagePoints))}
          hint={summary.bestPoints === null ? undefined : `Best ${formatPower(summary.bestPoints)}`}
        />
        <StatTile label="Results" value={resultsText || "—"} />
        <StatTile label="MVP" value={String(summary.mvps)} hint={`${summary.substitute} as substitute`} />
      </div>

      <div className={styles.charts}>
        <PlayerStatsChart
          title="Points per event"
          points={pointsData}
          formatValue={(v) => `${formatPower(v)} points`}
          emptyMessage="No completed events yet."
        />
        <PlayerStatsChart
          title={powerTitle}
          points={powerData}
          formatValue={formatPower}
          emptyMessage="No power saved with these events."
          controls={
            type === "swordland" && (
              <select
                className={styles.chartSelect}
                value={powerView}
                onChange={(e) => setPowerView(e.target.value as SwordlandPowerView)}
                aria-label="Power shown in the chart"
              >
                {SWORDLAND_POWER_VIEWS.map((view) => (
                  <option key={view.value} value={view.value}>
                    {view.label}
                  </option>
                ))}
              </select>
            )
          }
        />
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Alliance</th>
              <th>Legion</th>
              <th>Position</th>
              <th>Status</th>
              <th>Result</th>
              <th className={styles.numeric}>Points</th>
              <th>Showed up</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...ofType].reverse().map((e) => (
              <tr key={e.allianceEventId}>
                <td>{formatDate(e.startsAt, { month: "short", day: "numeric", year: "numeric" })}</td>
                <td>
                  {e.alliance ? formatAllianceLabel(e.alliance) : "—"}
                  {e.isSsl && <span className={styles.badge}>SSL</span>}
                  {/* Playing for another alliance than the host (SSL guest) */}
                  {e.playerAlliance && e.alliance && e.playerAlliance.id !== e.alliance.id && (
                    <span className={styles.muted}> · as {formatAllianceLabel(e.playerAlliance)}</span>
                  )}
                </td>
                <td>
                  {legionLabel(e)}
                  {e.schedule.time && <span className={styles.muted}> · {e.schedule.time} UTC</span>}
                  {e.isSubstitute && <span className={styles.badge}>sub</span>}
                </td>
                <td>
                  {e.position ?? "—"}
                  {e.positionRole && <span className={styles.muted}> · {e.positionRole}</span>}
                </td>
                <td>
                  <span className={`${styles.status} ${STATUS_STYLES[e.status] ?? ""}`}>
                    {e.status.replace("-", " ")}
                  </span>
                </td>
                <td>
                  {e.result ? formatResult(e.result) : "—"}
                  {e.isMvp && <span className={styles.mvpBadge}>MVP</span>}
                </td>
                <td className={styles.numeric}>{e.points === null ? "—" : formatPower(e.points)}</td>
                <td>{e.attended === null ? "—" : e.attended ? "Yes" : "No"}</td>
                <td>
                  {e.href && (
                    <Link href={e.href} className={styles.link}>
                      Open
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PlayerPage({ params }: PlayerPageProps) {
  const { kingdomId, playerId } = use(params);

  // undefined = loading, null = not found
  const [player, setPlayer] = useState<Player | null | undefined>(undefined);
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [entries, setEntries] = useState<PlayerEventEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        // In-game id in the URL; the database id also works
        const id = decodeURIComponent(playerId);
        const found = (await getPlayerByPlayerId(id)) ?? (id.includes("-") ? await getPlayerById(id) : null);
        if (!isMounted) return;
        setPlayer(found);
        if (!found) return;

        const [ownAlliance, history] = await Promise.all([
          found.allianceId ? getAllianceById(Number(found.allianceId)).catch(() => null) : null,
          getPlayerEventHistory(found.id),
        ]);
        if (!isMounted) return;
        setAlliance(ownAlliance);
        setEntries(history);
      } catch (err) {
        console.error("Failed to load player:", err);
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load player");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [playerId]);

  const crumbs = useMemo<Crumb[]>(() => {
    const trail: Crumb[] = [{ label: `Kingdom ${kingdomId}`, href: `/${kingdomId}` }];
    if (alliance) {
      const base = `/${alliance.kingdomId}/${getAllianceSlug(alliance.id)}`;
      trail.push({ label: formatAllianceLabel(alliance), href: base }, { label: "Players", href: `${base}/players` });
    }
    trail.push({ label: player?.name ?? "Player" });
    return trail;
  }, [kingdomId, alliance, player]);

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <div className={styles.container}>
          <Breadcrumbs items={crumbs} />

          {error ? (
            <p className={styles.error}>{error}</p>
          ) : player === undefined ? (
            <p className={styles.empty}>Loading...</p>
          ) : player === null ? (
            <p className={styles.empty}>Player not found.</p>
          ) : (
            <>
              <header className={styles.profile}>
                <div className={styles.identity}>
                  {player.profilePhoto ? (
                    <ZoomableImage
                      src={player.profilePhoto}
                      alt={player.name}
                      width={80}
                      height={80}
                      className={styles.photo}
                    />
                  ) : (
                    <div className={styles.photoPlaceholder} aria-hidden="true">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {player.levelImage && (
                    <div className={styles.level} title="Level">
                      {isImageUrl(player.levelImage) ? (
                        <ZoomableImage src={player.levelImage} alt={`${player.name} level`} width={48} height={48} />
                      ) : (
                        <span>{truncateLevelLabel(player.levelImage)}</span>
                      )}
                    </div>
                  )}
                  <div>
                    <h1 className={styles.name}>{player.name}</h1>
                    {player.aliasName && <p className={styles.alias}>{player.aliasName}</p>}
                    <p className={styles.meta}>
                      ID {player.playerId} · Kingdom {player.kingdomId}
                      {alliance ? ` · ${formatAllianceLabel(alliance)}` : " · No alliance"}
                    </p>
                  </div>
                </div>

                <div className={styles.powers}>
                  <StatTile label="Power" value={formatPower(player.power)} />
                  <StatTile label="Swordland power" value={formatPower(player.swordlandPower)} />
                  <StatTile label="Tri Alliance power" value={formatPower(player.trialliancePower)} />
                </div>
              </header>

              {EVENT_TYPES.map((type) => (
                <EventTypeSection key={type} type={type} entries={entries} />
              ))}
            </>
          )}
        </div>
      </main>
    </>
  );
}
