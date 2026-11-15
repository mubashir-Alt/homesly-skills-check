// Loads hiring role packs (brief, Part A questions, take-home tasks, scorecard, follow-ups) into Supabase.
//   node scripts/import-roles.mjs                                   (every file in private-bank/roles)
//   node scripts/import-roles.mjs social-media-marketing-executive  (one role)
// The packs hold answers and the scorecard, so they live in private-bank/, which is never committed.
import { readdirSync, readFileSync } from "node:fs";
import { CONFIG } from "../assets/config.js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
if (!CONFIG.supabaseUrl || !env.IMPORT_TOKEN) { console.error("Missing supabaseUrl in assets/config.js or IMPORT_TOKEN in .env.local. Run scripts/set-import-token.mjs first."); process.exit(1); }

const ids = process.argv[2] ? [process.argv[2]] : readdirSync("private-bank/roles").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
for (const id of ids) {
  const role = JSON.parse(readFileSync(`private-bank/roles/${id}.json`, "utf8"));
  const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-import-token": env.IMPORT_TOKEN, apikey: CONFIG.supabaseAnonKey },
    body: JSON.stringify({ action: "import_role", role: { ...role, id: role.id || id } }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`${id}: ${out.error || res.status}`); process.exitCode = 1; continue; }
  console.log(`${id}: imported (${role.timed.questions.length} Part A questions, ${role.takehome.tasks.length} take-home tasks).`);
}
