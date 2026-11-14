"use client";

import { useState } from "react";
import { BuildingAssignment, LegionBuildingData, Player } from "@/types";
import PlayerIdentity from "./PlayerIdentity";
import { PowerMode, getPlayerPower } from "@/utils/powerMode";
import styles from "./BuildingPreview.module.css";

type Legion = "legion1" | "legion2";

interface Props {
  title: string;
  legion: Legion;
  legionData: LegionBuildingData;
  BUILDINGS: string[];
  /** Which power is shown next to each player */
  powerMode: PowerMode;
}

const EMPTY_BUILDING: BuildingAssignment = { leader: null, support: [], manual: false };

interface RoleGroup {
  /** Omitted for lists without roles (Undercellars, Substitutes) */
  role?: string;
  players: Player[];
}

function PlayerRow({ player, powerMode }: { player: Player; powerMode: PowerMode }) {
  return (
    <div className={styles.playerRow}>
      <PlayerIdentity player={player} size={40} />
      <span className={styles.power}>{getPlayerPower(player, powerMode)}</span>
    </div>
  );
}

/** One card per building, stacked in a single column (styled like the player cards) */
export default function BuildingPreview({ title, legion, legionData, BUILDINGS, powerMode }: Props) {
  const safe = legionData ?? { buildings: {}, substitutes: [] };
  // Cards start collapsed; only the expanded ones are tracked
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const getTotal = (b: BuildingAssignment) => (b?.leader ? 1 : 0) + (b?.support?.length ?? 0);

  const cards: { name: string; count: number; groups: RoleGroup[] }[] = [
    ...BUILDINGS.map((name) => {
      const building = safe.buildings?.[name] ?? EMPTY_BUILDING;
      const leader = building.leader ? [building.leader] : [];
      const support = building.support ?? [];
      const groups: RoleGroup[] =
        name === "Undercellars"
          ? [{ players: [...leader, ...support] }]
          : [
              { role: "Leader", players: leader },
              { role: "Support", players: support },
            ];
      return { name, count: getTotal(building), groups };
    }),
    {
      name: "Substitutes",
      count: safe.substitutes?.length ?? 0,
      groups: [{ players: safe.substitutes ?? [] }],
    },
  ];

  return (
    <div className={styles.previewSection}>
      <div className={styles.sectionHeader}>
        <h4 className={styles.sectionTitle}>{title}</h4>
        <button
          type="button"
          className={styles.toggleAllButton}
          onClick={() =>
            setExpanded(
              expanded.size === cards.length ? new Set() : new Set(cards.map((c) => c.name)),
            )
          }
        >
          {expanded.size === cards.length ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <div className={styles.cardsColumn}>
        {cards.map((card) => {
          const isOpen = expanded.has(card.name);
          const bodyId = `${legion}-${card.name}-body`.replace(/\s+/g, "-");

          return (
            <div key={`${legion}-${card.name}`} className={styles.card}>
              <button
                type="button"
                className={`${styles.cardHeader} ${isOpen ? styles.cardHeaderOpen : ""}`}
                onClick={() => toggle(card.name)}
                aria-expanded={isOpen}
                aria-controls={bodyId}
              >
                <span
                  className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
                  aria-hidden="true"
                >
                  ▸
                </span>
                <span className={styles.cardTitle}>{card.name}</span>
                <span className={styles.count}>{card.count}</span>
              </button>

              {isOpen && (
                <div id={bodyId} className={styles.cardBody}>
                  {card.groups.map((group, index) => (
                    <div key={group.role ?? index} className={styles.roleGroup}>
                      {group.role && <span className={styles.role}>{group.role}</span>}
                      {group.players.length ? (
                        group.players.map((player) => (
                          <PlayerRow
                            key={`${legion}-${card.name}-${player.id}`}
                            player={player}
                            powerMode={powerMode}
                          />
                        ))
                      ) : (
                        <p className={styles.empty}>None</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
