"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alliance, EventOpponent, EventType, LegionResultKey, Player } from "@/types";
import { AllianceCooldownError, AllianceNotFoundError } from "@/utils/allianceImport";
import {
  OpponentLookupProgress,
  addEventOpponent,
  getAlliancePlayers,
  getAlliancesByIds,
  getEventOpponents,
  isMissingOpponentTable,
  lookupOpponentAlliance,
  newOpponent,
  removeEventOpponent,
  updateOpponentRegistration,
} from "@/utils/opponentService";
import {
  DEFAULT_REGISTERED_COMBATANTS,
  DEFAULT_REGISTERED_SUBSTITUTES,
  MAX_LEGION_SUBSTITUTES,
  OPPONENTS_PER_LEGION,
} from "@/utils/constants";
import { compareByRankThenPower, getRankOrder } from "@/utils/allianceRank";
import { getPlayerHref } from "@/utils/playerLinks";
import { formatAllianceLabel } from "@/utils/allianceLabel";
import { getAllianceSlug } from "@/utils/allianceSlug";
import { formatCompactPower, formatNumbers } from "@/utils/formatNumbers";
import { isImageUrl, truncateLevelLabel } from "@/utils/isImageUrl";
import ZoomableImage from "./ZoomableImage";
import Dialog from "./Dialog";
import { useToast } from "./Toast";
import styles from "./EventOpponents.module.css";

const LEGIONS: { key: LegionResultKey; title: string }[] = [
  { key: "legion_1", title: "Legion 1" },
  { key: "legion_2", title: "Legion 2" },
];

const MISSING_TABLE_MESSAGE =
  "Opponents need the event_opponent table. Run the event_opponent migration in Supabase first.";

const isValidTag = (tag: string) => [...tag].length === 3 && !/\s/.test(tag);

type Registration = Pick<EventOpponent, "registeredCombatants" | "registeredSubstitutes">;

const isValidCombatants = (value: number) => Number.isInteger(value) && value > 0;
/** 0 up to 20 substitutes */
const isValidSubstitutes = (value: number) => Number.isInteger(value) && value >= 0 && value <= MAX_LEGION_SUBSTITUTES;

interface EventOpponentsProps {
  eventId: number;
  eventType: EventType;
  /** The event's own alliance (can't be its own opponent) */
  ownAllianceId: number;
  /** Locked completed event: opponents are shown, not changed */
  readOnly?: boolean;
}

/**
 * Opponents of each legion (Swordland 1, Tri Alliance 2), looked up in the game by server +
 * tag. Changes are saved right away (opponents are usually known only after the matchmaking).
 */
