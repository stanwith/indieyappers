import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { SeedFounder } from "./types";

let db: Database.Database | null = null;

/**
 * Locally the database lives in data/yapper.db. On Vercel the filesystem is
 * read-only, so the committed scrubbed snapshot is copied to /tmp at cold
 * start; writes (sessions, sign-ups) persist per instance until it recycles.
 */
function resolveDbPath(): string {
  const localPath = path.join(process.cwd(), "data", "yapper.db");
  if (!process.env.VERCEL) return localPath;

  const tmpPath = "/tmp/yapper.db";
  if (!fs.existsSync(tmpPath)) {
    const snapshot = path.join(process.cwd(), "data", "deploy-snapshot.db");
    if (fs.existsSync(snapshot)) fs.copyFileSync(snapshot, tmpPath);
  }
  return tmpPath;
}

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      handle TEXT NOT NULL REFERENCES founders(handle),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS top_tweets (
      handle TEXT NOT NULL REFERENCES founders(handle),
      tweet_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      retweets INTEGER NOT NULL DEFAULT 0,
      replies INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (handle, tweet_id)
    );

    -- Every fetched post from the last ~31 days. The refresh script fetches
    -- incrementally (since_id) and computes all window aggregates from here.
    CREATE TABLE IF NOT EXISTS tweets (
      tweet_id TEXT PRIMARY KEY,
      handle TEXT NOT NULL REFERENCES founders(handle),
      kind TEXT NOT NULL CHECK (kind IN ('original', 'reply', 'retweet')),
      text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      retweets INTEGER NOT NULL DEFAULT 0,
      replies INTEGER NOT NULL DEFAULT 0,
      quotes INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_tweets_handle_time
      ON tweets (handle, created_at DESC);
  `);

  try {
    db.exec("ALTER TABLE founders ADD COLUMN banner_url TEXT");
  } catch {
    /* column already exists */
  }

  // Marks accounts that joined by signing in with X (vs the curated seed),
  // plus their OAuth tokens (offline.access grants a refresh token).
  for (const col of [
    "joined_via_x INTEGER NOT NULL DEFAULT 0",
    "oauth_access_token TEXT",
    "oauth_refresh_token TEXT",
  ]) {
    try {
      db.exec(`ALTER TABLE founders ADD COLUMN ${col}`);
    } catch {
      /* column already exists */
    }
  }

  // When the refresh last *successfully* fetched this handle's posts. Without
  // it a failed fetch is indistinguishable from "posted nothing", and the
  // resulting zero gets published and ranked as if it were real.
  try {
    db.exec("ALTER TABLE founders ADD COLUMN tweets_fetched_at TEXT");
  } catch {
    /* column already exists */
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
  // Curated founders dropped from the spreadsheet (or corrected to a different
  // handle) have to leave the database too, or the old row lingers forever with
  // its stale numbers. Sign-ups are exempt: they were never in the seed.
  // Dependents are deleted explicitly because foreign keys aren't enforced.
  const placeholders = seed.map(() => "?").join(",");
  const handles = seed.map((row) => row.handle);
  const tx = db.transaction((rows: SeedFounder[]) => {
    for (const row of rows) upsert.run(row);
    for (const table of ["tweets", "activity_snapshots", "top_tweets"]) {
      db.prepare(
        `DELETE FROM ${table} WHERE handle IN (
           SELECT handle FROM founders
           WHERE joined_via_x = 0 AND handle NOT IN (${placeholders}))`
      ).run(...handles);
    }
    db.prepare(
      `DELETE FROM founders
       WHERE joined_via_x = 0 AND handle NOT IN (${placeholders})`
    ).run(...handles);
  });
  tx(seed);
}
