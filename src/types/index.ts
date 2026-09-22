export interface Kingdom {
  id: number;
  created_at?: string;
}

export interface Alliance {
  id: number;
  name: string;
  nameTag: string;
  description?: string | null;
  allianceImageUrl?: string | null;
  kingdomId: number;
  created_at?: string;
}

export interface Player {
  id: string; // UUID from Supabase
  playerId: string;
  name: string;
  aliasName: string;
  swordlandPower: number;
  trialliancePower: number;
  power: number;
  allianceId?: string | null; // Set to NULL when removing from alliance
  level?: number;
  levelRendered?: string;
  levelRenderedDetailed?: string;
  levelImage?: string;
  profilePhoto?: string;
  marchSize?: number;
  numberOfMarches?: number;
  kingdomId: number;
  created_at?: string;
  updated_at?: string;
}

export interface Legion {
  none: Player[];
  legion1: Player[];
  legion2: Player[];
  substituteLegion1: Player[];
  substituteLegion2: Player[];
}

export interface AllianceLegion {
  none: Player[];
  legion1: Player[];
  legion2: Player[];
}

// Event Management Types
export type EventType = "swordland" | "tri-alliance";
export type EventStatus = "not-started" | "ongoing" | "completed";

export interface AllianceEvent {
  id?: number;
  allianceId: number;
  eventId: number;
  startsAt?: string;
  rules?: string;
  status: EventStatus;
  notes?: string;
  assignments?: string; // JSON string of assignments
  createdAt?: string;
  updatedAt?: string;
}

export interface EventPlayer {
  id?: number;
  playerId: number;
  didShowUp?: boolean;
  score?: number;
  notes?: string;
  alliance_event_id: number;
  createdAt?: string;
  updatedAt?: string;
}

// Assignment structure for storing legion assignments
export interface PlayerAssignment {
  playerId: string;
  legion: string; // 'legion1', 'legion2', 'building1', 'building2', etc.
  name: string;
  power: number;
  triAlliancePower?: number;
  swordlandPower?: number;
}

export interface EventAssignments {
  eventType: EventType;
  eventId?: number;
  assignments: PlayerAssignment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BuildingAssignment {
  leader: Player | null;
  support: Player[];
  manual: boolean;
}
export interface LegionBuildingData {
  buildings: Record<string, BuildingAssignment>;
  substitutes: Player[];
}
