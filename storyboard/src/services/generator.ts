import { ofetch } from 'ofetch';
import type { Scene } from '../types.js';
import { CONFIG } from '../types.js';

interface LTX2Response {
  job_id: string;
  status: string;
}

interface LTX2StatusResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  output_url?: string;
  error?: string;
}

// Generate a deterministic hash from scene ID for seeding
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Build an optimized prompt from scene description
function buildPrompt(scene: Scene): string {
  const parts: string[] = [];

  // Main description
  parts.push(scene.description);

  // Add style hints
  if (scene.styleHints) {
    parts.push(`Style: ${scene.styleHints}`);
  }

  // Add visual keywords as context
  if (scene.visualKeywords.length > 0) {
    parts.push(`Elements: ${scene.visualKeywords.join(', ')}`);
  }

  // Add quality hints
  parts.push('High quality, cinematic, professional video production');

  return parts.join('. ');
}

// Build negative prompt
function buildNegativePrompt(): string {
  return 'blurry, low quality, distorted, watermark, text overlay, amateur, shaky camera, overexposed, underexposed';
}

// Submit video generation job to LTX-2
export async function submitGeneration(scene: Scene): Promise<string> {
  const numFrames = Math.min(
    Math.ceil(scene.duration * CONFIG.LTX2.fps),
    CONFIG.LTX2.maxFrames
  );

  const response = await ofetch<LTX2Response>(
    `${CONFIG.LTX2_URL}/api/v1/text-to-video`,
    {
      method: 'POST',
      body: {
        prompt: buildPrompt(scene),
        negative_prompt: buildNegativePrompt(),
        num_frames: numFrames,
        height: 512,
        width: 768,
        seed: hashCode(scene.sceneId),
        num_inference_steps: CONFIG.LTX2.defaultSteps,
        cfg_guidance_scale: CONFIG.LTX2.defaultCfg,
        frame_rate: CONFIG.LTX2.fps,
      },
    }
  );

  return response.job_id;
}

// Check status of generation job
export async function checkStatus(jobId: string): Promise<LTX2StatusResponse> {
  return ofetch<LTX2StatusResponse>(
    `${CONFIG.LTX2_URL}/api/v1/status/${jobId}`
  );
}

// Download generated video
export async function downloadVideo(jobId: string, outputPath: string): Promise<void> {
  const response = await ofetch(`${CONFIG.LTX2_URL}/api/v1/download/${jobId}`, {
    responseType: 'arrayBuffer',
  });

  const { writeFile } = await import('node:fs/promises');
  await writeFile(outputPath, Buffer.from(response as ArrayBuffer));
}

// Poll for completion with timeout
export async function pollUntilComplete(
  jobId: string,
  timeoutMs: number = 600000, // 10 minutes
  pollIntervalMs: number = 5000 // 5 seconds
): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await checkStatus(jobId);

    if (status.status === 'completed' && status.output_url) {
      return status.output_url;
    }

    if (status.status === 'failed') {
      throw new Error(`LTX-2 generation failed: ${status.error || 'Unknown error'}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`LTX-2 generation timed out after ${timeoutMs / 1000}s`);
}

// Generate video for a scene (full workflow)
export async function generateVideoForScene(
  scene: Scene,
  outputDir: string = CONFIG.OUTPUT_DIR
): Promise<{ jobId: string; filepath: string; prompt: string }> {
  const { nanoid } = await import('nanoid');
  const { join } = await import('node:path');
  const { mkdir } = await import('node:fs/promises');

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Generate unique filename
  const assetId = nanoid(12);
  const filename = `gen_${scene.sceneId}_${assetId}.mp4`;
  const filepath = join(outputDir, filename);

  // Submit generation job
  const ltx2JobId = await submitGeneration(scene);
  console.log(`[Generator] Submitted LTX-2 job ${ltx2JobId} for scene ${scene.sceneId}`);

  // Wait for completion
  await pollUntilComplete(ltx2JobId);
  console.log(`[Generator] LTX-2 job ${ltx2JobId} completed`);

  // Download video
  await downloadVideo(ltx2JobId, filepath);
  console.log(`[Generator] Downloaded video to ${filepath}`);

  return {
    jobId: ltx2JobId,
    filepath,
    prompt: buildPrompt(scene),
  };
}

// Check LTX-2 health
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await ofetch<{ status: string }>(
      `${CONFIG.LTX2_URL}/health`
    );
    return response.status === 'healthy';
  } catch {
    return false;
  }
}
