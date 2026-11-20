'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alliance, Player } from '@/types';
import { getAllianceSlug } from '@/utils/allianceSlug';
import { formatNumbers } from '@/utils/formatNumbers';
import { MAX_ALLIANCE_PLAYERS } from '@/utils/constants';
import { AllianceStats, getAllianceLeaders } from '@/utils/playerService';
import { getPlayerHref } from '@/utils/playerLinks';
import AllianceAvatar from './AllianceAvatar';
import styles from './AllianceTable.module.css';

interface AllianceTableProps {
  alliances: Alliance[];
  kingdomId: number;
  getStats: (alliance: Alliance) => AllianceStats;
}

export default function AllianceTable({ alliances, kingdomId, getStats }: AllianceTableProps) {
  const router = useRouter();
  // alliance.id -> leader (from the game, or the player with the Leader rank)
  const [leaders, setLeaders] = useState<Map<number, Player>>(new Map());
  const leadersKey = alliances.map((a) => `${a.id}:${a.leaderPlayerId ?? ''}`).join(',');

  useEffect(() => {
    let isMounted = true;
    getAllianceLeaders(alliances)
      .then((found) => isMounted && setLeaders(found))
      .catch((error) => console.error('Failed to load alliance leaders:', error));
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadersKey]);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>No.</th>
            <th>Image</th>
            <th>Name</th>
            <th>Leader</th>
            <th className={styles.powerCell}>Players</th>
            <th className={styles.powerCell}>Total Power</th>
          </tr>
        </thead>
        <tbody>
          {alliances.map((alliance, index) => {
            const { power, count } = getStats(alliance);
            return (
            <tr
              key={alliance.id}
              className={styles.row}
              onClick={() => router.push(`/${kingdomId}/${getAllianceSlug(alliance.id)}`)}
            >
              <td>{index + 1}</td>
              <td>
                <AllianceAvatar alliance={alliance} className={styles.allianceImage} />
              </td>
              <td>[{alliance.nameTag}]{alliance.name}</td>
              <td>
                {leaders.get(alliance.id) ? (
                  <Link
                    href={getPlayerHref(leaders.get(alliance.id)!)}
                    className={styles.leaderLink}
                    // The row opens the alliance: the link opens the leader instead
                    onClick={(e) => e.stopPropagation()}
                  >
                    {leaders.get(alliance.id)!.name}
                  </Link>
                ) : (
                  <span className={styles.noLeader}>—</span>
                )}
              </td>
              <td
                className={`${styles.powerCell} ${count >= MAX_ALLIANCE_PLAYERS ? styles.full : ''}`}
                title={`${count} of ${MAX_ALLIANCE_PLAYERS} alliance slots used`}
              >
                {count}/{MAX_ALLIANCE_PLAYERS}
              </td>
              <td className={`${styles.powerCell} ${styles.powerValue}`}>{formatNumbers(power)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
