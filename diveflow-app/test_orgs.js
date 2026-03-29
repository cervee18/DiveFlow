const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://jsqjbnamfnwiesqkcmdp.supabase.co', 'sb_publishable_F3NB5T3kKIe_dMGT2ohIMQ_E-GS1sZt');

async function test() {
  const { data, error } = await supabase.from('organizations').select('*');
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
