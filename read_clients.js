const fs = require('fs');
const lines = fs.readFileSync('supabase/schemas/schema.sql', 'utf8').split('\n');
let res = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('CREATE TABLE IF NOT EXISTS "public"."clients"')) {
    for (let j = 0; j < 30; j++) {
      if (lines[i+j].includes(');')) {
         res.push(lines[i+j]);
         break;
      }
      res.push(lines[i+j].trim());
    }
    break;
  }
}
fs.writeFileSync('client_schema.txt', res.join('\n'));
