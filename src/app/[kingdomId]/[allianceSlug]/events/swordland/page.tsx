"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alliance, Player, AllianceEvent, PlayerAssignment, EventStatus, EventResults, EventVariant } from "@/types";
import Navigation from "@/components/Navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import EventHero from "@/components/EventHero";
import SwordlandEventLayout from "@/components/SwordlandEventLayout";
import EventList from "@/components/EventList";
import { useToast } from "@/components/Toast";
import { getPlayers, getPlayersByIds } from "@/utils/playerService";
import { getAlliancesByKingdomId } from "@/utils/allianceService";
import { findAllianceBySlug } from "@/utils/allianceSlug";
import { findEventBySlug, getEventSlug } from "@/utils/eventSlug";
import { buildEventNotes, parseEventResults } from "@/utils/eventResults";
import { PowerMode, parsePowerMode } from "@/utils/powerMode";
import {
  getAllianceEvents,
  createAllianceEvent,
  updateAllianceEvent,
  deleteAllianceEvent,
  serializeAssignments,
  deserializeAssignments,
} from "@/utils/eventService";
import styles from "./page.module.css";

const EVENT_ID = 1; // Swordland event ID

interface SwordlandPageProps {
  params: Promise<{ kingdomId: string; allianceSlug: string }>;
  searchParams: Promise<{ event?: string | string[] }>;
}

interface EventFormData {
  startsAt: string;
  variant: EventVariant;
}

const EMPTY_FORM: EventFormData = { startsAt: "", variant: "standard" };

