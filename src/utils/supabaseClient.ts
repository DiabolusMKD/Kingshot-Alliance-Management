import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// In the browser, go through the /supabase rewrite in next.config.ts (same origin, no CORS)
const clientUrl =
  typeof window !== 'undefined' ? `${window.location.origin}/supabase` : supabaseUrl;

export const supabase = createClient(clientUrl, supabaseKey);
