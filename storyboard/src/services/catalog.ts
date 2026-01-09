import { ofetch } from 'ofetch';
import ffmpeg from 'fluent-ffmpeg';
import type { Scene } from '../types.js';
import { CONFIG } from '../types.js';

interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  fps: number;
  bitrate: number;
  codec: string;
}

// Extract video metadata using ffprobe
export async function extractMetadata(filepath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filepath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = data.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      // Parse frame rate
      let fps = 30;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        fps = den ? num / den : num;
      }

      resolve({
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        duration: parseFloat(String(data.format.duration || '0')),
        fps,
        bitrate: parseInt(String(data.format.bit_rate || '0'), 10),
        codec: videoStream.codec_name || 'unknown',
      });
    });
  });
}

// Generate embedding for description via LM Studio
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ofetch<{ data: Array<{ embedding: number[] }> }>(
    `${CONFIG.LM_STUDIO_URL}/v1/embeddings`,
    {
      method: 'POST',
      body: {
        model: 'text-embedding-nomic-embed-text-v1.5',
        input: text,
      },
    }
  );
  return response.data[0].embedding;
}

// Generate unique asset ID
function generateAssetId(): string {
  const chars = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Build description for generated asset
function buildDescription(scene: Scene, prompt: string): string {
  return `${scene.description}. Generated video for storyboard scene. Keywords: ${scene.visualKeywords.join(', ')}. Style: ${scene.styleHints || 'cinematic'}. Prompt: ${prompt}`;
}

// Catalog a generated asset to LanceDB
// Note: This writes directly to LanceDB via the existing Python server
// In production, you might want to add the asset via a POST endpoint
export async function catalogGeneratedAsset(
  scene: Scene,
  prompt: string,
  filepath: string,
  storyboardId: string
): Promise<string> {
  const { basename } = await import('node:path');

  // Extract video metadata
  const metadata = await extractMetadata(filepath);

  // Build description
  const description = buildDescription(scene, prompt);

  // Generate embedding
  const vector = await generateEmbedding(description);

  // Generate asset ID
  const assetId = generateAssetId();

  // Prepare asset record
  const assetRecord = {
    id: assetId,
    filename: basename(filepath),
    filepath,
    source: 'GENERATED',
    media_type: 'video',
    description,
    tags: scene.visualKeywords,
    style: scene.styleHints || 'cinematic',
    use_case: 'storyboard_generated',
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    fps: metadata.fps,
    generation_params: {
      prompt,
      sceneId: scene.sceneId,
      storyboardId,
    },
    vector,
  };

  // For now, log the record - in production, POST to LanceDB server
  console.log(`[Catalog] Would add asset ${assetId} to LanceDB:`, {
    ...assetRecord,
    vector: `[${vector.length} dimensions]`,
  });

  // TODO: Once LanceDB server has write endpoint, use:
  // await ofetch(`${CONFIG.LANCEDB_URL}/assets`, {
  //   method: 'POST',
  //   body: assetRecord,
  // });

  return assetId;
}

// Batch catalog multiple assets
export async function catalogBatch(
  assets: Array<{
    scene: Scene;
    prompt: string;
    filepath: string;
    storyboardId: string;
  }>
): Promise<string[]> {
  const ids: string[] = [];

  for (const asset of assets) {
    try {
      const id = await catalogGeneratedAsset(
        asset.scene,
        asset.prompt,
        asset.filepath,
        asset.storyboardId
      );
      ids.push(id);
    } catch (error) {
      console.error(`[Catalog] Failed to catalog asset for scene ${asset.scene.sceneId}:`, error);
    }
  }

  return ids;
}
