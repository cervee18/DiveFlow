require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testFetch() {
  // Grab ANY random user from profiles
  const { data: users, error: fErr } = await supabase.from('profiles').select('id, email, first_name').limit(1);
  if (fErr || !users || users.length === 0) return console.log("Profile fetch failed:", fErr);
  
  console.log("Testing user:", users[0]);
  
  // Try the RPC acting as service_role... wait, service_role bypasses auth.uid() so auth.uid() is NULL!
  // If the RPC relies on auth.uid() being NOT NULL, the RPC will intentionally RAISE EXCEPTION 'Not authenticated' !
  // Let's test the RPC directly using standard RPC call.
  const { data, error } = await supabase.rpc('get_global_passport', {
    p_user_id: users[0].id
  });
  console.log("RPC Error:", error);
  console.log("RPC Data:", data);
}

testFetch();
