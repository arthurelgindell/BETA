import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db, storyboards, sceneMatches, productionJobs, generatedAssets } from '../db/index.js';
import { CreateStoryboardSchema, type Scene, type Storyboard, CONFIG } from '../types.js';
import { matchSceneToAssets, getBestMatch } from '../services/matcher.js';
import { generateVideoForScene, checkHealth as checkLTX2Health } from '../services/generator.js';
import { assembleStoryboard } from '../services/assembler.js';
import { catalogGeneratedAsset } from '../services/catalog.js';
import type { ResolvedAsset } from '../types.js';

const app = new Hono();

// Create storyboard
app.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = CreateStoryboardSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }

  const storyboardId = `sb_${nanoid(8)}`;
  const now = new Date().toISOString();

  // Generate scene IDs
  const scenes: Scene[] = parsed.data.scenes.map((s) => ({
    sceneId: `sc_${nanoid(8)}`,
    sequence: s.sequence,
    duration: s.duration,
    description: s.description,
    visualKeywords: s.visualKeywords,
    styleHints: s.styleHints,
    transitionIn: s.transitionIn || 'cut',
    transitionOut: s.transitionOut || 'cut',
    matchedAssetId: null,
    matchScore: null,
    assetSource: null,
    needsReview: false,
  }));

  const [width, height] = parsed.data.outputResolution || [1920, 1080];

  await db.insert(storyboards).values({
    storyboardId,
    title: parsed.data.title,
    scenesJson: JSON.stringify(scenes),
    outputWidth: width,
    outputHeight: height,
    outputFps: parsed.data.outputFps || 30,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    storyboardId,
    title: parsed.data.title,
    scenes,
    outputResolution: [width, height],
    outputFps: parsed.data.outputFps || 30,
    createdAt: now,
  }, 201);
});

// Get storyboard
app.get('/:id', async (c) => {
  const id = c.req.param('id');

  const result = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.storyboardId, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: 'Storyboard not found' }, 404);
  }

  const row = result[0];
  const scenes = JSON.parse(row.scenesJson) as Scene[];

  return c.json({
    storyboardId: row.storyboardId,
    title: row.title,
    scenes,
    outputResolution: [row.outputWidth, row.outputHeight],
    outputFps: row.outputFps,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
});

// List storyboards
app.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20', 10);

  const results = await db
    .select()
    .from(storyboards)
    .limit(limit)
    .orderBy(storyboards.createdAt);

  return c.json({
    count: results.length,
    storyboards: results.map(row => ({
      storyboardId: row.storyboardId,
      title: row.title,
      sceneCount: JSON.parse(row.scenesJson).length,
      createdAt: row.createdAt,
    })),
  });
});

