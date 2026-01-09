import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { CONFIG } from '../types.js';

// Initialize SQLite database
const sqlite = new Database(CONFIG.DB_PATH);

// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL');

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for convenience
export * from './schema.js';

// Initialize tables if they don't exist
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS storyboards (
      storyboard_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      scenes_json TEXT NOT NULL,
      output_width INTEGER NOT NULL DEFAULT 1920,
      output_height INTEGER NOT NULL DEFAULT 1080,
      output_fps REAL NOT NULL DEFAULT 30,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_jobs (
      job_id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL REFERENCES storyboards(storyboard_id),
      status TEXT NOT NULL DEFAULT 'pending',
      progress REAL NOT NULL DEFAULT 0,
      output_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scene_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storyboard_id TEXT NOT NULL REFERENCES storyboards(storyboard_id),
      scene_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_path TEXT NOT NULL,
      source TEXT NOT NULL,
      composite_score REAL NOT NULL,
      needs_review INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT NOT NULL UNIQUE,
      job_id TEXT NOT NULL,
      scene_id TEXT NOT NULL,
      storyboard_id TEXT NOT NULL REFERENCES storyboards(storyboard_id),
      prompt TEXT NOT NULL,
      ltx2_job_id TEXT NOT NULL,
      filepath TEXT NOT NULL,
      catalogued INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_storyboard ON production_jobs(storyboard_id);
    CREATE INDEX IF NOT EXISTS idx_matches_storyboard ON scene_matches(storyboard_id);
    CREATE INDEX IF NOT EXISTS idx_generated_storyboard ON generated_assets(storyboard_id);
  `);
}