export default function EventOpponents({ eventId, eventType, ownAllianceId, readOnly = false }: EventOpponentsProps) {
  const toast = useToast();
  const maxPerLegion = OPPONENTS_PER_LEGION[eventType];

  const [opponents, setOpponents] = useState<EventOpponent[]>([]);
  const [alliances, setAlliances] = useState<Map<number, Alliance>>(new Map());
  const [players, setPlayers] = useState<Map<number, Player[]>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await getEventOpponents(eventId);
        const ids = [...new Set(saved.map((o) => o.allianceId).filter((id): id is number => id != null))];
        const [allianceRows, playerLists] = await Promise.all([
          getAlliancesByIds(ids),
          Promise.all(ids.map((id) => getAlliancePlayers(id))),
        ]);
        if (!isMounted) return;
        setOpponents(saved);
        setAlliances(new Map(allianceRows.map((a) => [Number(a.id), a])));
        setPlayers(new Map(ids.map((id, i) => [id, playerLists[i]])));
        setLoadError(null);
      } catch (error) {
        console.error("Failed to load the opponents:", error);
        if (isMounted) {
          setLoadError(isMissingOpponentTable(error) ? MISSING_TABLE_MESSAGE : "Failed to load the opponents.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const handleAdded = (opponent: EventOpponent, alliance: Alliance, alliancePlayers: Player[]) => {
    setOpponents((prev) => [...prev, opponent]);
    setAlliances((prev) => new Map(prev).set(Number(alliance.id), alliance));
    setPlayers((prev) => new Map(prev).set(Number(alliance.id), alliancePlayers));
  };

  const handleRemove = async (opponent: EventOpponent) => {
    const label = `[${opponent.allianceTag}] (Server ${opponent.kingdomId})`;
    if (!confirm(`Remove ${label} from the opponents? The alliance and its players stay in the app.`)) return;
    try {
      await removeEventOpponent(opponent.id);
      setOpponents((prev) => prev.filter((o) => o.id !== opponent.id));
      toast.success(`${label} removed`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to remove the opponent");
    }
  };

  const handleRegistrationChange = async (opponent: EventOpponent, changes: Partial<Registration>) => {
    try {
      await updateOpponentRegistration(opponent.id, changes);
      setOpponents((prev) => prev.map((o) => (o.id === opponent.id ? { ...o, ...changes } : o)));
      toast.success("Saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save the opponent");
    }
  };

  return (
    <section className={styles.section} aria-labelledby="opponentsTitle">
      <div className={styles.sectionHeader}>
        <h2 id="opponentsTitle" className={styles.title}>
          Opponents
        </h2>
        <p className={styles.subtitle}>
          {maxPerLegion === 1 ? "1 opponent per legion" : `${maxPerLegion} opponents per legion`}. Enter the server and
          the alliance tag once the matchmaking is known: the alliance and its players are looked up in the game and
          saved right away.
        </p>
      </div>

      {isLoading ? (
        <p className={styles.muted}>Loading the opponents...</p>
      ) : loadError ? (
        <p className={styles.errorText}>{loadError}</p>
      ) : (
        <div className={styles.legions}>
          {LEGIONS.map((legion) => {
            const legionOpponents = opponents.filter((o) => o.legion === legion.key);
            const canAdd = !readOnly && legionOpponents.length < maxPerLegion;
            return (
              <div key={legion.key} className={styles.legion}>
                <h3 className={styles.legionTitle}>
                  {legion.title}
                  <span className={styles.count}>
                    {legionOpponents.length}/{maxPerLegion}
                  </span>
                </h3>

                {legionOpponents.map((opponent) => (
                  <OpponentCard
                    key={opponent.id}
                    opponent={opponent}
                    alliance={opponent.allianceId != null ? alliances.get(Number(opponent.allianceId)) : undefined}
                    players={opponent.allianceId != null ? players.get(Number(opponent.allianceId)) ?? [] : []}
                    readOnly={readOnly}
                    onRemove={() => handleRemove(opponent)}
                    onRegistrationChange={(changes) => handleRegistrationChange(opponent, changes)}
                  />
                ))}

                {legionOpponents.length === 0 && !canAdd && <p className={styles.muted}>No opponent.</p>}

                {canAdd && (
                  <AddOpponentForm
                    eventId={eventId}
                    legion={legion.key}
                    ownAllianceId={ownAllianceId}
                    takenAllianceIds={
                      new Set(legionOpponents.map((o) => o.allianceId).filter((id) => id != null).map(Number))
                    }
                    onAdded={handleAdded}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------- ADD ----------------

function AddOpponentForm({
  eventId,
  legion,
  ownAllianceId,
  takenAllianceIds,
  onAdded,
}: {
  eventId: number;
  legion: LegionResultKey;
  ownAllianceId: number;
  takenAllianceIds: Set<number>;
  onAdded: (opponent: EventOpponent, alliance: Alliance, players: Player[]) => void;
}) {
  const toast = useToast();
  const [server, setServer] = useState("");
  const [tag, setTag] = useState("");
  const [combatants, setCombatants] = useState(String(DEFAULT_REGISTERED_COMBATANTS));
  const [substitutes, setSubstitutes] = useState(String(DEFAULT_REGISTERED_SUBSTITUTES));
  const [progress, setProgress] = useState<OpponentLookupProgress | { kind: "checking" } | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  const serverNumber = Number(server);
  const combatantsNumber = Number(combatants);
  const substitutesNumber = Number(substitutes);
  const isBusy = progress !== null;
  const isValid =
    Number.isInteger(serverNumber) &&
    serverNumber > 0 &&
    isValidTag(tag) &&
    isValidCombatants(combatantsNumber) &&
    isValidSubstitutes(substitutesNumber);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isBusy) return;

    setError(null);
    setProgress({ kind: "checking" });
    try {
      const alliance = await lookupOpponentAlliance(serverNumber, tag, setProgress);
      const allianceId = Number(alliance.id);
      if (allianceId === Number(ownAllianceId)) {
        setError({ title: "That's your alliance", message: `[${tag}] is this event's own alliance.` });
        return;
      }
      if (takenAllianceIds.has(allianceId)) {
        setError({ title: "Already added", message: `[${tag}] is already an opponent of this legion.` });
        return;
      }
      const [opponent, alliancePlayers] = await Promise.all([
        addEventOpponent(newOpponent(eventId, legion, alliance, tag, combatantsNumber, substitutesNumber)),
        getAlliancePlayers(allianceId),
      ]);
      onAdded(opponent, alliance, alliancePlayers);
      toast.success(`${formatAllianceLabel(alliance)} added as opponent`);
    } catch (err) {
      console.error("Failed to add the opponent:", err);
      setError(
        err instanceof AllianceNotFoundError
          ? { title: `[${tag}] not found`, message: err.message }
          : err instanceof AllianceCooldownError
            ? { title: "Updated recently", message: err.message }
            : isMissingOpponentTable(err)
              ? { title: "Database not ready", message: MISSING_TABLE_MESSAGE }
              : { title: "Something went wrong", message: err instanceof Error ? err.message : "Failed to add the opponent" },
      );
    } finally {
      setProgress(null);
    }
  };

  const idPrefix = `opponent-${legion}`;

  return (
    <form className={styles.addForm} onSubmit={handleSubmit}>
      <div className={styles.addFields}>
        <label className={styles.field} htmlFor={`${idPrefix}-server`}>
          <span className={styles.fieldLabel}>Server</span>
          <input
            id={`${idPrefix}-server`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={server}
            onChange={(e) => {
              setServer(e.target.value);
              setError(null);
            }}
            className={styles.input}
            placeholder="1010"
            disabled={isBusy}
          />
        </label>
        <label className={styles.field} htmlFor={`${idPrefix}-tag`}>
          <span className={styles.fieldLabel}>Alliance tag</span>
          <input
            id={`${idPrefix}-tag`}
            type="text"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value.replace(/\s/g, ""));
              setError(null);
            }}
            className={`${styles.input} ${styles.tagInput}`}
            placeholder="fKn"
            maxLength={3}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={isBusy}
          />
        </label>
        <label className={styles.field} htmlFor={`${idPrefix}-combatants`}>
          <span className={styles.fieldLabel}>Registered combatants</span>
          <input
            id={`${idPrefix}-combatants`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={combatants}
            onChange={(e) => setCombatants(e.target.value)}
            className={styles.input}
            disabled={isBusy}
          />
        </label>
        <label className={styles.field} htmlFor={`${idPrefix}-substitutes`}>
          <span className={styles.fieldLabel}>Substitutes</span>
          <input
            id={`${idPrefix}-substitutes`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_LEGION_SUBSTITUTES}
            step={1}
            value={substitutes}
            onChange={(e) => setSubstitutes(e.target.value)}
            className={styles.input}
            disabled={isBusy}
            title={`0 - ${MAX_LEGION_SUBSTITUTES}`}
          />
        </label>
        <button type="submit" className={styles.addButton} disabled={!isValid || isBusy}>
          {isBusy ? "Looking up..." : "Find & add"}
        </button>
      </div>
      <small className={styles.hint}>
        The tag is case-sensitive: fKn, FKN and Fkn are different alliances. Substitutes: 0 - {MAX_LEGION_SUBSTITUTES}.
      </small>

      {progress && (
        <div className={styles.progress} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          {progress.kind === "saving"
            ? `Saving players ${progress.done} / ${progress.total}...`
            : progress.kind === "fetching"
              ? "Looking up the alliance in the game (this can take up to 30 seconds)..."
              : "Checking the alliance..."}
        </div>
      )}

      {error && (
        <div className={styles.error} role="alert">
          <strong>{error.title}</strong>
          <span>{error.message}</span>
        </div>
      )}
    </form>
  );
}

// ---------------- ONE OPPONENT ----------------

function OpponentCard({
  opponent,
  alliance,
  players,
  readOnly,
  onRemove,
  onRegistrationChange,
}: {
  opponent: EventOpponent;
  alliance?: Alliance;
  players: Player[];
  readOnly: boolean;
  onRemove: () => void;
  onRegistrationChange: (changes: Partial<Registration>) => void;
}) {
  const [combatants, setCombatants] = useState(String(opponent.registeredCombatants));
  const [substitutes, setSubstitutes] = useState(String(opponent.registeredSubstitutes ?? 0));
  const [showPlayers, setShowPlayers] = useState(false);

  // Saved on blur; an invalid value goes back to the saved one
  const save = (field: keyof Registration, raw: string, isValid: (value: number) => boolean, reset: () => void) => {
    const value = Number(raw);
    if (raw === "" || !isValid(value)) return reset();
    if (value !== opponent[field]) onRegistrationChange({ [field]: value });
  };

  const totalPower = players.reduce((sum, p) => sum + (p.power ?? 0), 0);
  const combatantsId = `opponent-${opponent.id}-combatants`;
  const substitutesId = `opponent-${opponent.id}-substitutes`;
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <h4 className={styles.cardTitle}>
          {alliance ? (
            <Link
              href={`/${alliance.kingdomId}/${getAllianceSlug(Number(alliance.id))}`}
              className={styles.dialogTitleLink}
              title="Open the alliance page"
            >
              {formatAllianceLabel(alliance)}
            </Link>
          ) : (
            `[${opponent.allianceTag}]`
          )}
        </h4>
        {!readOnly && (
          <button type="button" className={styles.removeButton} onClick={onRemove}>
            Remove
          </button>
        )}
      </header>

      {/* Game data + the registration (editable), all as tiles in one row */}
      <dl className={styles.meta}>
        <div className={styles.metaItem}>
          <dt>Server</dt>
          <dd>
            <Link href={`/${opponent.kingdomId}`} className={styles.serverLink} title={`Open Kingdom ${opponent.kingdomId}`}>
              #{opponent.kingdomId}
            </Link>
          </dd>
        </div>
        {alliance?.powerRank != null && (
          <div className={styles.metaItem}>
            <dt>Power rank</dt>
            <dd>#{alliance.powerRank}</dd>
          </div>
        )}
        <div className={styles.metaItem}>
          <dt>Members</dt>
          <dd>{players.length}</dd>
        </div>
        {totalPower > 0 && (
          <div className={styles.metaItem}>
            <dt>Power</dt>
            <dd title={formatNumbers(totalPower)}>{formatCompactPower(totalPower)}</dd>
          </div>
        )}
        <div className={styles.metaItem}>
          <dt>
            <label htmlFor={combatantsId}>Registered</label>
          </dt>
          <dd>
            <input
              id={combatantsId}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={combatants}
              onChange={(e) => setCombatants(e.target.value)}
              onBlur={() =>
                save("registeredCombatants", combatants, isValidCombatants, () =>
                  setCombatants(String(opponent.registeredCombatants)),
                )
              }
              onKeyDown={blurOnEnter}
              className={styles.metaInput}
              readOnly={readOnly}
              title="Registered combatants"
            />
          </dd>
        </div>
        <div className={styles.metaItem}>
          <dt>
            <label htmlFor={substitutesId}>Substitutes</label>
          </dt>
          <dd>
            <input
              id={substitutesId}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_LEGION_SUBSTITUTES}
              step={1}
              value={substitutes}
              onChange={(e) => setSubstitutes(e.target.value)}
              onBlur={() =>
                save("registeredSubstitutes", substitutes, isValidSubstitutes, () =>
                  setSubstitutes(String(opponent.registeredSubstitutes ?? 0)),
                )
              }
              onKeyDown={blurOnEnter}
              className={styles.metaInput}
              readOnly={readOnly}
              title={`Registered substitutes (0 - ${MAX_LEGION_SUBSTITUTES})`}
            />
          </dd>
        </div>
      </dl>

      {alliance ? (
        <>
          <div>
            <button type="button" className={styles.viewButton} onClick={() => setShowPlayers(true)}>
              View Opponents ({players.length})
            </button>
          </div>
          <Dialog
            isOpen={showPlayers}
            title={
              <span className={styles.dialogTitle}>
                <Link
                  href={`/${alliance.kingdomId}/${getAllianceSlug(Number(alliance.id))}`}
                  className={styles.dialogTitleLink}
                  title="Open the alliance page"
                >
                  {formatAllianceLabel(alliance)}
                </Link>
                <Link
                  href={`/${opponent.kingdomId}`}
                  className={`${styles.dialogTitleLink} ${styles.dialogServer}`}
                  title={`Open Kingdom ${opponent.kingdomId}`}
                >
                  #{opponent.kingdomId}
                </Link>
              </span>
            }
            onClose={() => setShowPlayers(false)}
            size="large"
          >
            {showPlayers && <OpponentPlayersTable players={players} />}
          </Dialog>
        </>
      ) : (
        <p className={styles.muted}>This alliance isn&apos;t in the app any more.</p>
      )}
    </article>
  );
}

// ---------------- PLAYERS OF AN OPPONENT ----------------

function OpponentPlayersTable({ players }: { players: Player[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => [...players].sort(compareByRankThenPower), [players]);
  const term = search.trim().toLowerCase();
  const filtered = term
    ? sorted.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.aliasName ?? "").toLowerCase().includes(term) ||
          String(p.playerId).includes(term),
      )
    : sorted;

  const open = (player: Player) => router.push(getPlayerHref(player));

  return (
    <div className={styles.players}>
      <div className={styles.searchWrapper}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or ID..."
          className={styles.searchInput}
          aria-label="Search the opponent's players"
        />
        <button
          type="button"
          className={styles.clearButton}
          onClick={() => setSearch("")}
          disabled={!search}
          title="Clear search"
          aria-label="Clear search"
        >
          ✕
        </button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Photo</th>
              <th>Name</th>
              <th>Rank</th>
              <th>Player ID</th>
              <th>Power</th>
              <th>Kills</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((player) => (
              <tr
                key={player.id}
                className={styles.clickableRow}
                onClick={(e) => {
                  // The name is a link already
                  if ((e.target as HTMLElement).closest("a")) return;
                  open(player);
                }}
              >
                <td>
                  <div className={styles.photoWrapper}>
                    {player.profilePhoto ? (
                      <ZoomableImage
                        src={player.profilePhoto}
                        alt={player.name}
                        className={styles.photo}
                        width={36}
                        height={36}
                      />
                    ) : (
                      <span className={styles.noPhoto} aria-hidden="true">
                        {player.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    {player.levelImage ? (
                      <span className={styles.levelBadge} title={player.level ? `TC ${player.level}` : "Level"}>
                        {isImageUrl(player.levelImage) ? (
                          <ZoomableImage src={player.levelImage} alt={`${player.name} level`} width={26} height={26} />
                        ) : (
                          <span>{truncateLevelLabel(player.levelImage)}</span>
                        )}
                      </span>
                    ) : player.level ? (
                      <span className={styles.levelBadge} title="TC level">
                        {player.level}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={styles.nameCell}>
                  <Link href={getPlayerHref(player)} className={styles.playerLink}>
                    {player.name}
                  </Link>
                </td>
                <td>
                  {player.allianceRank ? (
                    <span
                      className={`${styles.rankBadge} ${getRankOrder(player.allianceRank) <= 1 ? styles.rankHigh : ""}`}
                    >
                      {player.allianceRank}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{player.playerId}</td>
                <td>{formatNumbers(player.power)}</td>
                <td>{player.kills != null ? formatNumbers(player.kills) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className={styles.empty}>{search ? "No players match your search." : "No players."}</p>
        )}
      </div>
    </div>
  );
}
