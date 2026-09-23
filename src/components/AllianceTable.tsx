'use client';

import { useRouter } from 'next/navigation';
import { Alliance } from '@/types';
import { getAllianceSlug } from '@/utils/allianceSlug';
import AllianceAvatar from './AllianceAvatar';
import styles from './AllianceTable.module.css';

interface AllianceTableProps {
  alliances: Alliance[];
  kingdomId: number;
}

export default function AllianceTable({ alliances, kingdomId }: AllianceTableProps) {
  const router = useRouter();

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>No.</th>
            <th>Image</th>
            <th>Name</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {alliances.map((alliance, index) => (
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
              <td className={styles.descriptionCell} title={alliance.description || undefined}>
                {alliance.description || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