// Run asset matching for a storyboard
app.post('/:id/match', async (c) => {
  const id = c.req.param('id');

  const result = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.storyboardId, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: 'Storyboard not found' }, 404);
  }

  const row = result[0];
  const scenes = JSON.parse(row.scenesJson) as Scene[];

  const matchResults: Array<{
    sceneId: string;
    sequence: number;
    action: 'matched' | 'generate';
    assetId?: string;
    score?: number;
    needsReview?: boolean;
    topMatches?: Array<{ assetId: string; score: number }>;
  }> = [];

  for (const scene of scenes) {
    try {
      const matches = await matchSceneToAssets(scene);
      const bestMatch = getBestMatch(matches);

      if (bestMatch) {
        // Update scene with match
        scene.matchedAssetId = bestMatch.assetId;
        scene.matchScore = bestMatch.compositeScore;
        scene.assetSource = 'existing';
        scene.needsReview = bestMatch.needsReview;

        // Save to scene_matches table
        await db.insert(sceneMatches).values({
          storyboardId: id,
          sceneId: scene.sceneId,
          assetId: bestMatch.assetId,
          assetPath: bestMatch.filepath,
          source: 'existing',
          compositeScore: bestMatch.compositeScore,
          needsReview: bestMatch.needsReview,
        });

        matchResults.push({
          sceneId: scene.sceneId,
          sequence: scene.sequence,
          action: 'matched',
          assetId: bestMatch.assetId,
          score: bestMatch.compositeScore,
          needsReview: bestMatch.needsReview,
          topMatches: matches.slice(0, 3).map(m => ({
            assetId: m.assetId,
            score: m.compositeScore,
          })),
        });
      } else {
        // Mark for generation
        scene.assetSource = 'generated';

        matchResults.push({
          sceneId: scene.sceneId,
          sequence: scene.sequence,
          action: 'generate',
          topMatches: matches.slice(0, 3).map(m => ({
            assetId: m.assetId,
            score: m.compositeScore,
          })),
        });
      }
    } catch (error) {
      console.error(`[Match] Error matching scene ${scene.sceneId}:`, error);
      matchResults.push({
        sceneId: scene.sceneId,
        sequence: scene.sequence,
        action: 'generate',
      });
    }
  }

  // Update storyboard with matched scenes
  const now = new Date().toISOString();
  await db
    .update(storyboards)
    .set({
      scenesJson: JSON.stringify(scenes),
      updatedAt: now,
    })
    .where(eq(storyboards.storyboardId, id));

  return c.json({
    storyboardId: id,
    matchedScenes: matchResults.filter(r => r.action === 'matched').length,
    scenesToGenerate: matchResults.filter(r => r.action === 'generate').length,
    results: matchResults,
  });
});

// Start production job
app.post('/:id/produce', async (c) => {
  const id = c.req.param('id');

  const result = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.storyboardId, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: 'Storyboard not found' }, 404);
  }

  // Check LTX-2 availability
  const ltx2Healthy = await checkLTX2Health();
  if (!ltx2Healthy) {
    return c.json({ error: 'LTX-2 server unavailable' }, 503);
  }

  const jobId = `job_${nanoid(8)}`;
  const now = new Date().toISOString();

  // Create production job
  await db.insert(productionJobs).values({
    jobId,
    storyboardId: id,
    status: 'pending',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Start production in background
  processProductionJob(jobId, id).catch(console.error);

  return c.json({
    jobId,
    storyboardId: id,
    status: 'pending',
  }, 202);
});

// Manual asset override for a scene
app.post('/:storyboardId/scenes/:sceneId/override', async (c) => {
  const { storyboardId, sceneId } = c.req.param();
  const body = await c.req.json<{ assetId: string; assetPath: string }>();

  if (!body.assetId || !body.assetPath) {
    return c.json({ error: 'assetId and assetPath required' }, 400);
  }

  const result = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.storyboardId, storyboardId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: 'Storyboard not found' }, 404);
  }

  const row = result[0];
  const scenes = JSON.parse(row.scenesJson) as Scene[];
  const sceneIndex = scenes.findIndex(s => s.sceneId === sceneId);

  if (sceneIndex === -1) {
    return c.json({ error: 'Scene not found' }, 404);
  }

  // Update scene
  scenes[sceneIndex].matchedAssetId = body.assetId;
  scenes[sceneIndex].matchScore = 1.0;
  scenes[sceneIndex].assetSource = 'manual';
  scenes[sceneIndex].needsReview = false;

  const now = new Date().toISOString();

  // Save match record
  await db.insert(sceneMatches).values({
    storyboardId,
    sceneId,
    assetId: body.assetId,
    assetPath: body.assetPath,
    source: 'manual',
    compositeScore: 1.0,
    needsReview: false,
  });

  // Update storyboard
  await db
    .update(storyboards)
    .set({
      scenesJson: JSON.stringify(scenes),
      updatedAt: now,
    })
    .where(eq(storyboards.storyboardId, storyboardId));

  return c.json({
    sceneId,
    assetId: body.assetId,
    source: 'manual',
  });
});

