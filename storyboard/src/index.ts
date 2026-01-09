import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { initDb } from './db/index.js';
import { CONFIG } from './types.js';
import { checkHealth as checkLTX2Health } from './services/generator.js';
import storyboardsRouter from './routes/storyboards.js';
import jobsRouter from './routes/jobs.js';

// Initialize database
console.log('[Server] Initializing database...');
initDb();
console.log(`[Server] Database initialized at ${CONFIG.DB_PATH}`);

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/health', async (c) => {
  const ltx2Healthy = await checkLTX2Health();

  return c.json({
    status: 'healthy',
    service: 'storyboard-production',
    version: '1.0.0',
    infrastructure: {
      lancedb: CONFIG.LANCEDB_URL,
      ltx2: CONFIG.LTX2_URL,
      ltx2_healthy: ltx2Healthy,
      lm_studio: CONFIG.LM_STUDIO_URL,
    },
    database: CONFIG.DB_PATH,
    output_dir: CONFIG.OUTPUT_DIR,
  });
});

// API routes
app.route('/api/v1/storyboards', storyboardsRouter);
app.route('/api/v1/jobs', jobsRouter);

// Root info
app.get('/', (c) => {
  return c.json({
    name: 'Storyboard Production System',
    version: '1.0.0',
    description: 'World-class media production system with intelligent asset matching and AI video generation',
    endpoints: {
      health: 'GET /health',
      storyboards: {
        list: 'GET /api/v1/storyboards',
        create: 'POST /api/v1/storyboards',
        get: 'GET /api/v1/storyboards/:id',
        match: 'POST /api/v1/storyboards/:id/match',
        produce: 'POST /api/v1/storyboards/:id/produce',
        override: 'POST /api/v1/storyboards/:id/scenes/:sceneId/override',
      },
      jobs: {
        list: 'GET /api/v1/jobs',
        get: 'GET /api/v1/jobs/:jobId',
        download: 'GET /api/v1/jobs/:jobId/download',
        cancel: 'DELETE /api/v1/jobs/:jobId',
      },
    },
    infrastructure: {
      lancedb: `${CONFIG.LANCEDB_URL} (117 assets)`,
      ltx2: `${CONFIG.LTX2_URL} (video generation)`,
      lm_studio: `${CONFIG.LM_STUDIO_URL} (embeddings)`,
    },
  });
});

// Start server
console.log(`[Server] Starting on port ${CONFIG.PORT}...`);
serve({
  fetch: app.fetch,
  port: CONFIG.PORT,
}, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           STORYBOARD PRODUCTION SYSTEM                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${CONFIG.PORT}                   ║
║                                                               ║
║  Infrastructure:                                              ║
║    LanceDB:   ${CONFIG.LANCEDB_URL}      ║
║    LTX-2:     ${CONFIG.LTX2_URL}      ║
║    LM Studio: ${CONFIG.LM_STUDIO_URL}               ║
║                                                               ║
║  Database: ${CONFIG.DB_PATH}                ║
║  Output:   ${CONFIG.OUTPUT_DIR}                   ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
