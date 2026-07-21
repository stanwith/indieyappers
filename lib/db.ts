import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { SeedFounder } from "./types";

const DB_PATH = path.join(process.cwd(), "data", "yapper.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  seedFounders(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS founders (
      handle TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      product TEXT NOT NULL,
      tier INTEGER NOT NULL,
      tier_label TEXT NOT NULL,
      approx_followers INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      x_user_id TEXT,
      avatar_url TEXT,
      followers INTEGER,
      lifetime_tweet_count INTEGER,
      profile_updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT NOT NULL REFERENCES founders(handle),
      captured_at TEXT NOT NULL,
      followers INTEGER,
      lifetime_tweet_count INTEGER,
      posts_7d_original INTEGER NOT NULL DEFAULT 0,
      posts_7d_reply INTEGER NOT NULL DEFAULT 0,
      posts_7d_retweet INTEGER NOT NULL DEFAULT 0,
      posts_30d_original INTEGER NOT NULL DEFAULT 0,
      posts_30d_reply INTEGER NOT NULL DEFAULT 0,
      posts_30d_retweet INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_handle_time
      ON activity_snapshots (handle, captured_at DESC);
  `);

  // Company enrichment columns (context.dev brand data), added idempotently.
  for (const col of [
    "company_domain TEXT",
    "company_logo TEXT",
    "company_desc TEXT",
  ]) {
    try {
      db.exec(`ALTER TABLE founders ADD COLUMN ${col}`);
    } catch {
      /* column already exists */
    }
  }

  // Engagement metrics per snapshot, added idempotently.
  for (const col of [
    "interactions_7d INTEGER NOT NULL DEFAULT 0",
    "interactions_30d INTEGER NOT NULL DEFAULT 0",
    "impressions_7d INTEGER NOT NULL DEFAULT 0",
    "impressions_30d INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      db.exec(`ALTER TABLE activity_snapshots ADD COLUMN ${col}`);
    } catch {
      /* column already exists */
    }
  }
}

/** Upsert seed founders so new spreadsheet rows appear after a restart. */
function seedFounders(db: Database.Database) {
  const seedPath = path.join(process.cwd(), "data", "founders.json");
  const seed: SeedFounder[] = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const upsert = db.prepare(`
    INSERT INTO founders (handle, name, product, tier, tier_label, approx_followers, notes)
    VALUES (@handle, @name, @product, @tier, @tierLabel, @approxFollowers, @notes)
    ON CONFLICT(handle) DO UPDATE SET
      name = excluded.name,
      product = excluded.product,
      tier = excluded.tier,
      tier_label = excluded.tier_label,
      approx_followers = excluded.approx_followers,
      notes = excluded.notes
  `);
  const tx = db.transaction((rows: SeedFounder[]) => {
    for (const row of rows) upsert.run(row);
  });
  tx(seed);
}
