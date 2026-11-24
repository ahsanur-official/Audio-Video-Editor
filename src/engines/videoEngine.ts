import type { ColorGradingSettings, VideoClipModel, VideoOverlayModel } from '../types/mixora';
import { DEFAULT_COLOR_GRADING } from '../types/mixora';

const ACCEPTED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'];

export const COLOR_GRADING_PRESETS: Record<string, ColorGradingSettings> = {
  Natural: { ...DEFAULT_COLOR_GRADING, filterPreset: 'Natural' },
  Cinematic: {
    ...DEFAULT_COLOR_GRADING,
    contrast: 18,
    saturation: -8,
    temperature: -6,
    highlights: -12,
    shadows: 8,
    blacks: -10,
    blueGain: 8,
    redGain: 4,
    vibrance: 14,
    gamma: 0.96,
    filterPreset: 'Cinematic',
  },
  Warm: {
    ...DEFAULT_COLOR_GRADING,
    temperature: 28,
    tint: 4,
    saturation: 12,
    exposure: 4,
    redGain: 10,
    blueGain: -8,
    filterPreset: 'Warm',
  },
  Cool: {
    ...DEFAULT_COLOR_GRADING,
    temperature: -26,
    tint: -4,
    contrast: 8,
    blueGain: 14,
    redGain: -6,
    filterPreset: 'Cool',
  },
  Vintage: {
    ...DEFAULT_COLOR_GRADING,
    contrast: -8,
    saturation: -24,
    temperature: 20,
    tint: 8,
    blacks: 14,
    lift: 10,
    gamma: 1.08,
    filterPreset: 'Vintage',
  },
  Film: {
    ...DEFAULT_COLOR_GRADING,
    contrast: 14,
    saturation: -12,
    highlights: -18,
    shadows: 12,
    blacks: 6,
    greenGain: 4,
    redGain: 6,
    vibrance: 10,
    filterPreset: 'Film',
  },
  Moody: {
    ...DEFAULT_COLOR_GRADING,
    exposure: -12,
    contrast: 26,
    saturation: -22,
    shadows: -16,
    blacks: -14,
    temperature: -12,
    gamma: 0.9,
    filterPreset: 'Moody',
  },
  'Black and White': {
    ...DEFAULT_COLOR_GRADING,
    saturation: -100,
    contrast: 22,
    highlights: 8,
    blacks: -12,
    filterPreset: 'Black and White',
  },
};

export function validateVideoFile(file: File): { valid: boolean; reason?: string } {
  const lower = file.name.toLowerCase();
  const hasExt = ACCEPTED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const hasMime = file.type.startsWith('video/');
  if (!hasExt && !hasMime) {
    return {
      valid: false,
      reason: `Unsupported video file (${file.type || file.name}). Use MP4, WebM, or browser-supported MOV.`,
    };
  }
  if (file.size === 0) {
    return { valid: false, reason: 'The selected video file is empty.' };
  }
  return { valid: true };
}

export async function probeVideoFile(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
  objectUrl: string;
}> {
  const validation = validateVideoFile(file);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = objectUrl;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      if (!Number.isFinite(video.duration) || video.videoWidth === 0) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Browser could not decode video metadata for "${file.name}". Codec may be unsupported.`));
        return;
      }
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        objectUrl,
      });
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to load "${file.name}". Codec may be unsupported or file corrupted.`));
    };
  });
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Checks if any advanced pixel-level color grading parameters deviate from defaults.
 */
export function hasActiveColorGrading(g: ColorGradingSettings): boolean {
  return (
    g.brightness !== 0 ||
    g.contrast !== 0 ||
    g.exposure !== 0 ||
    g.saturation !== 0 ||
    g.temperature !== 0 ||
    g.tint !== 0 ||
    g.highlights !== 0 ||
    g.shadows !== 0 ||
    g.whites !== 0 ||
    g.blacks !== 0 ||
    g.redGain !== 0 ||
    g.greenGain !== 0 ||
    g.blueGain !== 0 ||
    g.hue !== 0 ||
    g.vibrance !== 0 ||
    g.gamma !== 1 ||
    g.lift !== 0 ||
    g.gain !== 1
  );
}

/**
 * Pixel-accurate Color Grading processor applied identically in BOTH real-time preview canvas
 * and final exported video frames.
 */
