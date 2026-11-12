'use client';

import { useRouter } from 'next/navigation';
import { Alliance } from '@/types';
import { getAllianceSlug } from '@/utils/allianceSlug';
import { formatNumbers } from '@/utils/formatNumbers';
import { MAX_ALLIANCE_PLAYERS } from '@/utils/constants';
import { AllianceStats } from '@/utils/playerService';
import AllianceAvatar from './AllianceAvatar';
import styles from './AllianceTable.module.css';

interface AllianceTableProps {
  alliances: Alliance[];
  kingdomId: number;
  getStats: (alliance: Alliance) => AllianceStats;
}

export default function AllianceTable({ alliances, kingdomId, getStats }: AllianceTableProps) {
  const router = useRouter();

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>No.</th>
            <th>Image</th>
            <th>Name</th>
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
