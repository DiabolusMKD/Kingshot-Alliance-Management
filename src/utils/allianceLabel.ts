import { Alliance } from '@/types';

export function formatAllianceLabel(alliance: Alliance): string {
  return `[${alliance.nameTag}]${alliance.name}`;
}
