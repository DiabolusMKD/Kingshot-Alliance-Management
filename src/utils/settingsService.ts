import { supabase } from './supabaseClient';
import { getSupabaseAdmin } from './supabaseAdmin';

// Reads/writes rows in the `app_settings` table (see supabase/app_settings.sql).
// Reads use the public anon client. Writes are blocked by RLS for anon, so they
// need SUPABASE_SERVICE_ROLE_KEY. That key is server-only: never import
// `setSetting` from client components.

export const SETTING_KEYS = {
  kingshotRedeemActionId: 'kingshot_redeem_action_id',
} as const;

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`[settings] Failed to read "${key}":`, error.message);
    return null;
  }
  return (data?.value as T) ?? null;
}

/** Returns false (without throwing) when no service role key is configured or the write fails. */
export async function setSetting(key: string, value: unknown): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn(`[settings] SUPABASE_SERVICE_ROLE_KEY not set; cannot persist "${key}"`);
    return false;
  }

  const { error } = await admin.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) {
    console.error(`[settings] Failed to write "${key}":`, error.message);
    return false;
  }
  return true;
}