export function applyColorGradingToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  g: ColorGradingSettings,
  splitBeforeAfterRatio?: number // If set (0..1), left side stays ungraded, right side graded
): void {
  if (!hasActiveColorGrading(g)) return;

  const startX = splitBeforeAfterRatio != null ? Math.floor(width * splitBeforeAfterRatio) : 0;
  const regionW = width - startX;
  if (regionW <= 0 || height <= 0) return;

  const imgData = ctx.getImageData(startX, 0, regionW, height);
  const data = imgData.data;

  const exposureMul = Math.pow(2, g.exposure / 50);
  const brightOffset = (g.brightness / 100) * 90;
  const contrastFactor = (100 + g.contrast) / 100;
  const satFactor = (100 + g.saturation) / 100;
  const vibranceAmt = g.vibrance / 100;
  const tempShift = (g.temperature / 100) * 32;
  const tintShift = (g.tint / 100) * 24;
  const highlightsAmt = (g.highlights / 100) * 48;
  const shadowsAmt = (g.shadows / 100) * 48;
  const whitesAmt = (g.whites / 100) * 42;
  const blacksAmt = (g.blacks / 100) * 42;
  const rMul = (1 + g.redGain / 100) * g.gain;
  const gMul = (1 + g.greenGain / 100) * g.gain;
  const bMul = (1 + g.blueGain / 100) * g.gain;
  const liftOffset = (g.lift / 50) * 35;
  const invGamma = 1 / Math.max(0.2, g.gamma);

  // Hue rotation matrix precomputation
  const hueRad = (g.hue * Math.PI) / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);
  const applyHue = Math.abs(g.hue) > 0.5;

  // Build 256-entry gamma LUT for speed
  const gammaLut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    gammaLut[i] = Math.round(Math.pow(i / 255, invGamma) * 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let gr = data[i + 1];
    let b = data[i + 2];

    // Exposure + Gain + RGB Balance + Lift + Brightness
    r = r * exposureMul * rMul + liftOffset + brightOffset + tempShift;
    gr = gr * exposureMul * gMul + liftOffset + brightOffset - tintShift;
    b = b * exposureMul * bMul + liftOffset + brightOffset - tempShift;

    // Contrast around midpoint 128
    r = (r - 128) * contrastFactor + 128;
    gr = (gr - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    // Luminance-targeted Highlights / Shadows / Whites / Blacks
    const lum = (0.299 * r + 0.587 * gr + 0.114 * b) / 255;
    let tonalDelta = 0;
    if (lum > 0.5) {
      const hiWeight = (lum - 0.5) * 2;
      tonalDelta += highlightsAmt * hiWeight;
      if (lum > 0.78) {
        tonalDelta += whitesAmt * ((lum - 0.78) / 0.22);
      }
    } else {
      const shWeight = (0.5 - lum) * 2;
      tonalDelta += shadowsAmt * shWeight;
      if (lum < 0.22) {
        tonalDelta += blacksAmt * ((0.22 - lum) / 0.22);
      }
    }
    r += tonalDelta;
    gr += tonalDelta;
    b += tonalDelta;

    // Saturation & Vibrance
    const gray = 0.299 * r + 0.587 * gr + 0.114 * b;
    let effSat = satFactor;
    if (vibranceAmt !== 0) {
      const maxC = Math.max(r, gr, b);
      const minC = Math.min(r, gr, b);
      const currSat = maxC > 0 ? (maxC - minC) / maxC : 0;
      effSat += vibranceAmt * (1 - currSat);
    }
    r = gray + (r - gray) * effSat;
    gr = gray + (gr - gray) * effSat;
    b = gray + (b - gray) * effSat;

    // Optional Hue rotation
    if (applyHue) {
      const nr =
        r * (0.213 + cosH * 0.787 - sinH * 0.213) +
        gr * (0.715 - cosH * 0.715 - sinH * 0.715) +
        b * (0.072 - cosH * 0.072 + sinH * 0.928);
      const ng =
        r * (0.213 - cosH * 0.213 + sinH * 0.143) +
        gr * (0.715 + cosH * 0.285 + sinH * 0.14) +
        b * (0.072 - cosH * 0.072 - sinH * 0.283);
      const nb =
        r * (0.213 - cosH * 0.213 - sinH * 0.787) +
        gr * (0.715 - cosH * 0.715 + sinH * 0.715) +
        b * (0.072 + cosH * 0.928 + sinH * 0.072);
      r = nr;
      gr = ng;
      b = nb;
    }

    // Gamma LUT + clamp
    data[i] = gammaLut[clamp255(Math.round(r))];
    data[i + 1] = gammaLut[clamp255(Math.round(gr))];
    data[i + 2] = gammaLut[clamp255(Math.round(b))];
  }

  ctx.putImageData(imgData, startX, 0);
}

