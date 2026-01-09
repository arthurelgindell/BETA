import ffmpeg from 'fluent-ffmpeg';
import type { ResolvedAsset, Storyboard, Scene } from '../types.js';

interface AssemblyOptions {
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
}

// Get video metadata using ffprobe
export function probeVideo(filepath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filepath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// Assemble videos with simple concatenation (no transitions)
export async function assembleSimple(
  assets: ResolvedAsset[],
  options: AssemblyOptions
): Promise<void> {
  const { mkdir, writeFile, unlink } = await import('node:fs/promises');
  const { dirname, join } = await import('node:path');

  // Ensure output directory exists
  await mkdir(dirname(options.outputPath), { recursive: true });

  const width = options.width || 1920;
  const height = options.height || 1080;
  const fps = options.fps || 30;

  // Create temporary concat file
  const concatFile = join(dirname(options.outputPath), `concat_${Date.now()}.txt`);
  const concatContent = assets
    .map(asset => `file '${asset.localPath}'`)
    .join('\n');

  await writeFile(concatFile, concatContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        `-vf scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .output(options.outputPath)
      .on('start', (cmd) => {
        console.log(`[Assembler] Running: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`[Assembler] Progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', async () => {
        // Clean up concat file
        await unlink(concatFile).catch(() => {});
        resolve();
      })
      .on('error', async (err) => {
        // Clean up concat file
        await unlink(concatFile).catch(() => {});
        reject(err);
      })
      .run();
  });
}

// Assemble videos with transitions using filter_complex
export async function assembleWithTransitions(
  assets: ResolvedAsset[],
  scenes: Scene[],
  options: AssemblyOptions
): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');

  // Ensure output directory exists
  await mkdir(dirname(options.outputPath), { recursive: true });

  const width = options.width || 1920;
  const height = options.height || 1080;
  const fps = options.fps || 30;

  // If only one asset, just scale and copy
  if (assets.length === 1) {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(assets[0].localPath)
        .outputOptions([
          `-vf scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '18',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
        ])
        .output(options.outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  // Build complex filter for multiple inputs
  const filterParts: string[] = [];
  const transitionDuration = 0.5; // seconds

  // First, scale all inputs
  for (let i = 0; i < assets.length; i++) {
    filterParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`
    );
  }

  // Then apply transitions
  let currentInput = '[v0]';
  let offset = 0;

  for (let i = 1; i < assets.length; i++) {
    const scene = scenes[i - 1];
    const transitionType = scene?.transitionOut || 'cut';

    // Calculate offset (duration of previous clips minus transition overlap)
    if (i === 1) {
      offset = scenes[0]?.duration || 5;
    } else {
      offset += (scenes[i - 1]?.duration || 5) - transitionDuration;
    }

    if (transitionType !== 'cut') {
      const outLabel = i === assets.length - 1 ? '[outv]' : `[xfade${i}]`;
      filterParts.push(
        `${currentInput}[v${i}]xfade=transition=${transitionType === 'wipe' ? 'wipeleft' : transitionType}:duration=${transitionDuration}:offset=${offset - transitionDuration}${outLabel}`
      );
      currentInput = outLabel === '[outv]' ? '' : outLabel;
    } else {
      // For cuts, just concatenate
      if (i === assets.length - 1) {
        filterParts.push(`${currentInput}[v${i}]concat=n=2:v=1:a=0[outv]`);
      } else {
        filterParts.push(`${currentInput}[v${i}]concat=n=2:v=1:a=0[concat${i}]`);
        currentInput = `[concat${i}]`;
      }
    }
  }

  // If we ended with a non-transition, we need to handle the final output
  if (!filterParts[filterParts.length - 1].includes('[outv]')) {
    // Simple concatenation fallback
    const concatInputs = assets.map((_, i) => `[v${i}]`).join('');
    filterParts.length = assets.length; // Keep only scale filters
    filterParts.push(`${concatInputs}concat=n=${assets.length}:v=1:a=0[outv]`);
  }

  const filterComplex = filterParts.join(';');

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    // Add all inputs
    for (const asset of assets) {
      cmd.input(asset.localPath);
    }

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[outv]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .output(options.outputPath)
      .on('start', (cmdLine) => {
        console.log(`[Assembler] Running: ${cmdLine}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`[Assembler] Progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Main assembly function
export async function assembleStoryboard(
  storyboard: Storyboard,
  assets: ResolvedAsset[],
  outputPath: string
): Promise<void> {
  const hasTransitions = storyboard.scenes.some(
    s => s.transitionIn !== 'cut' || s.transitionOut !== 'cut'
  );

  const [width, height] = storyboard.outputResolution;

  if (hasTransitions) {
    await assembleWithTransitions(assets, storyboard.scenes, {
      outputPath,
      width,
      height,
      fps: storyboard.outputFps,
    });
  } else {
    await assembleSimple(assets, {
      outputPath,
      width,
      height,
      fps: storyboard.outputFps,
    });
  }

  console.log(`[Assembler] Final video saved to: ${outputPath}`);
}