// Background job processor
async function processProductionJob(jobId: string, storyboardId: string): Promise<void> {
  const { join } = await import('node:path');

  try {
    // Update status to matching
    await updateJobStatus(jobId, 'matching', 0.1);

    const result = await db
      .select()
      .from(storyboards)
      .where(eq(storyboards.storyboardId, storyboardId))
      .limit(1);

    if (result.length === 0) {
      throw new Error('Storyboard not found');
    }

    const row = result[0];
    const scenes = JSON.parse(row.scenesJson) as Scene[];
    const storyboard: Storyboard = {
      storyboardId: row.storyboardId,
      title: row.title,
      scenes,
      outputResolution: [row.outputWidth, row.outputHeight],
      outputFps: row.outputFps,
    };

    // Resolve assets for each scene
    const resolvedAssets: ResolvedAsset[] = [];
    const totalScenes = scenes.length;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const progress = 0.1 + (0.7 * (i / totalScenes));

      // Check if already matched
      if (scene.matchedAssetId && scene.assetSource === 'existing') {
        // Get asset path from matches table
        const matchResult = await db
          .select()
          .from(sceneMatches)
          .where(eq(sceneMatches.sceneId, scene.sceneId))
          .limit(1);

        if (matchResult.length > 0) {
          resolvedAssets.push({
            sceneId: scene.sceneId,
            assetId: scene.matchedAssetId,
            localPath: matchResult[0].assetPath,
            source: 'existing',
            confidence: scene.matchScore || 1.0,
            needsReview: scene.needsReview,
          });
          await updateJobStatus(jobId, 'matching', progress);
          continue;
        }
      }

      // Need to generate
      await updateJobStatus(jobId, 'generating', progress);

      const { jobId: ltx2JobId, filepath, prompt } = await generateVideoForScene(scene);

      // Save generated asset record
      const assetId = `gen_${nanoid(8)}`;
      await db.insert(generatedAssets).values({
        assetId,
        jobId,
        sceneId: scene.sceneId,
        storyboardId,
        prompt,
        ltx2JobId,
        filepath,
        catalogued: false,
      });

      // Update scene
      scene.matchedAssetId = assetId;
      scene.matchScore = 1.0;
      scene.assetSource = 'generated';

      resolvedAssets.push({
        sceneId: scene.sceneId,
        assetId,
        localPath: filepath,
        source: 'generated',
        confidence: 1.0,
        needsReview: false,
      });

      // Catalog the generated asset
      try {
        await catalogGeneratedAsset(scene, prompt, filepath, storyboardId);
        await db
          .update(generatedAssets)
          .set({ catalogued: true })
          .where(eq(generatedAssets.assetId, assetId));
      } catch (catalogError) {
        console.error(`[Catalog] Failed to catalog asset ${assetId}:`, catalogError);
      }
    }

    // Update storyboard with final scenes
    await db
      .update(storyboards)
      .set({
        scenesJson: JSON.stringify(scenes),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(storyboards.storyboardId, storyboardId));

    // Assemble final video
    await updateJobStatus(jobId, 'assembling', 0.85);

    const outputFilename = `${storyboard.title.replace(/[^a-zA-Z0-9]/g, '_')}_${jobId}.mp4`;
    const outputPath = join(CONFIG.OUTPUT_DIR, outputFilename);

    await assembleStoryboard(storyboard, resolvedAssets, outputPath);

    // Complete
    await updateJobStatus(jobId, 'completed', 1.0, outputPath);

  } catch (error) {
    console.error(`[Job ${jobId}] Production failed:`, error);
    await db
      .update(productionJobs)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(productionJobs.jobId, jobId));
  }
}

async function updateJobStatus(
  jobId: string,
  status: string,
  progress: number,
  outputPath?: string
): Promise<void> {
  await db
    .update(productionJobs)
    .set({
      status,
      progress,
      outputPath,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(productionJobs.jobId, jobId));
}

export default app;
