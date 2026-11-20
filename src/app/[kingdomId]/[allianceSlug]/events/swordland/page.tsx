"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alliance, Player, AllianceEvent, EventStatus, EventVariant, SwordlandSeason } from "@/types";
import Navigation from "@/components/Navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import EventHero from "@/components/EventHero";
import SwordlandEventLayout from "@/components/SwordlandEventLayout";
import EventList from "@/components/EventList";
import EventOpponents, { OpponentsState } from "@/components/EventOpponents";
import { saveDraftOpponents } from "@/utils/opponentService";
import ReliabilityStats from "@/components/ReliabilityStats";
import SwordlandPowerDialog from "@/components/SwordlandPowerDialog";
import { useToast } from "@/components/Toast";
import { useEventEditorData } from "@/components/useEventEditorData";
import { getPlayers } from "@/utils/playerService";
import { getAlliancesByKingdomId } from "@/utils/allianceService";
import { findAllianceBySlug } from "@/utils/allianceSlug";
import { findEventBySlug, getEventSlug } from "@/utils/eventSlug";
import { EventSaveInput, saveEventData } from "@/utils/eventData";
import { getPowerMode } from "@/utils/powerMode";
import { formatEventDateTimeUtc, getLegionSchedules, isoToUtcInput, utcInputToIso } from "@/utils/legionSchedule";
import {
  getAllianceEvents,
  createAllianceEvent,
  updateAllianceEvent,
  deleteAllianceEvent,
} from "@/utils/eventService";
import {
  copyAssignmentsFromEvent,
  createSeason,
  deleteSeason,
  getLastSeasonEvent,
  getNextSeasonName,
  getNoShowIds,
  getSeasons,
} from "@/utils/seasonService";
import styles from "./page.module.css";

const EVENT_ID = 1; // Swordland event ID

interface SwordlandPageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
  searchParams: Promise<{ event?: string | string[] }>;
}

/** Season picker value for a season that is created with the event */
const NEW_SEASON = "new";

interface EventFormData {
  startsAt: string;
  variant: EventVariant;
  /** SSL: a season id, or NEW_SEASON */
  season: string;
  /** SSL: name of the new season */
  seasonName: string;
}

const EMPTY_FORM: EventFormData = { startsAt: "", variant: "standard", season: NEW_SEASON, seasonName: "" };

const NO_SHOWS = new Set<string>();

const formatEventDate = (startsAt?: string) =>
  startsAt
    ? new Date(startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "no date";

/** "Nov 22, 2026, 14:00 UTC" */
const formatEventDateTime = (startsAt?: string) => formatEventDateTimeUtc(startsAt) ?? "No date set";


const VARIANT_OPTIONS: { value: EventVariant; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "Only players from this alliance." },
  {
    value: "sls",
    label: "SSL (Swordland Summit League)",
    hint: "Battle across kingdoms: the strongest players of the whole kingdom can be added, from any alliance.",
  },
];

