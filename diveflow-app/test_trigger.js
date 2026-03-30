import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTrigger() {
  // Query to check if the trigger exists on auth.users
  const { data, error } = await supabase.rpc('search_global_identities', { p_query: 'test' });
  console.log('API is alive:', !error);
}

checkTrigger();
