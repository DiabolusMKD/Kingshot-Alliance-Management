import { AllianceEvent, LegionResultKey, SwordlandMvpType, SwordlandMvps } from '@/types';

/** Swordland's MVP awards: each legion (winner or loser) has one player per type */
export const SWORDLAND_MVP_TYPES: { value: SwordlandMvpType; label: string }[] = [
  { value: 'control', label: 'Control MVP' },
  { value: 'loot', label: 'Loot MVP' },
  { value: 'gathering', label: 'Gathering MVP' },
  { value: 'ko', label: 'KO MVP' },
];

export const getMvpTypeLabel = (type: SwordlandMvpType) =>
  SWORDLAND_MVP_TYPES.find((t) => t.value === type)?.label ?? 'MVP';

const COLUMN_TYPES: Record<SwordlandMvpType, string> = {
  control: 'Control',
  loot: 'Loot',
  gathering: 'Gathering',
  ko: 'Ko',
};

/** alliance_event column of a legion's MVP type, e.g. legion1KoMvp */
export const getMvpColumn = (legion: LegionResultKey, type: SwordlandMvpType) =>
  `legion${legion === 'legion_1' ? 1 : 2}${COLUMN_TYPES[type]}Mvp` as keyof AllianceEvent;

/** Every MVP column (for selects) */
export const SWORDLAND_MVP_COLUMNS = (['legion_1', 'legion_2'] as LegionResultKey[]).flatMap((legion) =>
  SWORDLAND_MVP_TYPES.map((t) => getMvpColumn(legion, t.value)),
);

/** A legion's MVPs saved on the event (player ids as strings) */
export function getEventMvps(event: Partial<AllianceEvent>, legion: LegionResultKey): SwordlandMvps {
  const mvps: SwordlandMvps = {};
  SWORDLAND_MVP_TYPES.forEach(({ value }) => {
    const id = event[getMvpColumn(legion, value)];
    if (id != null && id !== '') mvps[value] = String(id);
  });
  return mvps;
}

/** The MVP types a player won in a legion */
export const getPlayerMvpTypes = (mvps: SwordlandMvps | undefined, playerId: string | number) =>
  SWORDLAND_MVP_TYPES.filter((t) => mvps?.[t.value] != null && mvps[t.value] === String(playerId)).map(
    (t) => t.value,
  );
