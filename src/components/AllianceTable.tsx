'use client';

import { useRouter } from 'next/navigation';
import { Alliance } from '@/types';
import { getAllianceSlug } from '@/utils/allianceSlug';
import AllianceAvatar from './AllianceAvatar';
import styles from './AllianceTable.module.css';

interface AllianceTableProps {
  alliances: Alliance[];
  kingdomId: number;
  onEdit: (alliance: Alliance) => void;
}

export default function AllianceTable({ alliances, kingdomId, onEdit }: AllianceTableProps) {
  const router = useRouter();

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>No.</th>
            <th>Image</th>
            <th>Name</th>
            <th>Tag</th>
            <th>Description</th>
            <th>
              <span className={styles.visuallyHidden}>Actions</span>
            </th>
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
              <td>{alliance.name}</td>
              <td>{alliance.nameTag}</td>
              <td>{alliance.description || '—'}</td>
              <td>
                <button
                  className={styles.editButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(alliance);
                  }}
                  title="Edit alliance"
                >
                  ✎
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
