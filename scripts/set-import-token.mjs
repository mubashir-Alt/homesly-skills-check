// Creates the secret that lets the import script (and the Friday refresh) load the question bank.
// Run once, after linking the Supabase project:   node scripts/set-import-token.mjs
// It saves the token in .env.local (never committed) and sets it on Supabase. The token is not printed.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { CONFIG } from "../assets/config.js";

if (!CONFIG.supabaseUrl) { console.error("Fill in assets/config.js (supabaseUrl) first."); process.exit(1); }
const token = randomBytes(32).toString("hex");
const env = existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("IMPORT_TOKEN=")) : [];
env.push(`IMPORT_TOKEN=${token}`);
writeFileSync(".env.local", env.join("\n") + "\n");
execSync(`npx --yes supabase@2 secrets set IMPORT_TOKEN=${token}`, { stdio: ["ignore", "ignore", "inherit"] });
console.log("Import token created, saved in .env.local and set on Supabase.");
