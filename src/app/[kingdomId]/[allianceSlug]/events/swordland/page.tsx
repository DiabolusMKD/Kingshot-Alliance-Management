"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alliance, Player, AllianceEvent, EventStatus, EventVariant } from "@/types";
import Navigation from "@/components/Navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import EventHero from "@/components/EventHero";
import SwordlandEventLayout from "@/components/SwordlandEventLayout";
import EventList from "@/components/EventList";
import { useToast } from "@/components/Toast";
import { useEventEditorData } from "@/components/useEventEditorData";
import { getPlayers } from "@/utils/playerService";
import { getAlliancesByKingdomId } from "@/utils/allianceService";
import { findAllianceBySlug } from "@/utils/allianceSlug";
import { findEventBySlug, getEventSlug } from "@/utils/eventSlug";
import { EventSaveInput, saveEventData } from "@/utils/eventData";
import { getPowerMode } from "@/utils/powerMode";
import { getLegionSchedules } from "@/utils/legionSchedule";
import {
  getAllianceEvents,
  createAllianceEvent,
  updateAllianceEvent,
  deleteAllianceEvent,
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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<EventFormData>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingVariant, setIsChangingVariant] = useState(false);

  // The event being edited comes from the ?event= URL param
  const selectedEvent = eventSlug ? findEventBySlug(events, eventSlug) ?? null : null;

  const isSummitLeague = selectedEvent?.eventVariant === "sls";

  // Saved players (event_player) + results of the open event; the editor waits for them
  const editorData = useEventEditorData(selectedEvent, players, !isLoading);

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
        // Only sent for SSL, so standard events also work before the column exists
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
          ? "SSL events need the eventVariant column. Run the alliance_event migration in Supabase first."
          : "Failed to create event",
      );
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
                  {isSummitLeague ? "SSL · Swordland Summit League" : "Standard Swordland"}
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
              {editorData.error ? (
                <p className={styles.loadError}>
                  Couldn&apos;t load this event&apos;s players: {editorData.error}
                </p>
              ) : editorData.ready ? (
                <SwordlandEventLayout
                  key={selectedEvent.id}
                  players={players}
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
                  onSave={handleSaveAssignments}
                  onDelete={() => handleDeleteEvent(selectedEvent.id!)}
                  isSaving={isSaving}
                  eventStatus={selectedEvent.status}
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