export default function SwordlandPage({ params, searchParams }: SwordlandPageProps) {
  const { kingdomId, allianceSlug } = use(params);
  const { event: eventParam } = use(searchParams);
  const eventSlug = Array.isArray(eventParam) ? eventParam[0] : eventParam;
  const kingdomIdNumber = Number(kingdomId);
  const basePath = `/${kingdomId}/${allianceSlug}/events/swordland`;

  const router = useRouter();
  const toast = useToast();

  const [alliance, setAlliance] = useState<Alliance | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<AllianceEvent[]>([]);
  const [seasons, setSeasons] = useState<SwordlandSeason[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isChangingSeason, setIsChangingSeason] = useState(false);
  const [isChangingStartsAt, setIsChangingStartsAt] = useState(false);
  // SSL season: who was assigned to a building in the season's previous event but scored 0
  const [noShows, setNoShows] = useState<{ eventId: number; ids: Set<string> } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<EventFormData>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingVariant, setIsChangingVariant] = useState(false);
  const [isPowerDialogOpen, setIsPowerDialogOpen] = useState(false);
  // Opponents entered in the create form, saved once the event exists
  const draftOpponents = useRef<OpponentsState["opponents"]>([]);

  // The event being edited comes from the ?event= URL param
  const selectedEvent = eventSlug ? findEventBySlug(events, eventSlug) ?? null : null;

  const isSummitLeague = selectedEvent?.eventVariant === "sls";

  // Saved players (event_player) + results of the open event; the editor waits for them
  const editorData = useEventEditorData(selectedEvent, players, !isLoading);

  // The season's event before the open one (its no-shows are marked red)
  const previousSeasonEvent =
    selectedEvent && isSummitLeague && selectedEvent.seasonId
      ? getLastSeasonEvent(events, selectedEvent.seasonId, selectedEvent)
      : null;
  const previousSeasonEventId = previousSeasonEvent?.id;
  const previousSeasonEventStatus = previousSeasonEvent?.status;

  useEffect(() => {
    if (!previousSeasonEvent) return;
    let isMounted = true;
    getNoShowIds(previousSeasonEvent)
      .then((ids) => isMounted && setNoShows({ eventId: previousSeasonEvent.id!, ids }))
      .catch((error) => console.error("Failed to load the last event's no-shows:", error));
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousSeasonEventId, previousSeasonEventStatus]);

  const noShowIds =
    previousSeasonEvent && noShows && noShows.eventId === previousSeasonEvent.id ? noShows.ids : NO_SHOWS;
  const selectedSeason = seasons.find((s) => s.id === selectedEvent?.seasonId);
  // Completed events: event type and season are shown, not changed
  const isEventCompleted = selectedEvent?.status === "completed";

  const loadData = async (allianceId: number) => {
    try {
      setIsLoading(true);
      const [playersData, eventsData, seasonsData] = await Promise.all([
        getPlayers(allianceId, kingdomIdNumber),
        getAllianceEvents(allianceId, EVENT_ID),
        // Before the season migration runs there's no table: no seasons then
        getSeasons(allianceId).catch((error) => {
          console.warn("Seasons unavailable:", error);
          return [] as SwordlandSeason[];
        }),
      ]);

      const sortedPlayers = playersData.sort(
        (a, b) => b.swordlandPower - a.swordlandPower,
      );
      setPlayers(sortedPlayers);
      setEvents(eventsData);
      setSeasons(seasonsData);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    getAlliancesByKingdomId(kingdomIdNumber)
      .then((alliances) => {
        if (!isMounted) return;
        const match = findAllianceBySlug(alliances, allianceSlug) || null;
        setAlliance(match);
        if (match) {
          loadData(match.id);
        } else {
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('Failed to resolve alliance:', error);
        if (isMounted) {
          setAlliance(null);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [kingdomId, allianceSlug]);

  const openEvent = (event: AllianceEvent) => {
    router.push(`${basePath}?event=${getEventSlug(event.id!)}`);
  };

  const handleBackToList = () => {
    router.push(basePath);
  };

  // SSL defaults to the latest season (assignments copied from its last event)
  const getEmptyForm = (): EventFormData => ({
    ...EMPTY_FORM,
    season: seasons.length > 0 ? String(seasons[seasons.length - 1].id) : NEW_SEASON,
    seasonName: getNextSeasonName(seasons),
  });

  const handleCreateEventClick = () => {
    draftOpponents.current = [];
    setShowCreateForm(true);
    setFormData(getEmptyForm());
  };

  const handleFormCancel = () => {
    setShowCreateForm(false);
    setFormData(getEmptyForm());
  };

  const isSslForm = formData.variant === "sls";
  const isNewSeason = formData.season === NEW_SEASON;
  // Existing season: its last event's assignments are copied into the new event
  const copySourceEvent =
    isSslForm && !isNewSeason ? getLastSeasonEvent(events, Number(formData.season)) : null;

  const handleFormSubmit = async () => {
    if (!alliance) return;

    if (!formData.startsAt) {
      toast.warning("Please select a date and time");
      return;
    }
    if (isSslForm && isNewSeason && !formData.seasonName.trim()) {
      toast.warning("Please enter a name for the new season");
      return;
    }

    setIsCreating(true);
    let newSeason: SwordlandSeason | null = null;
    try {
      // SSL: the season the event belongs to (a new one is created now)
      let seasonId: number | null = null;
      if (isSslForm) {
        if (isNewSeason) {
          newSeason = await createSeason(alliance.id, formData.seasonName);
          seasonId = newSeason.id;
        } else {
          seasonId = Number(formData.season);
        }
      }

      // The time is entered in UTC (like the legion start times)
      const utcString = utcInputToIso(formData.startsAt);
      if (!utcString) throw new Error("Invalid date");

      // Create new event with UTC datetime
      const newEvent = await createAllianceEvent({
        allianceId: alliance.id,
        eventId: EVENT_ID,
        status: "not-started" as EventStatus,
        startsAt: utcString,
        assignments: undefined,
        // Only sent for SSL, so standard events also work before the columns exist
        ...(isSslForm ? { eventVariant: "sls" as const, seasonId } : {}),
      });
      const createdSeason = newSeason;
      newSeason = null; // The event exists: keep the season from here on

      // Existing season: start from the assignments of its last event
      let event: AllianceEvent = newEvent;
      let copyFailed = false;
      if (copySourceEvent) {
        try {
          event = await copyAssignmentsFromEvent(copySourceEvent, newEvent);
        } catch (error) {
          console.error("Failed to copy the last event's assignments:", error);
          copyFailed = true;
        }
      }

      // Opponents entered in the form
      const opponentsFailed =
        draftOpponents.current.length > 0 ? await saveDraftOpponents(newEvent.id!, draftOpponents.current) : 0;
      if (opponentsFailed > 0) {
        toast.warning(
          `Event created, but ${opponentsFailed} opponent${opponentsFailed === 1 ? "" : "s"} couldn't be saved. Add them in the event.`,
        );
      }
      draftOpponents.current = [];

      if (createdSeason) setSeasons((prev) => [...prev, createdSeason]);
      setEvents((prev) => [event, ...prev]);
      setShowCreateForm(false);
      setFormData(EMPTY_FORM);
      if (copyFailed) toast.warning("Event created, but the last event's assignments couldn't be copied");
      else if (copySourceEvent) toast.success(`Event created with the assignments of ${formatEventDate(copySourceEvent.startsAt)}`);
      else toast.success("Event created");
      // A fresh load gives the event its player count
      if (copySourceEvent) await loadData(alliance.id);
      openEvent(event);
    } catch (error) {
      console.error("Failed to create event:", error);
      // The event wasn't created: don't leave an empty new season behind
      if (newSeason) await deleteSeason(newSeason.id).catch(() => {});
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
      toast.error(
        message.includes("eventVariant")
          ? "SSL events need the eventVariant column. Run the alliance_event migration in Supabase first."
          : message.includes("season")
            ? "SSL seasons need the season migration. Run it in Supabase first."
            : "Failed to create event",
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Change the event's start (saved right away, when the field is left)
  const handleStartsAtChange = async (value: string) => {
    if (!selectedEvent || !value) return;
    const startsAt = utcInputToIso(value);
    if (!startsAt) return;
    if (selectedEvent.startsAt && new Date(selectedEvent.startsAt).getTime() === new Date(startsAt).getTime()) return;

    setIsChangingStartsAt(true);
    try {
      await updateAllianceEvent(selectedEvent.id!, { startsAt });
      setEvents((prev) => prev.map((e) => (e.id === selectedEvent.id ? { ...e, startsAt } : e)));
      toast.success("Event date updated");
    } catch (error) {
      console.error("Failed to change the event date:", error);
      toast.error("Failed to change the event date");
    } finally {
      setIsChangingStartsAt(false);
    }
  };

  // Move an SSL event to another season (saved right away)
  const handleSeasonChange = async (value: string) => {
    if (!selectedEvent) return;
    const seasonId = value ? Number(value) : null;
    if (seasonId === (selectedEvent.seasonId ?? null)) return;

    setIsChangingSeason(true);
    try {
      await updateAllianceEvent(selectedEvent.id!, { seasonId });
      setEvents((prev) => prev.map((e) => (e.id === selectedEvent.id ? { ...e, seasonId } : e)));
      toast.success("Season updated");
    } catch (error) {
      console.error("Failed to change the season:", error);
      toast.error("Failed to change the season");
    } finally {
      setIsChangingSeason(false);
    }
  };

  const handleSaveAssignments = async (input: EventSaveInput) => {
    if (!selectedEvent || !alliance) return;

    setIsSaving(true);
    try {
      // Event columns (status, note, start times, results, power mode) + its event_player rows
      await saveEventData(selectedEvent, input);

      toast.success("Event updated successfully");
      handleBackToList();
      await loadData(alliance.id);
    } catch (error) {
      console.error("Failed to save event:", error);
      toast.error("Failed to save event");
    } finally {
      setIsSaving(false);
    }
  };

  // Switch an existing event between standard and SSL (saved right away)
  const handleVariantChange = async (variant: EventVariant) => {
    if (!selectedEvent || variant === (selectedEvent.eventVariant ?? "standard")) return;

    setIsChangingVariant(true);
    try {
      await updateAllianceEvent(selectedEvent.id!, { eventVariant: variant });
      setEvents((prev) =>
        prev.map((e) => (e.id === selectedEvent.id ? { ...e, eventVariant: variant } : e)),
      );
      toast.success(variant === "sls" ? "Switched to SSL" : "Switched to Standard");
    } catch (error) {
      console.error("Failed to change event type:", error);
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
      toast.error(
        message.includes("eventVariant")
          ? "SSL events need the eventVariant column. Run the alliance_event migration in Supabase first."
          : "Failed to change event type",
      );
    } finally {
      setIsChangingVariant(false);
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
      await deleteAllianceEvent(eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      toast.success("Event deleted");
      if (selectedEvent?.id === eventId) {
        handleBackToList();
      }
    } catch (error) {
      console.error("Failed to delete event:", error);
      toast.error("Failed to delete event");
    }
  };

  if (alliance === null) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <div className={styles.container}>
            <Breadcrumbs />
            <p>Alliance not found.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <div className={styles.container}>
          <Breadcrumbs />
          {showCreateForm ? (
            // Create Event Form
            <div className={styles.formModal}>
              <div className={`${styles.formContent} ${styles.formContentWide}`}>
                <h2>Create New Swordland Event</h2>
                <p>
                  Choose a date and time for this event, in UTC (game time)
                </p>

                <div className={styles.formGroup}>
                  <label htmlFor="eventVariant">Event Type</label>
                  <select
                    id="eventVariant"
                    value={formData.variant}
                    onChange={(e) =>
                      setFormData({ ...formData, variant: e.target.value as EventVariant })
                    }
                    className={styles.formInput}
                  >
                    {VARIANT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small className={styles.formHint}>
                    {VARIANT_OPTIONS.find((o) => o.value === formData.variant)?.hint}
                  </small>
                </div>

                {isSslForm && (
                  <div className={styles.formGroup}>
                    <label htmlFor="eventSeason">Season</label>
                    <select
                      id="eventSeason"
                      value={formData.season}
                      onChange={(e) => setFormData({ ...formData, season: e.target.value })}
                      className={styles.formInput}
                    >
                      {[...seasons].reverse().map((season) => (
                        <option key={season.id} value={String(season.id)}>
                          {season.name}
                        </option>
                      ))}
                      <option value={NEW_SEASON}>+ New season</option>
                    </select>
                    {isNewSeason ? (
                      <>
                        <input
                          id="seasonName"
                          type="text"
                          value={formData.seasonName}
                          onChange={(e) => setFormData({ ...formData, seasonName: e.target.value })}
                          className={`${styles.formInput} ${styles.seasonNameInput}`}
                          placeholder="Season name"
                          aria-label="New season name"
                          maxLength={60}
                        />
                        <small className={styles.formHint}>
                          The season is created together with the event. The event starts with no assignments.
                        </small>
                      </>
                    ) : (
                      <small className={styles.formHint}>
                        {copySourceEvent
                          ? `Assignments are copied from the season's last event (${formatEventDate(copySourceEvent.startsAt)}). Players who were on a building but scored 0 are marked red.`
                          : "This season has no events yet: the event starts with no assignments."}
                      </small>
                    )}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label htmlFor="startsAt">Event Date & Time (UTC)</label>
                  <input
                    id="startsAt"
                    type="datetime-local"
                    value={formData.startsAt}
                    onChange={(e) =>
                      setFormData({ ...formData, startsAt: e.target.value })
                    }
                    className={styles.formInput}
                  />
                </div>

                {alliance && (
                  <div className={styles.formOpponents}>
                    <EventOpponents
                      eventId={null}
                      eventType="swordland"
                      ownAllianceId={alliance.id}
                      onChange={(state) => {
                        draftOpponents.current = state.opponents;
                      }}
                    />
                  </div>
                )}

                <div className={styles.formActions}>
                  <button
                    onClick={handleFormCancel}
                    className={styles.cancelButton}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFormSubmit}
                    className={styles.submitButton}
                    disabled={isCreating}
                  >
                    {isCreating ? "Creating..." : "Create Event"}
                  </button>
                </div>
              </div>
            </div>
          ) : selectedEvent ? (
            // Event Editor View
            <>
              <EventHero eventType="swordland" />
              {/* Event type and season side by side */}
              <div className={styles.pickerRow}>
                <div className={styles.variantPicker}>
                  {isEventCompleted ? (
                    <>
                      <span className={styles.pickerLabel}>Event Type</span>
                      <span className={styles.readOnlyValue}>
                        {VARIANT_OPTIONS.find((o) => o.value === (isSummitLeague ? "sls" : "standard"))?.label}
                      </span>
                    </>
                  ) : (
                  <>
                  <label htmlFor="editEventVariant">Event Type</label>
                  <select
                    id="editEventVariant"
                    value={isSummitLeague ? "sls" : "standard"}
                    onChange={(e) => handleVariantChange(e.target.value as EventVariant)}
                    className={styles.variantSelect}
                    disabled={isChangingVariant}
                  >
                    {VARIANT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small className={styles.formHint}>
                    {VARIANT_OPTIONS.find((o) => o.value === (isSummitLeague ? "sls" : "standard"))?.hint}
                  </small>
                  </>
                  )}
                </div>
                {isSummitLeague && seasons.length > 0 && (
                  <div className={styles.variantPicker}>
                    {isEventCompleted ? (
                      <>
                        <span className={styles.pickerLabel}>Season</span>
                        <span className={styles.readOnlyValue}>{selectedSeason?.name ?? "No season"}</span>
                      </>
                    ) : (
                    <>
                    <label htmlFor="editEventSeason">Season</label>
                    <select
                      id="editEventSeason"
                      value={selectedEvent.seasonId != null ? String(selectedEvent.seasonId) : ""}
                      onChange={(e) => handleSeasonChange(e.target.value)}
                      className={styles.variantSelect}
                      disabled={isChangingSeason}
                    >
                      <option value="">No season</option>
                      {[...seasons].reverse().map((season) => (
                        <option key={season.id} value={String(season.id)}>
                          {season.name}
                        </option>
                      ))}
                    </select>
                    </>
                    )}
                    {previousSeasonEvent && noShowIds.size > 0 && (
                      <small className={`${styles.formHint} ${styles.noShowHint}`}>
                        Marked red: {noShowIds.size} player{noShowIds.size === 1 ? " was" : "s were"} on a building
                        in the season&apos;s previous event ({formatEventDate(previousSeasonEvent.startsAt)}) but
                        scored 0 points.
                      </small>
                    )}
                  </div>
                )}
                <div className={styles.variantPicker}>
                  {isEventCompleted ? (
                    <>
                      <span className={styles.pickerLabel}>Event Date &amp; Time</span>
                      <span className={styles.readOnlyValue}>{formatEventDateTime(selectedEvent.startsAt)}</span>
                    </>
                  ) : (
                    <>
                      <label htmlFor="editEventStartsAt">Event Date &amp; Time (UTC)</label>
                      <input
                        key={`${selectedEvent.id}:${selectedEvent.startsAt ?? ""}`}
                        id="editEventStartsAt"
                        type="datetime-local"
                        defaultValue={isoToUtcInput(selectedEvent.startsAt)}
                        onBlur={(e) => handleStartsAtChange(e.target.value)}
                        className={styles.variantSelect}
                        disabled={isChangingStartsAt}
                      />
                      <small className={styles.formHint}>In UTC. Saved when you leave the field.</small>
                    </>
                  )}
                </div>
              </div>
              <div className={styles.newTabBar}>
                <a
                  href={`${basePath}/assignments?event=${getEventSlug(selectedEvent.id!)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.backButton}
                  title="The saved assignments, the opponents and a simulation of their buildings"
                >
                  Open assignments in new tab ↗
                </a>
                <small className={styles.formHint}>Shows the saved assignments: save first.</small>
              </div>
              {editorData.usesStartPowers && (
                <p className={styles.powerNote}>
                  This event has started: powers are each player&apos;s latest recorded power before the start.
                </p>
              )}
              {editorData.error ? (
                <p className={styles.loadError}>
                  Couldn&apos;t load this event&apos;s players: {editorData.error}
                </p>
              ) : editorData.ready ? (
                <SwordlandEventLayout
                  key={selectedEvent.id}
                  players={editorData.players}
                  // Only passed when there are any, so the editor isn't re-initialized by a new empty list
                  externalPlayers={editorData.extraPlayers?.length ? editorData.extraPlayers : undefined}
                  summitLeague={
                    isSummitLeague && alliance
                      ? { kingdomId: kingdomIdNumber, allianceId: alliance.id }
                      : undefined
                  }
                  initialAssignments={editorData.assignments!}
                  initialResults={editorData.results}
                  initialPowerMode={getPowerMode(selectedEvent)}
                  initialLegionSchedules={getLegionSchedules(selectedEvent)}
                  initialNotes={selectedEvent.notes ?? ""}
                  noShowIds={noShowIds}
                  onSave={handleSaveAssignments}
                  onDelete={() => handleDeleteEvent(selectedEvent.id!)}
                  isSaving={isSaving}
                  eventStatus={selectedEvent.status}
                  renderOpponents={(readOnly) =>
                    alliance && (
                      <EventOpponents
                        eventId={selectedEvent.id!}
                        eventType="swordland"
                        ownAllianceId={alliance.id}
                        readOnly={readOnly}
                      />
                    )
                  }
                />
              ) : (
                <p>Loading the event&apos;s players...</p>
              )}
            </>
          ) : eventSlug && !isLoading ? (
            // Unknown event id in the URL
            <p>Event not found.</p>
          ) : (
            // Events List View
            <>
              <div className={styles.header}>
                <h1 className={styles.title}>Swordland Event Management</h1>
                <div className={styles.headerActions}>
                  <button
                    onClick={() => setIsPowerDialogOpen(true)}
                    className={styles.backButton}
                    disabled={isLoading || players.length === 0}
                    title="Type the players' Swordland power from the game before creating the event"
                  >
                    Update Swordland Power
                  </button>
                  <button
                    onClick={handleCreateEventClick}
                    className={styles.createButton}
                    disabled={isLoading}
                  >
                    + Create New Event
                  </button>
                </div>
              </div>
              <SwordlandPowerDialog
                isOpen={isPowerDialogOpen}
                players={players}
                onClose={() => setIsPowerDialogOpen(false)}
                onSaved={async () => {
                  if (alliance) await loadData(alliance.id);
                }}
              />

              {isLoading ? (
                <p>Loading...</p>
              ) : (
                <>
                  <EventList
                    events={events}
                    seasons={seasons}
                    onEventClick={openEvent}
                    onDeleteEvent={handleDeleteEvent}
                    isLoading={false}
                  />
                  <ReliabilityStats events={events} seasons={seasons} />
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
