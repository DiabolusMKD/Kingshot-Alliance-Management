'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAlliancesByKingdomId } from '@/utils/allianceService';
import { findAllianceBySlug } from '@/utils/allianceSlug';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import styles from './Breadcrumbs.module.css';

interface Crumb {
  label: string;
  /** Omitted for the current page and for path segments without a page of their own */
  href?: string;
}

// Static path segments -> label; `hasPage: false` segments render as plain text
const SEGMENT_LABELS: Record<string, { label: string; hasPage?: boolean }> = {
  players: { label: 'Players' },
  events: { label: 'Events' },
  swordland: { label: 'Swordland' },
  'tri-alliance': { label: 'Tri Alliance' },
  'gift-codes': { label: 'Gift Codes' },
  'no-alliance': { label: 'Without Alliance', hasPage: false },
};

const isAllianceSlug = (segment: string) => segment.startsWith('alliance');

/**
 * Trail derived from the URL: Home / Kingdom 1010 / [TAG]Alliance / Players.
 * Render it as the first child of a page's `.container` so it lines up with the content.
 * Hidden on the homepage.
 */
export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const [kingdomSegment, allianceSegment] = segments;

  // Alliance crumbs show the real "[TAG]Name", looked up from the slug
  const [allianceLabel, setAllianceLabel] = useState<{ slug: string; label: string } | null>(null);
  useEffect(() => {
    if (!kingdomSegment || !allianceSegment || !isAllianceSlug(allianceSegment)) return;
    let isMounted = true;
    getAlliancesByKingdomId(Number(kingdomSegment))
      .then((alliances) => {
        const alliance = findAllianceBySlug(alliances, allianceSegment);
        if (isMounted && alliance) setAllianceLabel({ slug: allianceSegment, label: formatAllianceLabel(alliance) });
      })
      .catch(() => {
        // Keep the generic "Alliance" label
      });
    return () => {
      isMounted = false;
    };
  }, [kingdomSegment, allianceSegment]);

  if (segments.length === 0) return null;

  const crumbs: Crumb[] = [{ label: 'Home', href: '/' }];
  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    let label: string;
    let hasPage = true;

    if (index === 0) {
      label = `Kingdom ${segment}`;
    } else if (index === 1 && isAllianceSlug(segment)) {
      label = allianceLabel?.slug === segment ? allianceLabel.label : 'Alliance';
    } else {
      const known = SEGMENT_LABELS[segment];
      label = known?.label ?? decodeURIComponent(segment);
      hasPage = known?.hasPage ?? true;
    }

    const isLast = index === segments.length - 1;
    crumbs.push({ label, href: isLast || !hasPage ? undefined : href });
  });

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
      <ol className={styles.list}>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${index}-${crumb.label}`} className={styles.item}>
              {crumb.href ? (
                <Link href={crumb.href} className={styles.link}>
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? styles.current : styles.text} aria-current={isLast ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
              {!isLast && (
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
