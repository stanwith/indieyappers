/**
 * Shared Postgres store for the dynamic data that must survive serverless
 * instances: sessions and sign-ups from Sign in with X. Activated when
 * DATABASE_URL (or POSTGRES_URL) is set; otherwise the app falls back to
 * local SQLite, which is fine for development.
 */
import { Pool } from "pg";

export interface JoinedMetrics {
  posts_7d_original: number;
  posts_7d_reply: number;
  posts_7d_retweet: number;
  posts_30d_original: number;
  posts_30d_reply: number;
  posts_30d_retweet: number;
  interactions_7d: number;
  interactions_30d: number;
  impressions_7d: number;
  impressions_30d: number;
}

export interface JoinedFounder extends JoinedMetrics {
  handle: string;
  name: string;
  x_user_id: string;
  avatar_url: string | null;
  banner_url: string | null;
  followers: number | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  metrics_updated_at: string | null;
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function pgConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
      max: 3,
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  schemaReady ??= getPool()
    .query(
      `CREATE TABLE IF NOT EXISTS sessions (
         token TEXT PRIMARY KEY,
         handle TEXT NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       );
       CREATE TABLE IF NOT EXISTS joined_founders (
         handle TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         x_user_id TEXT NOT NULL,
         avatar_url TEXT,
         followers INTEGER,
         oauth_access_token TEXT,
         oauth_refresh_token TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       );
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS banner_url TEXT;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS posts_7d_original INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS posts_7d_reply INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS posts_7d_retweet INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS posts_30d_original INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS posts_30d_reply INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS posts_30d_retweet INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS interactions_7d INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS interactions_30d INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS impressions_7d INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS impressions_30d INTEGER NOT NULL DEFAULT 0;
       ALTER TABLE joined_founders ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ;`
    )
    .then(() => undefined);
  await schemaReady;
}

export async function pgCreateSession(token: string, handle: string) {
  await ensureSchema();
  await getPool().query(
    "INSERT INTO sessions (token, handle) VALUES ($1, $2) ON CONFLICT (token) DO NOTHING",
    [token, handle]
  );
}

export async function pgDestroySession(token: string) {
  await ensureSchema();
  await getPool().query("DELETE FROM sessions WHERE token = $1", [token]);
}

export async function pgSessionHandle(token: string): Promise<string | null> {
  await ensureSchema();
  const res = await getPool().query<{ handle: string }>(
    "SELECT handle FROM sessions WHERE token = $1",
    [token]
  );
  return res.rows[0]?.handle ?? null;
}

export type JoinedFounderInsert = Pick<
  JoinedFounder,
  | "handle"
  | "name"
  | "x_user_id"
  | "avatar_url"
  | "followers"
  | "oauth_access_token"
  | "oauth_refresh_token"
>;

export async function pgUpsertJoinedFounder(f: JoinedFounderInsert) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO joined_founders
       (handle, name, x_user_id, avatar_url, followers, oauth_access_token, oauth_refresh_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (handle) DO UPDATE SET
       name = EXCLUDED.name,
       avatar_url = EXCLUDED.avatar_url,
       followers = EXCLUDED.followers,
       oauth_access_token = EXCLUDED.oauth_access_token,
       oauth_refresh_token = EXCLUDED.oauth_refresh_token`,
    [
      f.handle,
      f.name,
      f.x_user_id,
      f.avatar_url,
      f.followers,
      f.oauth_access_token,
      f.oauth_refresh_token,
    ]
  );
}

export async function pgUpdateJoinedMetrics(
  handle: string,
  m: JoinedMetrics,
  bannerUrl: string | null
) {
  await ensureSchema();
  await getPool().query(
    `UPDATE joined_founders SET
       posts_7d_original = $2, posts_7d_reply = $3, posts_7d_retweet = $4,
       posts_30d_original = $5, posts_30d_reply = $6, posts_30d_retweet = $7,
       interactions_7d = $8, interactions_30d = $9,
       impressions_7d = $10, impressions_30d = $11,
       banner_url = COALESCE($12, banner_url),
       metrics_updated_at = now()
     WHERE handle = $1`,
    [
      handle,
      m.posts_7d_original,
      m.posts_7d_reply,
      m.posts_7d_retweet,
      m.posts_30d_original,
      m.posts_30d_reply,
      m.posts_30d_retweet,
      m.interactions_7d,
      m.interactions_30d,
      m.impressions_7d,
      m.impressions_30d,
      bannerUrl,
    ]
  );
}

export async function pgGetJoinedFounder(
  handle: string
): Promise<JoinedFounder | null> {
  await ensureSchema();
  const res = await getPool().query<JoinedFounder>(
    "SELECT * FROM joined_founders WHERE LOWER(handle) = LOWER($1)",
    [handle]
  );
  return res.rows[0] ?? null;
}

export async function pgListJoinedFounders(): Promise<JoinedFounder[]> {
  await ensureSchema();
  const res = await getPool().query<JoinedFounder>(
    "SELECT * FROM joined_founders ORDER BY created_at ASC"
  );
  return res.rows;
}
