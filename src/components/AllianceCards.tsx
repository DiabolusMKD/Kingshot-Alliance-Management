'use client';

import Link from 'next/link';
import { Alliance } from '@/types';
import { getAllianceSlug } from '@/utils/allianceSlug';
import AllianceAvatar from './AllianceAvatar';
import styles from './AllianceCards.module.css';

interface AllianceCardsProps {
  alliances: Alliance[];
  kingdomId: number;
}

export default function AllianceCards({ alliances, kingdomId }: AllianceCardsProps) {
  return (
    <div className={styles.grid}>
      {alliances.map((alliance) => (
        <Link
          key={alliance.id}
          href={`/${kingdomId}/${getAllianceSlug(alliance.id)}`}
          className={styles.card}
        >
          <AllianceAvatar alliance={alliance} className={styles.image} />
          <div className={styles.info}>
            <h3 className={styles.name}>{alliance.name}</h3>
            <p className={styles.tag}>[{alliance.nameTag}]</p>
            {alliance.description && <p className={styles.description}>{alliance.description}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}
