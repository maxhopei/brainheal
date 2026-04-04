import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string;
const supabaseKey = (import.meta.env['VITE_SUPABASE_ANON_KEY'] ??
  import.meta.env['VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY']) as string;

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable.');
}
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase publishable key. ' +
      'Ensure either VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY or VITE_SUPABASE_ANON_KEY are set.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'brainheal-auth',
  },
});
