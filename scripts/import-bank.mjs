// Loads the private question banks and study notes into Supabase.
//   node scripts/import-bank.mjs            (both people)
//   node scripts/import-bank.mjs harshith   (one person)
// Reads private-bank/<emp>-questions.json and <emp>-kb.json, which are never committed to GitHub.
import { existsSync, readFileSync } from "node:fs";
import { CONFIG } from "../assets/config.js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (!CONFIG.supabaseUrl || !env.IMPORT_TOKEN) { console.error("Missing supabaseUrl in assets/config.js or IMPORT_TOKEN in .env.local. Run scripts/set-import-token.mjs first."); process.exit(1); }

const emps = process.argv[2] ? [process.argv[2]] : ["harshith", "sai"];
for (const emp of emps) {
  const questions = JSON.parse(readFileSync(`private-bank/${emp}-questions.json`, "utf8"));
  const kb = JSON.parse(readFileSync(`private-bank/${emp}-kb.json`, "utf8"));
  const bookPath = `private-bank/${emp}-textbook.json`;
  const textbook = existsSync(bookPath) ? JSON.parse(readFileSync(bookPath, "utf8")) : undefined;
  const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-import-token": env.IMPORT_TOKEN, apikey: CONFIG.supabaseAnonKey },
    body: JSON.stringify({ action: "import", emp, questions, sites: kb.sites, weeks: kb.weeks || [], textbook }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`${emp}: ${out.error || res.status}`); process.exitCode = 1; continue; }
  console.log(`${emp}: ${out.weeks} work weeks, ${out.questions} questions, ${out.facts} facts, ${out.sites} sites, ${out.textbookChapters} textbook chapters imported.`);
}
