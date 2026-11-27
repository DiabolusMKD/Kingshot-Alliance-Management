'use client';

import { use, useEffect, useMemo, useState } from 'react';
import GiftCodesManager from '@/components/GiftCodesManager';
import { useCanRule } from '@/components/EditMode';
import { Alliance, Player } from '@/types';
import { getAlliancesByKingdomId } from '@/utils/allianceService';
import { formatAllianceLabel } from '@/utils/allianceLabel';
import { getJail } from '@/utils/jailService';
import { getAllKingdomPlayers } from '@/utils/playerService';
import styles from './page.module.css';

interface KingdomGiftCodesPageProps {
  params: Promise<{ kingdomId: string }>;
}

/** Key for players without an alliance in the alliance checklist */
const NO_ALLIANCE = 'none';
const allianceKey = (player: Player) => (player.allianceId != null ? String(player.allianceId) : NO_ALLIANCE);

/**
 * Gift codes for the whole kingdom (King of the kingdom or god): every player, or only the
 * chosen alliances, minus jailed offenders and hand-picked exclusions when asked.
 */
export default function KingdomGiftCodesPage({ params }: KingdomGiftCodesPageProps) {
  const { kingdomId } = use(params);
  const kingdomIdNumber = Number(kingdomId);
  const canRule = useCanRule(kingdomIdNumber);

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [jailedIds, setJailedIds] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<'kingdom' | 'alliances'>('kingdom');
  const [selectedAlliances, setSelectedAlliances] = useState<Set<string>>(new Set());
  const [excludeOffenders, setExcludeOffenders] = useState(false);
  const [excludePlayers, setExcludePlayers] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getAlliancesByKingdomId(kingdomIdNumber).catch((): Alliance[] => []),
      getJail(kingdomIdNumber).catch((error) => {
        console.error('Failed to load the jail:', error);
        return [];
      }),
    ]).then(([kingdomAlliances, jail]) => {
      if (!isMounted) return;
      setAlliances([...kingdomAlliances].sort((a, b) => a.name.localeCompare(b.name)));
      setJailedIds(new Set(jail.map((entry) => String(entry.playerId))));
    });
    return () => {
      isMounted = false;
    };
  }, [kingdomIdNumber]);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const playerFilter = useMemo(() => {
    const inScope = (player: Player) => scope === 'kingdom' || selectedAlliances.has(allianceKey(player));

    return {
      apply: (all: Player[]) =>
        all.filter(
          (p) =>
            inScope(p) &&
            !(excludeOffenders && jailedIds.has(String(p.id))) &&
            !(excludePlayers && excludedIds.has(String(p.id)))
        ),

      render: (all: Player[], disabled: boolean) => {
        if (!canRule) return null;
        const counts = new Map<string, number>();
        for (const p of all) counts.set(allianceKey(p), (counts.get(allianceKey(p)) ?? 0) + 1);

        const term = search.trim().toLowerCase();
        const candidates = all
          .filter(inScope)
          .filter((p) => !term || `${p.aliasName} ${p.name} ${p.playerId}`.toLowerCase().includes(term));
        const allianceTag = new Map(alliances.map((a) => [String(a.id), a.nameTag]));

        return (
          <fieldset className={styles.filter} disabled={disabled}>
            <legend className={styles.legend}>Redeem for</legend>

            <div className={styles.scopeOptions}>
              <label className={styles.option}>
                <input type="radio" name="scope" checked={scope === 'kingdom'} onChange={() => setScope('kingdom')} />
                Whole kingdom ({all.length})
              </label>
              <label className={styles.option}>
                <input type="radio" name="scope" checked={scope === 'alliances'} onChange={() => setScope('alliances')} />
                Selected alliances
              </label>
            </div>

            {scope === 'alliances' && (
              <div className={styles.allianceList}>
                {[...alliances.map((a) => ({ key: String(a.id), label: formatAllianceLabel(a) })), { key: NO_ALLIANCE, label: 'Without an alliance' }].map(
                  ({ key, label }) => (
                    <label key={key} className={styles.option}>
                      <input
                        type="checkbox"
                        checked={selectedAlliances.has(key)}
                        onChange={() => setSelectedAlliances((prev) => toggle(prev, key))}
                      />
                      {label} <span className={styles.count}>({counts.get(key) ?? 0})</span>
                    </label>
                  )
                )}
              </div>
            )}

            <label className={styles.option}>
              <input type="checkbox" checked={excludeOffenders} onChange={(e) => setExcludeOffenders(e.target.checked)} />
              Exclude jailed offenders <span className={styles.count}>({jailedIds.size})</span>
            </label>

            <label className={styles.option}>
              <input type="checkbox" checked={excludePlayers} onChange={(e) => setExcludePlayers(e.target.checked)} />
              Exclude players
              {excludedIds.size > 0 && <span className={styles.count}>({excludedIds.size} selected)</span>}
            </label>

            {excludePlayers && (
              <div className={styles.excludePanel}>
                <input
                  type="search"
                  className={styles.search}
                  placeholder="Search by name or player ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <ul className={styles.playerList}>
                  {candidates.map((p) => {
                    const tag = p.allianceId != null ? allianceTag.get(String(p.allianceId)) : undefined;
                    return (
                      <li key={p.id}>
                        <label className={styles.option}>
                          <input
                            type="checkbox"
                            checked={excludedIds.has(String(p.id))}
                            onChange={() => setExcludedIds((prev) => toggle(prev, String(p.id)))}
                          />
                          {tag && <span className={styles.tag}>[{tag}]</span>}
                          {p.aliasName || p.name}
                          {jailedIds.has(String(p.id)) && <span className={styles.jailed}>In jail</span>}
                        </label>
                      </li>
                    );
                  })}
                  {candidates.length === 0 && <li className={styles.count}>No players match.</li>}
                </ul>
              </div>
            )}
          </fieldset>
        );
      },
    };
  }, [canRule, scope, selectedAlliances, excludeOffenders, excludePlayers, excludedIds, search, jailedIds, alliances]);

  return (
    <GiftCodesManager
      loadPlayers={() => getAllKingdomPlayers(kingdomIdNumber)}
      loadKey={`kingdom:${kingdomIdNumber}`}
      groupLabel={`Kingdom ${kingdomId}`}
      emptyPlayersText={
        scope === 'alliances' && selectedAlliances.size === 0
          ? 'Select at least one alliance.'
          : 'No players to redeem for.'
      }
      canRedeem={canRule}
      playerFilter={playerFilter}
    />
  );
}
