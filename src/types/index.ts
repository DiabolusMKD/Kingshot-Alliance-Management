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
/** Swordland variant: standard (own alliance) or SLS - Swordland Summit League (whole kingdom) */
export type EventVariant = "standard" | "sls";

export interface AllianceEvent {
  id?: number;
  allianceId: number;
  eventId: number;
  startsAt?: string;
  rules?: string;
  status: EventStatus;
  /** Missing on rows created before the eventVariant column existed -> standard */
  eventVariant?: EventVariant;
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
  points?: number;
}

// Results of a completed event, stored as JSON in alliance_event.notes
export type LegionResultKey = "legion_1" | "legion_2";

export interface LegionResult {
  status: string | null; // "win" | "lose" (Swordland) or "1st" | "2nd" | "3rd" (Tri Alliance)
  mvp: string | null; // player id
  players_points: Record<string, number>[]; // [{ [playerId]: points }]
}

export type EventResults = Record<LegionResultKey, LegionResult>;

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

// Gift codes
export type GiftCodeStatus = "active" | "inactive";

export interface GiftCode {
  id: number;
  code: string;
  status: GiftCodeStatus;
  expires_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface GiftCodeRedemption {
  id: number;
  giftCodeId: number;
  playerId: number; // player.id (NOT the in-game player.playerId)
  status: "redeemed" | null;
  reason: string | null;
  redeemed_at: string | null;
  last_attempt_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Result of redeeming one code for one player (see /api/gift-codes/redemptions) */
export interface GiftCodeRedeemResult {
  giftCodeId: number;
  outcome: "redeemed" | "failed" | "retry";
  reason: string | null; // e.g. RECEIVED, TIME_ERROR, CDK_NOT_FOUND, RATE_LIMITED
}
