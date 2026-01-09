import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { db, productionJobs } from '../db/index.js';

const app = new Hono();

// Get job status
app.get('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');

  const result = await db
    .select()
    .from(productionJobs)
    .where(eq(productionJobs.jobId, jobId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const job = result[0];

  return c.json({
    jobId: job.jobId,
    storyboardId: job.storyboardId,
    status: job.status,
    progress: job.progress,
    outputUrl: job.outputPath ? `/api/v1/jobs/${jobId}/download` : null,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

// Download completed video
app.get('/:jobId/download', async (c) => {
  const jobId = c.req.param('jobId');

  const result = await db
    .select()
    .from(productionJobs)
    .where(eq(productionJobs.jobId, jobId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const job = result[0];

  if (job.status !== 'completed') {
    return c.json({ error: `Job status: ${job.status}` }, 400);
  }

  if (!job.outputPath) {
    return c.json({ error: 'No output file available' }, 404);
  }

  try {
    const stats = await stat(job.outputPath);
    const { basename } = await import('node:path');

    // Set headers for video download
    c.header('Content-Type', 'video/mp4');
    c.header('Content-Length', stats.size.toString());
    c.header('Content-Disposition', `attachment; filename="${basename(job.outputPath)}"`);

    // Stream the file
    const stream = createReadStream(job.outputPath);

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': stats.size.toString(),
        'Content-Disposition': `attachment; filename="${basename(job.outputPath)}"`,
      },
    });
  } catch (error) {
    return c.json({ error: 'Output file not found on disk' }, 404);
  }
});

// List recent jobs
app.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const storyboardId = c.req.query('storyboard_id');

  let query = db
    .select()
    .from(productionJobs)
    .limit(limit)
    .orderBy(productionJobs.createdAt);

  const results = await query;

  // Filter by storyboard if provided
  const filtered = storyboardId
    ? results.filter(j => j.storyboardId === storyboardId)
    : results;

  return c.json({
    count: filtered.length,
    jobs: filtered.map(job => ({
      jobId: job.jobId,
      storyboardId: job.storyboardId,
      status: job.status,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt,
    })),
  });
});

// Cancel a pending/processing job (marks as failed)
app.delete('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');

  const result = await db
    .select()
    .from(productionJobs)
    .where(eq(productionJobs.jobId, jobId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const job = result[0];

  if (job.status === 'completed' || job.status === 'failed') {
    return c.json({ error: `Cannot cancel job with status: ${job.status}` }, 400);
  }

  await db
    .update(productionJobs)
    .set({
      status: 'failed',
      error: 'Cancelled by user',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(productionJobs.jobId, jobId));

  return c.json({
    jobId,
    status: 'cancelled',
  });
});

export default app;
