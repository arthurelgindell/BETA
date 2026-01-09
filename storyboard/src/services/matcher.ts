import { ofetch } from 'ofetch';
import type { Scene, AssetMatch, LanceDBAsset } from '../types.js';
import { CONFIG } from '../types.js';

// Generate embedding via LM Studio
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

// Search LanceDB for similar assets
async function searchLanceDB(
  vector: number[],
  limit: number = 20,
  mediaType?: string
): Promise<LanceDBAsset[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  if (mediaType) {
    params.set('media_type', mediaType);
  }

  const response = await ofetch<{ results: LanceDBAsset[] }>(
    `${CONFIG.LANCEDB_URL}/search/vector?${params}`,
    {
      method: 'POST',
      body: { vector },
    }
  );
  return response.results;
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Calculate style match score based on keywords
function calculateStyleScore(scene: Scene, asset: LanceDBAsset): number {
  const sceneTags = new Set([
    ...scene.visualKeywords.map(k => k.toLowerCase()),
    ...(scene.styleHints?.toLowerCase().split(/\s+/) || []),
  ]);

  const assetTags = new Set([
    ...(asset.tags?.map(t => t.toLowerCase()) || []),
    ...(asset.style?.toLowerCase().split(/\s+/) || []),
  ]);

  if (sceneTags.size === 0 || assetTags.size === 0) return 0.5;

  let matches = 0;
  for (const tag of sceneTags) {
    if (assetTags.has(tag)) matches++;
  }

  return matches / Math.max(sceneTags.size, 1);
}

// Calculate use case match score
function calculateUseCaseScore(scene: Scene, asset: LanceDBAsset): number {
  if (!asset.use_case) return 0.5;

  const sceneText = `${scene.description} ${scene.visualKeywords.join(' ')}`.toLowerCase();
  const useCase = asset.use_case.toLowerCase();

  // Check for keyword overlap
  const useCaseWords = useCase.split(/\s+/);
  let matches = 0;
  for (const word of useCaseWords) {
    if (word.length > 3 && sceneText.includes(word)) matches++;
  }

  return Math.min(matches / Math.max(useCaseWords.length, 1), 1);
}

// Calculate quality score based on resolution
function calculateQualityScore(asset: LanceDBAsset): number {
  const width = asset.width || 0;
  const height = asset.height || 0;

  // Target is 1920x1080
  const targetPixels = 1920 * 1080;
  const assetPixels = width * height;

  if (assetPixels >= targetPixels) return 1.0;
  if (assetPixels === 0) return 0.3;

  return assetPixels / targetPixels;
}

// Calculate duration fit score
function calculateDurationScore(scene: Scene, asset: LanceDBAsset): number {
  if (!asset.duration || asset.media_type !== 'video') return 0.5;

  const targetDuration = scene.duration;
  const assetDuration = asset.duration;

  // Perfect fit or longer is good (can be trimmed)
  if (assetDuration >= targetDuration) return 1.0;

  // Shorter is less ideal but still usable
  const ratio = assetDuration / targetDuration;
  return Math.max(ratio, 0.3);
}

// Calculate composite score
function calculateCompositeScore(scores: {
  semantic: number;
  style: number;
  useCase: number;
  quality: number;
  duration: number;
}): number {
  return (
    scores.semantic * CONFIG.WEIGHTS.semanticSimilarity +
    scores.style * CONFIG.WEIGHTS.styleMatch +
    scores.useCase * CONFIG.WEIGHTS.useCaseMatch +
    scores.quality * CONFIG.WEIGHTS.qualityScore +
    scores.duration * CONFIG.WEIGHTS.durationFit
  );
}

// Main matching function
export async function matchSceneToAssets(scene: Scene): Promise<AssetMatch[]> {
  // Build search text
  const searchText = [
    scene.description,
    ...scene.visualKeywords,
    scene.styleHints,
  ]
    .filter(Boolean)
    .join(' ');

  // Generate embedding
  const embedding = await generateEmbedding(searchText);

  // Search LanceDB (prefer video for non-zero duration scenes)
  const mediaType = scene.duration > 0 ? 'video' : undefined;
  const candidates = await searchLanceDB(embedding, 20, mediaType);

  // Score each candidate
  const matches: AssetMatch[] = [];

  for (const asset of candidates) {
    // Skip if asset doesn't have the vector for similarity calculation
    const semanticScore = asset.vector
      ? cosineSimilarity(embedding, asset.vector)
      : 0.7; // Default if no vector returned

    // Skip if semantic score too low
    if (semanticScore < CONFIG.THRESHOLDS.semanticMinimum) continue;

    const styleScore = calculateStyleScore(scene, asset);
    const useCaseScore = calculateUseCaseScore(scene, asset);
    const qualityScore = calculateQualityScore(asset);
    const durationScore = calculateDurationScore(scene, asset);

    const compositeScore = calculateCompositeScore({
      semantic: semanticScore,
      style: styleScore,
      useCase: useCaseScore,
      quality: qualityScore,
      duration: durationScore,
    });

    // Determine if needs review (between thresholds)
    const needsReview =
      compositeScore >= CONFIG.THRESHOLDS.compositeMinimum &&
      compositeScore < CONFIG.THRESHOLDS.excellentMatch;

    matches.push({
      assetId: asset.id,
      filepath: asset.filepath,
      semanticScore,
      styleScore,
      useCaseScore,
      qualityScore,
      durationScore,
      compositeScore,
      needsReview,
    });
  }

  // Sort by composite score descending
  return matches.sort((a, b) => b.compositeScore - a.compositeScore);
}

// Decide whether to use existing asset or generate new one
export function shouldGenerate(matches: AssetMatch[]): boolean {
  if (matches.length === 0) return true;

  const topMatch = matches[0];
  return topMatch.compositeScore < CONFIG.THRESHOLDS.compositeMinimum;
}

// Get the best match if above threshold
export function getBestMatch(matches: AssetMatch[]): AssetMatch | null {
  if (matches.length === 0) return null;

  const topMatch = matches[0];
  if (topMatch.compositeScore >= CONFIG.THRESHOLDS.compositeMinimum) {
    return topMatch;
  }

  return null;
}