/**
 * Draws a single video clip frame with crop, rotate, flip, and transition effects.
 */
export function drawVideoClipFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  clip: VideoClipModel,
  localTime: number,
  canvasW: number,
  canvasH: number
): void {
  const vw = video.videoWidth || canvasW;
  const vh = video.videoHeight || canvasH;
  const sx = Math.floor(clip.cropX * vw);
  const sy = Math.floor(clip.cropY * vh);
  const sw = Math.max(16, Math.floor(clip.cropW * vw));
  const sh = Math.max(16, Math.floor(clip.cropH * vh));

  // Transition progress (0 -> 1 over transitionDuration)
  let progress = 1;
  if (clip.transitionIn !== 'none' && clip.transitionDuration > 0 && localTime < clip.transitionDuration) {
    progress = Math.max(0, Math.min(1, localTime / clip.transitionDuration));
  }

  ctx.save();

  if (clip.transitionIn === 'fade' || clip.transitionIn === 'crossfade' || clip.transitionIn === 'dissolve') {
    ctx.globalAlpha = progress;
  }

  ctx.translate(canvasW / 2, canvasH / 2);

  if (clip.transitionIn === 'slide') {
    ctx.translate((1 - progress) * canvasW * 0.4, 0);
    ctx.globalAlpha = Math.min(1, progress * 1.4);
  } else if (clip.transitionIn === 'zoom') {
    const z = 1.25 - 0.25 * progress;
    ctx.scale(z, z);
    ctx.globalAlpha = progress;
  }

  if (clip.rotation !== 0) {
    ctx.rotate((clip.rotation * Math.PI) / 180);
  }
  ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);

  // Aspect-ratio fit inside canvas
  const isRotated90 = clip.rotation === 90 || clip.rotation === 270;
  const targetW = isRotated90 ? canvasH : canvasW;
  const targetH = isRotated90 ? canvasW : canvasH;
  const scale = Math.min(targetW / sw, targetH / sh);
  const drawW = sw * scale;
  const drawH = sh * scale;

  ctx.drawImage(video, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

/**
 * Draws text, titles, subtitles, and shape overlays with animations at the current timestamp.
 */
export function drawOverlaysAtTime(
  ctx: CanvasRenderingContext2D,
  overlays: VideoOverlayModel[],
  currentTime: number,
  canvasW: number,
  canvasH: number
): void {
  for (const ov of overlays) {
    if (currentTime < ov.startTime || currentTime > ov.endTime) continue;

    const elapsed = currentTime - ov.startTime;
    const animDur = 0.45;
    const t = Math.min(1, elapsed / animDur);

    ctx.save();
    let offsetY = 0;
    let scale = 1;
    if (ov.animation === 'fade') {
      ctx.globalAlpha = t;
    } else if (ov.animation === 'slide-up') {
      ctx.globalAlpha = t;
      offsetY = (1 - t) * 28;
    } else if (ov.animation === 'zoom') {
      ctx.globalAlpha = t;
      scale = 0.8 + 0.2 * t;
    }

    const px = (ov.x / 100) * canvasW;
    const py = (ov.y / 100) * canvasH + offsetY;

    ctx.translate(px, py);
    ctx.scale(scale, scale);

    if (ov.kind === 'rect') {
      const rw = (ov.width / 100) * canvasW;
      const rh = (ov.height / 100) * canvasH;
      ctx.fillStyle = ov.backgroundColor || 'rgba(139, 92, 246, 0.75)';
      ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
    } else if (ov.kind === 'circle') {
      const radius = ((ov.width / 100) * Math.min(canvasW, canvasH)) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = ov.backgroundColor || 'rgba(34, 211, 238, 0.65)';
      ctx.fill();
    } else {
      const scaledFont = Math.max(12, Math.round((ov.fontSize / 720) * canvasH));
      ctx.font = `${ov.kind === 'title' ? '700' : '600'} ${scaledFont}px "${ov.fontFamily}", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textMetrics = ctx.measureText(ov.text);
      const padX = scaledFont * 0.6;
      const padY = scaledFont * 0.35;
      const boxW = textMetrics.width + padX * 2;
      const boxH = scaledFont + padY * 2;

      if (ov.backgroundColor && ov.backgroundColor !== 'transparent') {
        ctx.fillStyle = ov.backgroundColor;
        ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
      }

      if (ov.kind === 'lower-third') {
        ctx.fillStyle = '#8B5CF6';
        ctx.fillRect(-boxW / 2, boxH / 2 - 4, boxW, 4);
      }

      if (ov.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
      }

      ctx.fillStyle = ov.color || '#F8FAFC';
      ctx.fillText(ov.text, 0, 0);
    }

    ctx.restore();
  }
}

/**
 * Extracts still PNG frames from a video file at specified timestamps.
 */
export async function extractVideoFrames(
  file: File,
  count = 6
): Promise<{ time: number; dataUrl: string; blob: Blob }[]> {
  const { duration, width, height, objectUrl } = await probeVideoFile(file);
  const video = document.createElement('video');
  video.muted = true;
  video.src = objectUrl;
  await new Promise<void>((res) => {
    video.onloadeddata = () => res();
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(1280, width);
  canvas.height = Math.round((canvas.width / width) * height);
  const ctx = canvas.getContext('2d')!;

  const results: { time: number; dataUrl: string; blob: Blob }[] = [];
  const safeCount = Math.max(1, Math.min(16, count));

  for (let i = 0; i < safeCount; i++) {
    const t = safeCount === 1 ? duration * 0.25 : (duration * (i + 0.5)) / safeCount;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(duration - 0.05, Math.max(0, t));
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    results.push({ time: Number(t.toFixed(2)), dataUrl, blob });
  }

  URL.revokeObjectURL(objectUrl);
  return results;
}

/**
 * Generates a real, playable 5-second procedural cinema test video clip purely in the browser
 * (Canvas2D + MediaRecorder) so users can test Video Studio and Color Grading immediately.
 */
export async function generateSampleVideoFile(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<File>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      resolve(new File([blob], 'mixora-horizon-sample.webm', { type: mime }));
    };
  });

  recorder.start();
  const totalFrames = 120; // 4 seconds at 30fps
  for (let f = 0; f < totalFrames; f++) {
    const p = f / totalFrames;
    // Rich dusk landscape gradient with dynamic light & geometric skyline for color grading testing
    const grad = ctx.createLinearGradient(0, 0, 0, 720);
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(0.45, '#312E81');
    grad.addColorStop(0.72, '#D97706');
    grad.addColorStop(1, '#111827');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    // Moving sun/moon disc
    const sunX = 360 + p * 540;
    const sunY = 390 - Math.sin(p * Math.PI) * 90;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 150);
    sunGrad.addColorStop(0, '#FEF3C7');
    sunGrad.addColorStop(0.35, 'rgba(251, 191, 36, 0.75)');
    sunGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 150, 0, Math.PI * 2);
    ctx.fill();

    // Layered mountains
    ctx.fillStyle = '#1E1B4B';
    ctx.beginPath();
    ctx.moveTo(0, 560);
    for (let x = 0; x <= 1280; x += 80) {
      const y = 470 + Math.sin(x * 0.008 + p * 1.4) * 55 + Math.cos(x * 0.02) * 24;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(1280, 720);
    ctx.lineTo(0, 720);
    ctx.closePath();
    ctx.fill();

    // Foreground water reflection streaks
    ctx.fillStyle = '#09090D';
    ctx.fillRect(0, 560, 1280, 160);
    for (let r = 0; r < 14; r++) {
      const ry = 574 + r * 10;
      const rw = 140 - r * 7 + Math.sin(p * 12 + r) * 20;
      ctx.fillStyle = `rgba(251, 191, 36, ${0.35 - r * 0.02})`;
      ctx.fillRect(sunX - rw / 2, ry, rw, 3);
    }

    // Color checker swatches in subtle bottom bar for grading verification
    const swatches = ['#EF4444', '#F59E0B', '#22C55E', '#22D3EE', '#3B82F6', '#8B5CF6', '#F8FAFC'];
    swatches.forEach((c, idx) => {
      ctx.fillStyle = c;
      ctx.fillRect(40 + idx * 32, 668, 22, 14);
    });

    await new Promise((r) => setTimeout(r, 25));
  }

  recorder.stop();
  return await done;
}
