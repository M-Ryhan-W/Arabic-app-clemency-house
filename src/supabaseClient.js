import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://efpanaidmaztxszshlmp.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_wLFCI-Za0kAAUhEgDiWu7Q_-418Yfzj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