const VARIANT_OPTIONS: { value: EventVariant; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "Only players from this alliance." },
  {
    value: "sls",
    label: "SLS (Swordland Summit League)",
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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<EventFormData>(EMPTY_FORM);
  // SLS: other-alliance players saved in the open event (loaded before the editor shows)
  // Keyed by event + saved assignments, so reopening after a save reloads them
  const [externalPlayers, setExternalPlayers] = useState<{ key: string; players: Player[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingVariant, setIsChangingVariant] = useState(false);

  // The event being edited comes from the ?event= URL param
  const selectedEvent = eventSlug ? findEventBySlug(events, eventSlug) ?? null : null;

  // Memoized so the editor isn't reset on every re-render of this page
  const initialAssignments = useMemo(
    () => deserializeAssignments(selectedEvent?.assignments || null),
    [selectedEvent?.assignments],
  );

  const isSummitLeague = selectedEvent?.eventVariant === "sls";

  // SLS: load the saved players that aren't in this alliance (other alliances of the kingdom)
  const externalKey = selectedEvent ? `${selectedEvent.id}:${selectedEvent.assignments ?? ""}` : "";

  const savedExternalIds = useMemo(() => {
    const ownIds = new Set(players.map((p) => String(p.id)));
    return initialAssignments
      .map((a) => String(a.playerId))
      .filter((id) => !ownIds.has(id));
  }, [players, initialAssignments]);

  useEffect(() => {
    if (!selectedEvent || !isSummitLeague || isLoading) return;
    if (savedExternalIds.length === 0) return;
    if (externalPlayers?.key === externalKey) return;

    const externalIds = savedExternalIds;

    let isMounted = true;
    getPlayersByIds(externalIds)
      .then((found) => {
        if (isMounted) setExternalPlayers({ key: externalKey, players: found });
      })
      .catch((error) => {
        console.error("Failed to load players from other alliances:", error);
        toast.error("Failed to load players from other alliances");
        if (isMounted) setExternalPlayers({ key: externalKey, players: [] });
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalKey, isSummitLeague, isLoading, savedExternalIds]);

  const externalReady =
    !isSummitLeague || savedExternalIds.length === 0 || externalPlayers?.key === externalKey;
  // Only passed when there are any, so the editor isn't re-initialized by a new empty list
  const editorExternalPlayers =
    isSummitLeague && externalPlayers?.key === externalKey && externalPlayers.players.length > 0
      ? externalPlayers.players
      : undefined;

  // Points, results and MVPs of a completed event (stored in notes)
  const initialResults = useMemo(
    () => parseEventResults(selectedEvent?.notes),
    [selectedEvent?.notes],
  );

  const loadData = async (allianceId: number) => {
    try {
      setIsLoading(true);
      const [playersData, eventsData] = await Promise.all([
        getPlayers(allianceId, kingdomIdNumber),
        getAllianceEvents(allianceId, EVENT_ID),
      ]);

      const sortedPlayers = playersData.sort(
        (a, b) => b.swordlandPower - a.swordlandPower,
      );
      setPlayers(sortedPlayers);
      setEvents(eventsData);
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

  const handleCreateEventClick = () => {
    setShowCreateForm(true);
    setFormData(EMPTY_FORM);
  };

  const handleFormCancel = () => {
    setShowCreateForm(false);
    setFormData(EMPTY_FORM);
  };

  const handleFormSubmit = async () => {
    if (!alliance) return;

    if (!formData.startsAt) {
      toast.warning("Please select a date and time");
      return;
    }

    try {
      // Convert datetime-local to UTC
      const localDate = new Date(formData.startsAt);
      const utcString = localDate.toISOString();

      // Create new event with UTC datetime
      const newEvent = await createAllianceEvent({
        allianceId: alliance.id,
        eventId: EVENT_ID,
        status: "not-started" as EventStatus,
        startsAt: utcString,
        assignments: undefined,
        // Only sent for SLS, so standard events also work before the column exists
        ...(formData.variant === "sls" ? { eventVariant: "sls" as const } : {}),
      });

      setEvents((prev) => [newEvent, ...prev]);
      setShowCreateForm(false);
      setFormData(EMPTY_FORM);
      toast.success("Event created");
      openEvent(newEvent);
    } catch (error) {
      console.error("Failed to create event:", error);
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
      toast.error(
        message.includes("eventVariant")
          ? "SLS events need the eventVariant column. Run the alliance_event migration in Supabase first."
          : "Failed to create event",
      );
    }
  };

  const handleSaveAssignments = async (
    assignments: PlayerAssignment[],
    eventStatus: EventStatus,
    results: EventResults | undefined,
    powerMode: PowerMode,
  ) => {
    if (!selectedEvent || !alliance) return;

    setIsSaving(true);
    try {
      const serialized = serializeAssignments(assignments);

      await updateAllianceEvent(selectedEvent.id!, {
        assignments: serialized,
        updatedAt: new Date().toISOString(),
        status: eventStatus,
        // Results (completed events) and the power used for the assignments
        notes: buildEventNotes(selectedEvent.notes, { results, fields: { powerMode } }),
      });

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

  // Switch an existing event between standard and SLS (saved right away)
  const handleVariantChange = async (variant: EventVariant) => {
    if (!selectedEvent || variant === (selectedEvent.eventVariant ?? "standard")) return;

    if (
      variant === "standard" &&
      savedExternalIds.length > 0 &&
      !confirm(
        "Players from other alliances will be removed from this event's assignments when you save. Continue?",
      )
    ) {
      return;
    }

    setIsChangingVariant(true);
    try {
      await updateAllianceEvent(selectedEvent.id!, { eventVariant: variant });
      setEvents((prev) =>
        prev.map((e) => (e.id === selectedEvent.id ? { ...e, eventVariant: variant } : e)),
      );
      toast.success(variant === "sls" ? "Switched to SLS" : "Switched to Standard");
    } catch (error) {
      console.error("Failed to change event type:", error);
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
      toast.error(
        message.includes("eventVariant")
          ? "SLS events need the eventVariant column. Run the alliance_event migration in Supabase first."
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
              <div className={styles.formContent}>
                <h2>Create New Swordland Event</h2>
                <p>
                  Choose a date and time for this event (will be stored as UTC)
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

                <div className={styles.formGroup}>
                  <label htmlFor="startsAt">Event Date & Time</label>
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
                  >
                    Create Event
                  </button>
                </div>
              </div>
            </div>
          ) : selectedEvent ? (
            // Event Editor View
            <>
              <div className={styles.variantBanner}>
                <strong>
                  {isSummitLeague ? "SLS · Swordland Summit League" : "Standard Swordland"}
                </strong>
              </div>
              <div className={styles.variantPicker}>
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
              </div>
              <EventHero eventType="swordland" />
              {externalReady ? (
                <SwordlandEventLayout
                  key={selectedEvent.id}
                  players={players}
                  externalPlayers={editorExternalPlayers}
                  summitLeague={
                    isSummitLeague && alliance
                      ? { kingdomId: kingdomIdNumber, allianceId: alliance.id }
                      : undefined
                  }
                  initialAssignments={initialAssignments}
                  initialResults={initialResults}
                  initialPowerMode={parsePowerMode(selectedEvent.notes)}
                  onSave={handleSaveAssignments}
                  isSaving={isSaving}
                  eventStatus={selectedEvent.status}
                />
              ) : (
                <p>Loading players from other alliances...</p>
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
                <button
                  onClick={handleCreateEventClick}
                  className={styles.createButton}
                  disabled={isLoading}
                >
                  + Create New Event
                </button>
              </div>

              {isLoading ? (
                <p>Loading...</p>
              ) : (
                <EventList
                  events={events}
                  onEventClick={openEvent}
                  onDeleteEvent={handleDeleteEvent}
                  isLoading={false}
                />
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
