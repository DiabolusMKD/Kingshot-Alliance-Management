"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alliance, Player, AllianceEvent, PlayerAssignment, EventStatus, EventResults } from "@/types";
import Navigation from "@/components/Navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import EventHero from "@/components/EventHero";
import SwordlandEventLayout from "@/components/SwordlandEventLayout";
import EventList from "@/components/EventList";
import { useToast } from "@/components/Toast";
import { getPlayers } from "@/utils/playerService";
import { getAlliancesByKingdomId } from "@/utils/allianceService";
import { findAllianceBySlug } from "@/utils/allianceSlug";
import { findEventBySlug, getEventSlug } from "@/utils/eventSlug";
import { parseEventResults, serializeEventResults } from "@/utils/eventResults";
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
}

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
  const [formData, setFormData] = useState<EventFormData>({ startsAt: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // The event being edited comes from the ?event= URL param
  const selectedEvent = eventSlug ? findEventBySlug(events, eventSlug) ?? null : null;

  // Memoized so the editor isn't reset on every re-render of this page
  const initialAssignments = useMemo(
    () => deserializeAssignments(selectedEvent?.assignments || null),
    [selectedEvent?.assignments],
  );

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
    setFormData({ startsAt: "" });
  };

  const handleFormCancel = () => {
    setShowCreateForm(false);
    setFormData({ startsAt: "" });
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
      });

      setEvents((prev) => [newEvent, ...prev]);
      setShowCreateForm(false);
      setFormData({ startsAt: "" });
      toast.success("Event created");
      openEvent(newEvent);
    } catch (error) {
      console.error("Failed to create event:", error);
      toast.error("Failed to create event");
    }
  };

  const handleSaveAssignments = async (
    assignments: PlayerAssignment[],
    eventStatus: EventStatus,
    results?: EventResults,
  ) => {
    if (!selectedEvent || !alliance) return;

    setIsSaving(true);
    try {
      const serialized = serializeAssignments(assignments);

      await updateAllianceEvent(selectedEvent.id!, {
        assignments: serialized,
        updatedAt: new Date().toISOString(),
        status: eventStatus,
        ...(results ? { notes: serializeEventResults(results) } : {}),
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
              <div className={styles.header}>
                <button
                  onClick={handleBackToList}
                  className={styles.backButton}
                >
                  ← Back to Events
                </button>
              </div>
              <EventHero eventType="swordland" />
              <SwordlandEventLayout
                key={selectedEvent.id}
                players={players}
                initialAssignments={initialAssignments}
                initialResults={initialResults}
                onSave={handleSaveAssignments}
                isSaving={isSaving}
                eventStatus={selectedEvent.status}
              />
            </>
          ) : eventSlug && !isLoading ? (
            // Unknown event id in the URL
            <>
              <div className={styles.header}>
                <button
                  onClick={handleBackToList}
                  className={styles.backButton}
                >
                  ← Back to Events
                </button>
              </div>
              <p>Event not found.</p>
            </>
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
