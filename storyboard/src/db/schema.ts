import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Storyboards table
export const storyboards = sqliteTable('storyboards', {
  storyboardId: text('storyboard_id').primaryKey(),
  title: text('title').notNull(),
  scenesJson: text('scenes_json').notNull(), // JSON array of scenes
  outputWidth: integer('output_width').notNull().default(1920),
  outputHeight: integer('output_height').notNull().default(1080),
  outputFps: real('output_fps').notNull().default(30),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Production jobs table
export const productionJobs = sqliteTable('production_jobs', {
  jobId: text('job_id').primaryKey(),
  storyboardId: text('storyboard_id').notNull().references(() => storyboards.storyboardId),
  status: text('status').notNull().default('pending'), // pending, matching, generating, assembling, completed, failed
  progress: real('progress').notNull().default(0),
  outputPath: text('output_path'),
  error: text('error'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Scene matches table (cache of matched assets)
export const sceneMatches = sqliteTable('scene_matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storyboardId: text('storyboard_id').notNull().references(() => storyboards.storyboardId),
  sceneId: text('scene_id').notNull(),
  assetId: text('asset_id').notNull(),
  assetPath: text('asset_path').notNull(),
  source: text('source').notNull(), // existing, generated, manual
  compositeScore: real('composite_score').notNull(),
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Generated assets table (track assets we created via LTX-2)
export const generatedAssets = sqliteTable('generated_assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assetId: text('asset_id').notNull().unique(),
  jobId: text('job_id').notNull(),
  sceneId: text('scene_id').notNull(),
  storyboardId: text('storyboard_id').notNull().references(() => storyboards.storyboardId),
  prompt: text('prompt').notNull(),
  ltx2JobId: text('ltx2_job_id').notNull(),
  filepath: text('filepath').notNull(),
  catalogued: integer('catalogued', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Type inference helpers
export type StoryboardRow = typeof storyboards.$inferSelect;
export type NewStoryboardRow = typeof storyboards.$inferInsert;
export type ProductionJobRow = typeof productionJobs.$inferSelect;
export type NewProductionJobRow = typeof productionJobs.$inferInsert;
export type SceneMatchRow = typeof sceneMatches.$inferSelect;
export type NewSceneMatchRow = typeof sceneMatches.$inferInsert;
export type GeneratedAssetRow = typeof generatedAssets.$inferSelect;
export type NewGeneratedAssetRow = typeof generatedAssets.$inferInsert;
