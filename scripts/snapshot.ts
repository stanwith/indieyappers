/**
 * Produce data/deploy-snapshot.db: a copy of the local database with
 * secrets stripped (OAuth tokens, sessions). This file is committed and
 * bundled into the Vercel deployment, where it seeds /tmp at cold start.
 * Run via `npm run snapshot` (automatically run before `vercel deploy`).
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const SRC = path.join(process.cwd(), "data", "yapper.db");
const OUT = path.join(process.cwd(), "data", "deploy-snapshot.db");

if (!fs.existsSync(SRC)) {
  console.error("No local database at data/yapper.db - run refresh or mock first.");
  process.exit(1);
}

fs.rmSync(OUT, { force: true });

// VACUUM INTO snapshots through the WAL, unlike a raw file copy.
const src = new Database(SRC, { readonly: true });
src.exec(`VACUUM INTO '${OUT.replace(/'/g, "''")}'`);
src.close();

const db = new Database(OUT);
db.exec(`
  UPDATE founders SET oauth_access_token = NULL, oauth_refresh_token = NULL;
  DELETE FROM sessions;
`);
db.exec("VACUUM");
db.close();

console.log(`Wrote scrubbed snapshot to ${OUT}`);
