// The kingdom Jail: the King can put up to six offenders in it, one per trial.
// Shared by the client (Jail page, gift codes) and the API route that writes it.

export const JAIL_TRIALS = [
  {
    id: 'avarice',
    name: 'Avarice Trial',
    effects: ['Construction Speed -10.00%', 'Research Speed -10.00%', 'Training Speed -10.00%'],
  },
  { id: 'arrogance', name: 'Arrogance Trial', effects: ['Resource Production -40.00%'] },
  { id: 'melancholy', name: 'Melancholy Trial', effects: ['Healing Speed -50.00%', 'Infirmary Capacity -2,500'] },
  { id: 'timidity', name: 'Timidity Trial', effects: ["Appointment-based Squads' Lethality -5.00%"] },
  {
    id: 'domination',
    name: 'Domination Trial',
    effects: ["Appointment-based Squads' Attack -2.00%", 'Troops Deployment Capacity -1,500'],
  },
  { id: 'indolence', name: 'Indolence Trial', effects: ['Training Speed -25.00%', 'Training Capacity -100'] },
] as const;

export type JailTrial = (typeof JAIL_TRIALS)[number]['id'];

export const MAX_OFFENDERS = JAIL_TRIALS.length;

export const isJailTrial = (value: unknown): value is JailTrial =>
  typeof value === 'string' && JAIL_TRIALS.some((t) => t.id === value);
