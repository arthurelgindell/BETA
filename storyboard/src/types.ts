import { z } from 'zod';

// Enums
export const TransitionType = z.enum(['cut', 'fade', 'dissolve', 'wipe']);
export const AssetSource = z.enum(['existing', 'generated', 'manual']);
export const JobStatus = z.enum(['pending', 'matching', 'generating', 'assembling', 'completed', 'failed']);

// Scene schema
export const SceneSchema = z.object({
  sceneId: z.string(),
  sequence: z.number().int().positive(),
  duration: z.number().positive(),
  description: z.string(),
  visualKeywords: z.array(z.string()),
  styleHints: z.string().optional(),
  transitionIn: TransitionType.default('cut'),
  transitionOut: TransitionType.default('cut'),

  // Populated by matcher
  matchedAssetId: z.string().nullable().default(null),
  matchScore: z.number().nullable().default(null),
  assetSource: AssetSource.nullable().default(null),
  needsReview: z.boolean().default(false),
});

// Storyboard schema
export const StoryboardSchema = z.object({
  storyboardId: z.string(),
  title: z.string(),
  scenes: z.array(SceneSchema),
  outputResolution: z.tuple([z.number(), z.number()]).default([1920, 1080]),
  outputFps: z.number().default(30),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Create storyboard request (without auto-generated fields)
export const CreateStoryboardSchema = z.object({
  title: z.string().min(1),
  scenes: z.array(z.object({
    sequence: z.number().int().positive(),
    duration: z.number().positive(),
    description: z.string().min(1),
    visualKeywords: z.array(z.string()).default([]),
    styleHints: z.string().optional(),
    transitionIn: TransitionType.optional(),
    transitionOut: TransitionType.optional(),
  })),
  outputResolution: z.tuple([z.number(), z.number()]).optional(),
  outputFps: z.number().optional(),
});

// Production job schema
export const ProductionJobSchema = z.object({
  jobId: z.string(),
  storyboardId: z.string(),
  status: JobStatus,
  progress: z.number().min(0).max(1).default(0),
  outputPath: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Asset match result
export const AssetMatchSchema = z.object({
  assetId: z.string(),
  filepath: z.string(),
  semanticScore: z.number(),
  styleScore: z.number(),
  useCaseScore: z.number(),
  qualityScore: z.number(),
  durationScore: z.number(),
  compositeScore: z.number(),
  needsReview: z.boolean(),
});

// LanceDB asset schema (from existing database)
export const LanceDBAssetSchema = z.object({
  id: z.string(),
  filename: z.string(),
  filepath: z.string(),
  source: z.string(),
  media_type: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  style: z.string().nullable(),
  use_case: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration: z.number().nullable(),
  fps: z.number().nullable(),
  vector: z.array(z.number()).optional(),
});

// Type exports
export type TransitionType = z.infer<typeof TransitionType>;
export type AssetSource = z.infer<typeof AssetSource>;
export type JobStatus = z.infer<typeof JobStatus>;
export type Scene = z.infer<typeof SceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type CreateStoryboard = z.infer<typeof CreateStoryboardSchema>;
export type ProductionJob = z.infer<typeof ProductionJobSchema>;
export type AssetMatch = z.infer<typeof AssetMatchSchema>;
export type LanceDBAsset = z.infer<typeof LanceDBAssetSchema>;

// Resolved asset (after matching/generation)
export interface ResolvedAsset {
  sceneId: string;
  assetId: string;
  localPath: string;
  source: AssetSource;
  confidence: number;
  needsReview: boolean;
}

// Config
export const CONFIG = {
  LANCEDB_URL: 'https://beta.tail5f2bae.ts.net:8443',
  LTX2_URL: 'https://gamma.tail5f2bae.ts.net:8001',
  LM_STUDIO_URL: 'http://100.76.246.64:1234',
  DB_PATH: '/Volumes/STUDIO/storyboards.db',
  OUTPUT_DIR: '/Volumes/STUDIO/VIDEO',
  PORT: 8002,

  // Matching weights
  WEIGHTS: {
    semanticSimilarity: 0.50,
    styleMatch: 0.20,
    useCaseMatch: 0.15,
    qualityScore: 0.10,
    durationFit: 0.05,
  },

  // Matching thresholds
  THRESHOLDS: {
    semanticMinimum: 0.72,
    compositeMinimum: 0.78,
    excellentMatch: 0.90,
  },

  // LTX-2 defaults
  LTX2: {
    maxFrames: 241,
    fps: 25,
    defaultSteps: 40,
    defaultCfg: 3.0,
  },
} as const;
