import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client using the service_role key, which bypasses RLS.
// Only import this from API routes / server code. Never from client components.

let adminClient: SupabaseClient | null = null;

/** Returns null when SUPABASE_SERVICE_ROLE_KEY is not configured (or when called in the browser). */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof window !== 'undefined' || !url || !serviceKey) return null;

  adminClient ??= createClient(url, serviceKey, { auth: { persistSession: false } });
  return adminClient;
}
