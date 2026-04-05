import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split(/\r?\n/).forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl) throw new Error('Missing URL');

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("URL:", supabaseUrl);
  console.log("Testing search_global_identities...");
  const { data: searchData, error: searchError } = await supabase.rpc("search_global_identities", { p_query: "a" });
  if (searchError) {
    console.error("Search Error:", searchError.message);
  } else {
    console.log("Search Success. Rows:", searchData?.length);
  }

  console.log("Testing profiles schema...");
  const { data: profData, error: profError } = await supabase.from('profiles').select('*').limit(1);
  if (profData && profData.length > 0) {
    console.log("Profiles columns:", Object.keys(profData[0]).join(', '));
  } else if (profError) {
    console.error("Profiles Error:", profError.message);
  }
}

run();
