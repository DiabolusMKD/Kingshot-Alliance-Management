'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navigation from '@/components/Navigation';
import { getKingdomCount } from '@/utils/kingdomService';
import { DEFAULT_ALLIANCE_IMAGE_URL } from '@/utils/constants';
import styles from './page.module.css';

const RESULTS_LIMIT = 5;

export default function Home() {
  const [kingdomCount, setKingdomCount] = useState(0);
  const [query, setQuery] = useState('');
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getKingdomCount()
      .then(setKingdomCount)
      .catch((error) => console.error('Failed to load kingdom count:', error));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsPopupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const matches = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const results: number[] = [];
    for (let id = 1; id <= kingdomCount; id++) {
      if (id.toString().includes(trimmed)) {
        results.push(id);
      }
    }
    return results;
  }, [kingdomCount, query]);

  const visibleMatches = showAll ? matches : matches.slice(0, RESULTS_LIMIT);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setShowAll(false);
    setIsPopupOpen(true);
  };

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <div className={styles.container} ref={containerRef}>
          <div className={styles.content}>
            <Image
              src={DEFAULT_ALLIANCE_IMAGE_URL}
              alt="Alliance Logo"
              className={styles.image}
              width={300}
              height={100}
            />
            <h1 className={styles.title}>Choose a Server</h1>
            <p className={styles.description}>
              Search for your kingdom by its number to view or create alliances
            </p>

            <div className={styles.searchWrapper}>
              <div className={styles.searchBar}>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.searchInput}
                  placeholder="Enter kingdom number..."
                  value={query}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setIsPopupOpen(true)}
                />
                <button
                  className={styles.searchButton}
                  onClick={() => setIsPopupOpen(true)}
                >
                  Search
                </button>
              </div>

              {isPopupOpen && query.trim() && (
                <div className={styles.popup}>
                  {matches.length === 0 ? (
                    <p className={styles.noResults}>No kingdoms found</p>
                  ) : (
                    <>
                      {visibleMatches.map((kingdomId) => (
                        <Link
                          key={kingdomId}
                          href={`/${kingdomId}`}
                          className={styles.resultItem}
                        >
                          Kingdom {kingdomId}
                        </Link>
                      ))}
                      {!showAll && matches.length > RESULTS_LIMIT && (
                        <button
                          className={styles.showMore}
                          onClick={() => setShowAll(true)}
                        >
                          Show more ({matches.length - RESULTS_LIMIT})
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
