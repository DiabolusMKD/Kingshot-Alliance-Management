'use client';

import { GiftCode, GiftCodeRedemption, GiftCodeRedeemResult } from '@/types';
import { supabase } from './supabaseClient';

// Reads go straight to Supabase (anon, read-only). Anything that changes data goes
// through our API routes, which talk to kingshot.net / Century Games and write with
// the service role.

/** Codes that fail for everyone once one player hits them (expired, unknown, used up). */
export const DEAD_CODE_REASONS = new Set(['TIME_ERROR', 'CDK_NOT_FOUND', 'USED']);

async function apiJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status !== 'success') {
    throw new Error(body?.error || `Request failed (HTTP ${res.status})`);
  }
  return body.data as T;
}

/** Fallback when syncing with kingshot.net fails: show what we already have. */
export async function getActiveGiftCodes(): Promise<GiftCode[]> {
  const { data, error } = await supabase
    .from('gift_code')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch gift codes: ${error.message}`);
  return data ?? [];
}

/** Mirror kingshot.net's active codes into the database and return them. */
export async function syncGiftCodes(): Promise<GiftCode[]> {
  return apiJson<GiftCode[]>(await fetch('/api/gift-codes/sync', { method: 'POST' }));
}

export async function getRedemptions(giftCodeIds: number[], playerIds: number[]): Promise<GiftCodeRedemption[]> {
  if (giftCodeIds.length === 0 || playerIds.length === 0) return [];
  const { data, error } = await supabase
    .from('gift_code_redemption')
    .select('*')
    .in('giftCodeId', giftCodeIds)
    .in('playerId', playerIds);
  if (error) throw new Error(`Failed to fetch redemptions: ${error.message}`);
  return data ?? [];
}

/** Redeem the given codes for one player. Results are recorded server-side. */
export async function redeemCodesForPlayer(playerId: number, giftCodeIds: number[]): Promise<GiftCodeRedeemResult[]> {
  return apiJson(
    await fetch('/api/gift-codes/redemptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, giftCodeIds }),
    })
  );
}

// Keys are Century Games messages normalized by the server ("TIME ERROR." -> TIME_ERROR)
const REASON_LABELS: Record<string, string> = {
  RECEIVED: 'Already redeemed',
  SAME_TYPE_EXCHANGE: 'Already redeemed (same type)',
  TIME_ERROR: 'Code expired',
  CDK_NOT_FOUND: 'Code not found',
  USED: 'Code usage limit reached',
  ROLE_NOT_EXIST: 'Player not found',
  KINGDOM_REQUIRED: 'Player has no kingdom set',
  TIMEOUT_RETRY: 'Game server busy, try again',
  RATE_LIMITED: 'Rate limited, try again later',
  SERVICE_UNAVAILABLE: 'Game server unavailable',
  CODE_INACTIVE: 'Code no longer active',
  SKIPPED_DEAD_CODE: 'Skipped (code not redeemable)',
};

export function describeRedemptionReason(reason: string | null | undefined): string {
  if (!reason) return 'Failed';
  return REASON_LABELS[reason] ?? reason;
}
