'use client';

import { AllianceEvent, EventStatus } from '@/types';
import { LegionSchedule, getLegionSchedules } from '@/utils/legionSchedule';
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

  /** "Sunday, 14:00 UTC" - only when a start time was picked */
  const formatSchedule = (schedule: LegionSchedule) =>
    schedule.time ? [schedule.weekday, `${schedule.time} UTC`].filter(Boolean).join(', ') : null;

  // Each legion's result (columns on the event) with its start time
  const renderResults = (event: AllianceEvent) => {
    const schedules = getLegionSchedules(event);
    const legions = [
      { title: 'Legion 1', status: event.legion1Result, schedule: formatSchedule(schedules.legion_1) },
      { title: 'Legion 2', status: event.legion2Result, schedule: formatSchedule(schedules.legion_2) },
    ].filter((legion): legion is typeof legion & { status: string } => !!legion.status);
    if (legions.length === 0) return null;

    return (
      <div className={styles.field}>
        <label>Results:</label>
        <ul className={styles.resultList}>
          {legions.map(({ title, status, schedule }) => (
            <li key={title} className={styles.resultRow}>
              <span className={styles.resultLegion}>
                {title}
                {schedule && <span className={styles.resultSchedule}>{schedule}</span>}
              </span>
              <span className={`${styles.resultBadge} ${RESULT_STYLES[status] ?? ''}`}>
                {RESULT_LABELS[status] ?? status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const playerCount = (event: AllianceEvent) => event.event_player?.[0]?.count ?? 0;

  const renderEventCards = (eventList: AllianceEvent[], { allowDelete }: { allowDelete: boolean }) => (
    <div className={styles.eventsGrid}>
      {eventList.map((event) => (
        <div key={event.id} className={styles.eventCard}>
          {/* The whole card opens the event (a full-card button under the content) */}
          <button
            type="button"
            className={styles.cardOpen}
            onClick={() => onEventClick(event)}
            aria-label={`Open event of ${formatDate(event.startsAt)}`}
          />
          <div className={styles.cardHeader}>
            <div className={styles.dateInfo}>
              <span className={styles.date}>{formatDate(event.startsAt)}</span>
              <span className={`${styles.status} ${getStatusColor(event.status)}`}>
                {event.status}
              </span>
              {event.eventVariant === 'sls' && (
                <span className={styles.variantBadge} title="Swordland Summit League">
                  SSL
                </span>
              )}
            </div>
            {/* Completed events keep their results and player history: they can't be deleted */}
            {allowDelete && event.status !== 'completed' && (
              <button
                onClick={() => onDeleteEvent(event.id!)}
                className={styles.deleteBtn}
                title="Delete event"
              >
                ✕
              </button>
            )}
          </div>

          <div className={styles.cardBody}>
            {event.rules && (
              <div className={styles.field}>
                <label>Rules:</label>
                <p>{event.rules}</p>
              </div>
            )}

            {renderResults(event)}

            {event.notes && (
              <div className={styles.field}>
                <label>Notes:</label>
                <p className={styles.notes}>{event.notes}</p>
              </div>
            )}

            <div className={styles.field}>
              <label>Assignments:</label>
              <p>
                {playerCount(event) > 0
                  ? `${playerCount(event)} player${playerCount(event) === 1 ? '' : 's'}`
                  : 'Not configured'}
              </p>
            </div>
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
          {/* Upcoming events can't be deleted for now */}
          {renderEventCards(upcomingEvents, { allowDelete: false })}
        </div>
      )}

      {pastEvents.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.title}>Past Events</h2>
          {renderEventCards(pastEvents, { allowDelete: true })}
        </div>
      )}
    </div>
  );
}
