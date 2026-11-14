'use client';

import { AllianceEvent, EventStatus } from '@/types';
import { getNotesField, parseEventResults } from '@/utils/eventResults';
import styles from './EventList.module.css';

const RESULT_LABELS: Record<string, string> = {
  win: 'Win',
  lose: 'Lose',
  '1st': '1st place',
  '2nd': '2nd place',
  '3rd': '3rd place',
};

// Badge colour per result: Swordland win/lose, Tri Alliance podium places
const RESULT_STYLES: Record<string, string> = {
  win: styles.resultWin,
  lose: styles.resultLose,
  '1st': styles.resultFirst,
  '2nd': styles.resultSecond,
  '3rd': styles.resultThird,
};

interface EventListProps {
  events: AllianceEvent[];
  onEventClick: (event: AllianceEvent) => void;
  onDeleteEvent: (id: number) => Promise<void>;
  isLoading?: boolean;
}

export default function EventList({
  events,
  onEventClick,
  onDeleteEvent,
  isLoading = false,
}: EventListProps) {
  const getStatusColor = (status: EventStatus) => {
    switch (status) {
      case 'not-started':
        return styles.statusNotStarted;
      case 'ongoing':
        return styles.statusOngoing;
      case 'completed':
        return styles.statusCompleted;
      default:
        return '';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No date set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Separate upcoming and past events
  const now = new Date();
  const upcomingEvents = events.filter((event) => {
    if (!event.startsAt) return false;
    return new Date(event.startsAt) > now;
  });

  const pastEvents = events.filter((event) => {
    if (!event.startsAt) return true; // No date events go to past
    return new Date(event.startsAt) <= now;
  });

  if (isLoading) {
    return <div className={styles.loading}>Loading events...</div>;
  }

  if (events.length === 0) {
    return <div className={styles.empty}>No events created yet. Create your first event!</div>;
  }

  // Notes hold the results JSON for completed events; plain text notes are shown as-is
  const renderNotes = (notes?: string) => {
    if (!notes) return null;

    const results = parseEventResults(notes);
    if (!results) {
      // Settings stored in the notes (e.g. powerMode) aren't shown, only plain text notes
      const text = getNotesField(notes, 'text');
      if (typeof text !== 'string' || !text) return null;
      return (
        <div className={styles.field}>
          <label>Notes:</label>
          <p>{text}</p>
        </div>
      );
    }

    const legions = [
      { title: 'Legion 1', result: results.legion_1 },
      { title: 'Legion 2', result: results.legion_2 },
    ].filter(({ result }) => result.status);
    if (legions.length === 0) return null;

    return (
      <div className={styles.field}>
        <label>Results:</label>
        <ul className={styles.resultList}>
          {legions.map(({ title, result }) => (
            <li key={title} className={styles.resultRow}>
              <span className={styles.resultLegion}>{title}</span>
              <span className={`${styles.resultBadge} ${RESULT_STYLES[result.status!] ?? ''}`}>
                {RESULT_LABELS[result.status!] ?? result.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderEventCards = (eventList: AllianceEvent[]) => (
    <div className={styles.eventsGrid}>
      {eventList.map((event) => (
        <div key={event.id} className={styles.eventCard}>
          <div className={styles.cardHeader}>
            <div className={styles.dateInfo}>
              <span className={styles.date}>{formatDate(event.startsAt)}</span>
              <span className={`${styles.status} ${getStatusColor(event.status)}`}>
                {event.status}
              </span>
              {event.eventVariant === 'sls' && (
                <span className={styles.variantBadge} title="Swordland Summit League">
                  SLS
                </span>
              )}
            </div>
            <button
              onClick={() => onDeleteEvent(event.id!)}
              className={styles.deleteBtn}
              title="Delete event"
            >
              ✕
            </button>
          </div>

          <div className={styles.cardBody}>
            {event.rules && (
              <div className={styles.field}>
                <label>Rules:</label>
                <p>{event.rules}</p>
              </div>
            )}

            {renderNotes(event.notes)}

            <div className={styles.field}>
              <label>Assignments:</label>
              <p>{event.assignments ? 'Configured' : 'Not configured'}</p>
            </div>
          </div>

          <div className={styles.cardFooter}>
            <button
              onClick={() => onEventClick(event)}
              className={styles.editBtn}
            >
              Edit Event
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={styles.container}>
      {upcomingEvents.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.title}>Upcoming Events</h2>
          {renderEventCards(upcomingEvents)}
        </div>
      )}

      {pastEvents.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.title}>Past Events</h2>
          {renderEventCards(pastEvents)}
        </div>
      )}
    </div>
  );
}
