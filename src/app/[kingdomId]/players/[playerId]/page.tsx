"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alliance, EventType, Player } from "@/types";
import Navigation from "@/components/Navigation";
import Breadcrumbs, { Crumb } from "@/components/Breadcrumbs";
import ZoomableImage from "@/components/ZoomableImage";
import PlayerStatsChart, { ChartPoint } from "@/components/PlayerStatsChart";
import Dialog from "@/components/Dialog";
import PlayerForm, { PlayerFormSubmitMeta } from "@/components/PlayerForm";
import { useToast } from "@/components/Toast";
import { getPlayerById, getPlayerByPlayerId, updatePlayer } from "@/utils/playerService";
import { getAllianceById, getAlliancesByKingdomId } from "@/utils/allianceService";
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

// Tri Alliance places: gold, silver, bronze
const PLACE_COLORS: Record<string, string> = { "1st": "#f5c542", "2nd": "#c0c7d1", "3rd": "#cd7f32" };

/** Trophy; Tri Alliance shows the place number in the cup */
function TrophyIcon({ color, place }: { color: string; place?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className={styles.resultIcon}>
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
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className={styles.resultIcon}>
      <path d="M5 21V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 4h12l-2.5 4 2.5 4H5z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

/** Result with its icon: Win trophy / Lose flag, Tri Alliance place trophy */
function ResultLabel({ result }: { result: string }) {
  const place = PLACE_COLORS[result] ? result.replace(/\D/g, "") : null;
  return (
    <span className={`${styles.result} ${result === "lose" ? styles.resultLose : ""}`}>
      {result === "win" && <TrophyIcon color={PLACE_COLORS["1st"]} />}
      {result === "lose" && <FlagIcon />}
      {place && <TrophyIcon color={PLACE_COLORS[result]} place={place} />}
      {formatResult(result)}
    </span>
  );
}

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
        ...e.mvpLabels,
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
                  {e.isSsl && (
                    <span className={styles.sslBadge} title="Swordland Summit League">
                      SSL
                    </span>
                  )}
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
                  {e.result ? <ResultLabel result={e.result} /> : "—"}
                  {e.mvpLabels.map((label) => (
                    <span key={label} className={styles.mvpBadge}>
                      {label}
                    </span>
                  ))}
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
  const [isEditOpen, setIsEditOpen] = useState(false);
  // Alliances of the player's kingdom, for the edit form (loaded when it opens)
  const [kingdomAlliances, setKingdomAlliances] = useState<Alliance[]>([]);
  const toast = useToast();

  const openEdit = async () => {
    if (!player) return;
    setIsEditOpen(true);
    try {
      setKingdomAlliances(await getAlliancesByKingdomId(player.kingdomId));
    } catch (err) {
      console.error("Failed to load the kingdom's alliances:", err);
    }
  };

  const handleEditSubmit = async (
    formData: Omit<Player, "id" | "created_at" | "updated_at">,
    _existingId?: string,
    meta?: PlayerFormSubmitMeta,
  ) => {
    if (!player) return;
    try {
      const updated = await updatePlayer(player.id, formData);
      const ownAlliance =
        meta?.createdAlliance ??
        (updated.allianceId ? await getAllianceById(Number(updated.allianceId)).catch(() => null) : null);
      setPlayer(updated);
      setAlliance(ownAlliance);
      setIsEditOpen(false);
      toast.success(`Updated ${updated.aliasName || updated.name}`);
    } catch (err) {
      console.error("Failed to update player:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update player");
    }
  };

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
                  <div className={styles.nameBlock}>
                    <h1 className={styles.name}>{player.name}</h1>
                    {player.aliasName && <p className={styles.alias}>{player.aliasName}</p>}
                    <p className={styles.meta}>
                      ID {player.playerId} · Kingdom {player.kingdomId}
                      {alliance ? ` · ${formatAllianceLabel(alliance)}` : " · No alliance"}
                    </p>
                  </div>
                </div>

                <div className={styles.powers}>
                  <button type="button" className={styles.editButton} onClick={openEdit} title="Edit player">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    Edit
                  </button>
                  <StatTile label="Power" value={formatPower(player.power)} />
                  <StatTile label="Swordland power" value={formatPower(player.swordlandPower)} />
                  <StatTile label="Tri Alliance power" value={formatPower(player.trialliancePower)} />
                  <StatTile label="Kills" value={player.kills != null ? formatPower(player.kills) : "—"} />
                </div>
              </header>

              {EVENT_TYPES.map((type) => (
                <EventTypeSection key={type} type={type} entries={entries} />
              ))}
            </>
          )}
        </div>
      </main>

      {player && (
        <Dialog isOpen={isEditOpen} title="Edit Player" onClose={() => setIsEditOpen(false)}>
          <PlayerForm
            player={player}
            kingdomId={player.kingdomId}
            allianceId={player.allianceId ? String(player.allianceId) : ""}
            alliances={kingdomAlliances}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditOpen(false)}
          />
        </Dialog>
      )}
    </>
  );
}
