"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Alliance, Player, AllianceEvent, PlayerAssignment, EventStatus } from "@/types";
import Navigation from "@/components/Navigation";
import EventHero from "@/components/EventHero";
import SwordlandEventLayout from "@/components/SwordlandEventLayout";
import EventList from "@/components/EventList";
import { getPlayers } from "@/utils/playerService";
import { getAlliancesByKingdomId } from "@/utils/allianceService";
import { findAllianceBySlug } from "@/utils/allianceSlug";
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
}

interface EventFormData {
  startsAt: string;
}

export default function SwordlandPage({ params }: SwordlandPageProps) {
  const { kingdomId, allianceSlug } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  const [alliance, setAlliance] = useState<Alliance | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<AllianceEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AllianceEvent | null>(
    null,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<EventFormData>({ startsAt: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
      alert("Failed to load data");
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
      alert("Please select a date and time");
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

      setSelectedEvent(newEvent);
      setShowCreateForm(false);
      setFormData({ startsAt: "" });
    } catch (error) {
      console.error("Failed to create event:", error);
      alert("Failed to create event");
    }
  };

  const handleSaveAssignments = async (
    assignments: PlayerAssignment[],
    eventStatus: EventStatus,
  ) => {
    if (!selectedEvent || !alliance) return;

    setIsSaving(true);
    try {
      const serialized = serializeAssignments(assignments);

      const updated = await updateAllianceEvent(selectedEvent.id!, {
        assignments: serialized,
        updatedAt: new Date().toISOString(),
        status: eventStatus,
      });

      setSelectedEvent(updated);
      await loadData(alliance.id);
      alert("Event saved successfully!");
      handleBackToList();
    } catch (error) {
      console.error("Failed to save event:", error);
      alert("Failed to save event");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
      await deleteAllianceEvent(eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(null);
      }
    } catch (error) {
      console.error("Failed to delete event:", error);
      alert("Failed to delete event");
    }
  };

  const handleBackToList = () => {
    setSelectedEvent(null);
  };

  if (alliance === null) {
    return (
      <>
        <Navigation />
        <main className={styles.main}>
          <div className={styles.container}>
            <p>Alliance not found.</p>
            <Link href={`/${kingdomId}/${allianceSlug}/events`}>← Back to Events</Link>
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
                players={players}
                initialAssignments={deserializeAssignments(
                  selectedEvent.assignments || null,
                )}
                onSave={handleSaveAssignments}
                isSaving={isSaving}
                eventStatus={selectedEvent.status}
              />
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
                  onEventClick={setSelectedEvent}
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
