import { Mp3Encoder } from '@breezystack/lamejs';
import type { AudioTrackEffects, AudioTrackModel } from '../types/mixora';

const ACCEPTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.webm'];

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

export function validateAudioFile(file: File): { valid: boolean; reason?: string } {
  const lower = file.name.toLowerCase();
  const hasAllowedExt = ACCEPTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const hasAudioMime = file.type.startsWith('audio/') || file.type === 'video/webm';
  if (!hasAllowedExt && !hasAudioMime) {
    return {
      valid: false,
      reason: `Unsupported audio format (${file.type || file.name}). Supported formats: MP3, WAV, FLAC, OGG, AAC/M4A.`,
    };
  }
  if (file.size === 0) {
    return { valid: false, reason: 'The selected file is empty (0 bytes).' };
  }
  if (file.size > 250 * 1024 * 1024) {
    return {
      valid: false,
      reason: 'File exceeds 250 MB local browser memory safeguard. Trim or compress before importing.',
    };
  }
  return { valid: true };
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const validation = validateAudioFile(file);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  const ctx = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new Error(
      `Unable to decode "${file.name}". The file may be corrupted or use an unsupported codec in this browser.`
    );
  }
}

export function extractWaveformPeaks(buffer: AudioBuffer, bucketCount = 600): number[] {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / bucketCount));
  const peaks: number[] = new Array(bucketCount);

  for (let i = 0; i < bucketCount; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    let max = 0;
    const step = Math.max(1, Math.floor((end - start) / 64));
    for (let j = start; j < end; j += step) {
      const val = Math.abs(channelData[j]);
      if (val > max) max = val;
    }
    peaks[i] = max;
  }
  return peaks;
}

export function reverseAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const ctx = getAudioContext();
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      dst[i] = src[src.length - 1 - i];
    }
  }
  return out;
}

export function sliceAudioBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const ctx = getAudioContext();
  const safeStart = Math.max(0, Math.min(startSec, buffer.duration));
  const safeEnd = Math.max(safeStart + 0.05, Math.min(endSec, buffer.duration));
  const startSample = Math.floor(safeStart * buffer.sampleRate);
  const endSample = Math.floor(safeEnd * buffer.sampleRate);
  const length = Math.max(1, endSample - startSample);
  const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    out.getChannelData(ch).set(src.subarray(startSample, endSample));
  }
  return out;
}

export function concatAudioBuffers(buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) {
    throw new Error('No audio buffers provided to merge.');
  }
  const ctx = getAudioContext();
  const sampleRate = buffers[0].sampleRate;
  const numChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = ctx.createBuffer(numChannels, totalLength, sampleRate);

  let offset = 0;
  for (const buf of buffers) {
    for (let ch = 0; ch < numChannels; ch++) {
      const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
      out.getChannelData(ch).set(src, offset);
    }
    offset += buf.length;
  }
  return out;
}

function createReverbImpulse(ctx: BaseAudioContext, duration = 2.0, decay = 2.6): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const channel = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = amount * 2.5;
  const nSamples = 2048;
  const curve = new Float32Array(new ArrayBuffer(nSamples * 4));
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; i++) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export interface TrackEffectChainNodes {
  input: GainNode;
  output: GainNode;
  updateEffects: (fx: AudioTrackEffects) => void;
}

export function buildTrackEffectChain(ctx: BaseAudioContext, fx: AudioTrackEffects): TrackEffectChainNodes {
  const input = ctx.createGain();
  const output = ctx.createGain();

  // High-pass & Low-pass filters
  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = Math.max(20, fx.highPassFreq);

  const lowPass = ctx.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.value = Math.min(20000, fx.lowPassFreq);

  // Noise reduction subtle high-shelf + low-rumble filter
  const denoiseFilter = ctx.createBiquadFilter();
  denoiseFilter.type = 'highshelf';
  denoiseFilter.frequency.value = 6500;
  denoiseFilter.gain.value = -fx.noiseReduction * 14;

  // 3-Band EQ + Bass Boost
  const eqLow = ctx.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = 220;
  eqLow.gain.value = fx.eqLow + fx.bassBoost;

  const eqMid = ctx.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.frequency.value = 1200;
  eqMid.Q.value = 1.0;
  eqMid.gain.value = fx.eqMid;

  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = 5000;
  eqHigh.gain.value = fx.eqHigh;

  // Distortion
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';
  shaper.curve = fx.distortionAmount > 0 ? createDistortionCurve(fx.distortionAmount) : null;

  // Compressor
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = fx.compressorThreshold;
  compressor.ratio.value = fx.compressorRatio;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.15;

  // Limiter
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = fx.limiterEnabled ? -1.5 : 0;
  limiter.ratio.value = fx.limiterEnabled ? 20 : 1;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  // Dry / Wet routing for Reverb & Delay/Echo
  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;

  const reverbNode = ctx.createConvolver();
  reverbNode.buffer = createReverbImpulse(ctx, 1.8, 2.4);
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = fx.reverbMix * 0.7;

  const delayNode = ctx.createDelay(2.0);
  delayNode.delayTime.value = Math.max(0.01, fx.delayTime);
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = Math.min(0.82, fx.delayFeedback);
  const delayWet = ctx.createGain();
  delayWet.gain.value = fx.echoMix * 0.75;

  // Connect serial chain
  input.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(denoiseFilter);
  denoiseFilter.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(shaper);
  shaper.connect(compressor);
  compressor.connect(limiter);

  // Split to dry + reverb + delay
  limiter.connect(dryGain);
  dryGain.connect(output);

  limiter.connect(reverbNode);
  reverbNode.connect(reverbWet);
  reverbWet.connect(output);

  limiter.connect(delayNode);
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(delayWet);
  delayWet.connect(output);

  const updateEffects = (next: AudioTrackEffects) => {
    const now = ctx.currentTime;
    highPass.frequency.setTargetAtTime(Math.max(20, next.highPassFreq), now, 0.02);
    lowPass.frequency.setTargetAtTime(Math.min(20000, next.lowPassFreq), now, 0.02);
    denoiseFilter.gain.setTargetAtTime(-next.noiseReduction * 14, now, 0.02);
    eqLow.gain.setTargetAtTime(next.eqLow + next.bassBoost, now, 0.02);
    eqMid.gain.setTargetAtTime(next.eqMid, now, 0.02);
    eqHigh.gain.setTargetAtTime(next.eqHigh, now, 0.02);
    shaper.curve = next.distortionAmount > 0 ? createDistortionCurve(next.distortionAmount) : null;
    compressor.threshold.setTargetAtTime(next.compressorThreshold, now, 0.02);
    compressor.ratio.setTargetAtTime(next.compressorRatio, now, 0.02);
    limiter.threshold.setTargetAtTime(next.limiterEnabled ? -1.5 : 0, now, 0.02);
    limiter.ratio.setTargetAtTime(next.limiterEnabled ? 20 : 1, now, 0.02);
    reverbWet.gain.setTargetAtTime(next.reverbMix * 0.7, now, 0.02);
    delayNode.delayTime.setTargetAtTime(Math.max(0.01, next.delayTime), now, 0.02);
    delayFeedback.gain.setTargetAtTime(Math.min(0.82, next.delayFeedback), now, 0.02);
    delayWet.gain.setTargetAtTime(next.echoMix * 0.75, now, 0.02);
  };

  return { input, output, updateEffects };
}

/**
 * Peak-normalizes an AudioBuffer in place to targetPeak (default -1 dBFS = 0.89125).
 */
export function normalizeAudioBuffer(buffer: AudioBuffer, targetPeak = 0.89125): AudioBuffer {
  let maxPeak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > maxPeak) maxPeak = a;
    }
  }
  if (maxPeak <= 0.00001) return buffer;
  const gain = targetPeak / maxPeak;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.max(-1, Math.min(1, data[i] * gain));
    }
  }
  return buffer;
}

/**
 * Resamples an AudioBuffer to a new sample rate and/or channel count via OfflineAudioContext.
 */
export async function resampleAudioBuffer(
  buffer: AudioBuffer,
  targetSampleRate: number,
  targetChannels: 1 | 2 = Math.min(2, buffer.numberOfChannels) as 1 | 2
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate && buffer.numberOfChannels === targetChannels) {
    return buffer;
  }
  const length = Math.max(1, Math.ceil(buffer.duration * targetSampleRate));
  const offline = new OfflineAudioContext(targetChannels, length, targetSampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  return await offline.startRendering();
}

/**
 * Estimates final exported audio size in bytes for live UI quality feedback.
 */
export function estimateAudioExportBytes(
  durationSec: number,
  format: 'wav' | 'mp3',
  sampleRate: number,
  channels: 1 | 2,
  bitDepthOrKbps: number
): number {
  const safeDur = Math.max(0.1, durationSec);
  if (format === 'wav') {
    const bytesPerSample = bitDepthOrKbps / 8;
    return Math.round(44 + safeDur * sampleRate * channels * bytesPerSample);
  }
  return Math.round((safeDur * bitDepthOrKbps * 1000) / 8);
}

/**
 * Renders multitrack arrangement (or a selected region) offline through all real Web Audio effects.
 */
export async function renderMixOffline(
  tracks: AudioTrackModel[],
  masterVolume: number,
  region?: { start: number; end: number },
  sampleRate = 44100,
  channels: 1 | 2 = 2,
  normalize = false
): Promise<AudioBuffer> {
  const anySolo = tracks.some((t) => t.solo);
  const playable = tracks.filter((t) => t.buffer && !t.mute && (!anySolo || t.solo));
  if (playable.length === 0) {
    throw new Error('No audible tracks available to render.');
  }

  let totalDuration = 0;
  for (const t of playable) {
    const clipDur = Math.max(0.05, (t.trimEnd - t.trimStart) / Math.max(0.25, t.speed));
    totalDuration = Math.max(
      totalDuration,
      t.startOffset + clipDur + (t.effects.reverbMix > 0 || t.effects.echoMix > 0 ? 1.5 : 0)
    );
  }

  const startSec = region ? Math.max(0, region.start) : 0;
  const endSec = region ? Math.min(totalDuration, Math.max(startSec + 0.1, region.end)) : totalDuration;
  const renderDur = Math.max(0.1, endSec - startSec);
  const totalSamples = Math.ceil(renderDur * sampleRate);

  const offlineCtx = new OfflineAudioContext(channels, totalSamples, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = masterVolume;
  masterGain.connect(offlineCtx.destination);

  for (const track of playable) {
    if (!track.buffer) continue;
    const rawBuf = track.reversed ? reverseAudioBuffer(track.buffer) : track.buffer;
    const source = offlineCtx.createBufferSource();
    source.buffer = rawBuf;
    const pitchFactor = Math.pow(2, track.pitchSemitones / 12);
    source.playbackRate.value = Math.max(0.25, Math.min(4, track.speed * pitchFactor));

    const fxChain = buildTrackEffectChain(offlineCtx, track.effects);
    const panner = offlineCtx.createStereoPanner();
    panner.pan.value = track.pan;

    const trackGain = offlineCtx.createGain();
    const effectiveDur = (track.trimEnd - track.trimStart) / source.playbackRate.value;
    const relStart = track.startOffset - startSec;
    const relEnd = relStart + effectiveDur;

    if (relEnd <= 0 || relStart >= renderDur) {
      continue;
    }

    const scheduleAt = Math.max(0, relStart);
    const offsetSkip = relStart < 0 ? -relStart * source.playbackRate.value : 0;
    const bufferOffset = Math.min(rawBuf.duration - 0.01, track.trimStart + offsetSkip);
    const bufferDuration = Math.max(0.01, track.trimEnd - track.trimStart - offsetSkip);

    // Apply fade-in / fade-out envelopes
    trackGain.gain.setValueAtTime(track.volume, scheduleAt);
    if (track.fadeIn > 0 && relStart >= 0) {
      trackGain.gain.setValueAtTime(0.0001, scheduleAt);
      trackGain.gain.linearRampToValueAtTime(
        Math.max(0.0001, track.volume),
        scheduleAt + Math.min(track.fadeIn, effectiveDur / 2)
      );
    }
    if (track.fadeOut > 0) {
      const fadeStart = Math.max(scheduleAt, relEnd - Math.min(track.fadeOut, effectiveDur / 2));
      trackGain.gain.setValueAtTime(Math.max(0.0001, track.volume), fadeStart);
      trackGain.gain.linearRampToValueAtTime(0.0001, Math.min(renderDur, relEnd));
    }

    source.connect(fxChain.input);
    fxChain.output.connect(panner);
    panner.connect(trackGain);
    trackGain.connect(masterGain);

    source.start(scheduleAt, bufferOffset, bufferDuration);
  }

  const rendered = await offlineCtx.startRendering();
  return normalize ? normalizeAudioBuffer(rendered) : rendered;
}

/**
 * Encodes an AudioBuffer into a true WAV Blob (16-bit PCM, 24-bit PCM, or 32-bit IEEE Float).
 */
export function encodeAudioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 | 32 = 16): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // 3 = IEEE Float, 1 = Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      if (bitDepth === 16) {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      } else if (bitDepth === 24) {
        const val = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      } else {
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Encodes an AudioBuffer into a true MP3 Blob using pure-JS LAME encoder in async chunks.
 * Automatically resamples >48kHz buffers down to 48kHz for MP3 MPEG-1 spec compliance.
 */
export async function encodeAudioBufferToMp3(
  buffer: AudioBuffer,
  kbps = 192,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const safeBuffer =
    buffer.sampleRate > 48000 ? await resampleAudioBuffer(buffer, 48000) : buffer;
  const numChannels = Math.min(2, safeBuffer.numberOfChannels);
  const sampleRate = safeBuffer.sampleRate;
  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

  const leftFloat = safeBuffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? safeBuffer.getChannelData(1) : leftFloat;
  const totalSamples = safeBuffer.length;
  const chunkSize = 1152 * 16;
  const mp3Parts: Uint8Array[] = [];

  for (let i = 0; i < totalSamples; i += chunkSize) {
    const end = Math.min(i + chunkSize, totalSamples);
    const len = end - i;
    const leftInt = new Int16Array(len);
    const rightInt = new Int16Array(len);
    for (let j = 0; j < len; j++) {
      const l = Math.max(-1, Math.min(1, leftFloat[i + j]));
      const r = Math.max(-1, Math.min(1, rightFloat[i + j]));
      leftInt[j] = l < 0 ? l * 0x8000 : l * 0x7fff;
      rightInt[j] = r < 0 ? r * 0x8000 : r * 0x7fff;
    }
    const encoded = numChannels === 2 ? encoder.encodeBuffer(leftInt, rightInt) : encoder.encodeBuffer(leftInt);
    if (encoded.length > 0) {
      mp3Parts.push(new Uint8Array(encoded));
    }
    if (onProgress) {
      onProgress(Math.min(95, Math.round((end / totalSamples) * 95)));
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Parts.push(new Uint8Array(flushed));
  }
  onProgress?.(100);

  return new Blob(mp3Parts as BlobPart[], { type: 'audio/mpeg' });
}

/**
 * One-click studio mastering & creative FX presets backed by real Web Audio DSP chains.
 */
export const AUDIO_FX_PRESETS: Record<
  string,
  { label: string; badge: string; effects: AudioTrackEffects }
> = {
  flat: {
    label: 'Flat Studio',
    badge: 'Neutral',
    effects: {
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
      bassBoost: 0,
      reverbMix: 0,
      delayTime: 0.25,
      delayFeedback: 0.3,
      echoMix: 0,
      compressorThreshold: -18,
      compressorRatio: 3,
      limiterEnabled: true,
      distortionAmount: 0,
      noiseReduction: 0,
      highPassFreq: 20,
      lowPassFreq: 20000,
    },
  },
  club_bass: {
    label: 'Club Bass',
    badge: 'Punchy',
    effects: {
      eqLow: 4,
      eqMid: -1.5,
      eqHigh: 3,
      bassBoost: 6,
      reverbMix: 0.12,
      delayTime: 0.25,
      delayFeedback: 0.25,
      echoMix: 0,
      compressorThreshold: -22,
      compressorRatio: 5,
      limiterEnabled: true,
      distortionAmount: 4,
      noiseReduction: 0,
      highPassFreq: 28,
      lowPassFreq: 19000,
    },
  },
  podcast_voice: {
    label: 'Podcast Voice',
    badge: 'Clarity',
    effects: {
      eqLow: -2,
      eqMid: 3.5,
      eqHigh: 2.5,
      bassBoost: 0,
      reverbMix: 0.04,
      delayTime: 0.2,
      delayFeedback: 0.15,
      echoMix: 0,
      compressorThreshold: -24,
      compressorRatio: 4.5,
      limiterEnabled: true,
      distortionAmount: 0,
      noiseReduction: 0.35,
      highPassFreq: 85,
      lowPassFreq: 16000,
    },
  },
  crystal_master: {
    label: 'Crystal Master',
    badge: 'Bright',
    effects: {
      eqLow: 2,
      eqMid: 1,
      eqHigh: 4.5,
      bassBoost: 2,
      reverbMix: 0.1,
      delayTime: 0.25,
      delayFeedback: 0.2,
      echoMix: 0,
      compressorThreshold: -16,
      compressorRatio: 3.5,
      limiterEnabled: true,
      distortionAmount: 0,
      noiseReduction: 0.1,
      highPassFreq: 30,
      lowPassFreq: 20000,
    },
  },
  warm_vinyl: {
    label: 'Warm Vinyl',
    badge: 'Analog',
    effects: {
      eqLow: 3.5,
      eqMid: 1.5,
      eqHigh: -3,
      bassBoost: 2,
      reverbMix: 0.22,
      delayTime: 0.32,
      delayFeedback: 0.28,
      echoMix: 0.08,
      compressorThreshold: -20,
      compressorRatio: 3,
      limiterEnabled: true,
      distortionAmount: 10,
      noiseReduction: 0,
      highPassFreq: 45,
      lowPassFreq: 9500,
    },
  },
  lofi_radio: {
    label: 'Lo-Fi Radio',
    badge: 'Vintage',
    effects: {
      eqLow: -4,
      eqMid: 4,
      eqHigh: -6,
      bassBoost: 0,
      reverbMix: 0.35,
      delayTime: 0.38,
      delayFeedback: 0.42,
      echoMix: 0.2,
      compressorThreshold: -26,
      compressorRatio: 6,
      limiterEnabled: true,
      distortionAmount: 18,
      noiseReduction: 0,
      highPassFreq: 240,
      lowPassFreq: 4600,
    },
  },
};

export interface DjSamplerPad {
  id: string;
  label: string;
  keyHint: string;
  accent: string;
}

export const DJ_SAMPLER_PADS: DjSamplerPad[] = [
  { id: 'kick', label: '808 Kick', keyHint: '1', accent: '#8B5CF6' },
  { id: 'snare', label: 'Punch Snare', keyHint: '2', accent: '#3B82F6' },
  { id: 'clap', label: 'Club Clap', keyHint: '3', accent: '#22D3EE' },
  { id: 'hat', label: 'Crisp Hat', keyHint: '4', accent: '#A3E635' },
  { id: 'sub', label: 'Sub Drop', keyHint: '5', accent: '#F43F5E' },
  { id: 'riser', label: 'FX Riser', keyHint: '6', accent: '#F59E0B' },
  { id: 'laser', label: 'Synth Laser', keyHint: '7', accent: '#EC4899' },
  { id: 'horn', label: 'Air Horn', keyHint: '8', accent: '#10B981' },
];

/**
 * Synthesizes real-time DJ performance one-shot hits directly through Web Audio API.
 */
export function triggerDjSamplerPad(ctx: AudioContext, destination: AudioNode, padId: string): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.65;
  master.connect(destination);

  if (padId === 'kick') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    g.gain.setValueAtTime(1, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.38);
  } else if (padId === 'snare' || padId === 'clap' || padId === 'hat') {
    const dur = padId === 'hat' ? 0.08 : padId === 'clap' ? 0.22 : 0.18;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / (len * (padId === 'hat' ? 0.22 : 0.35)));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = padId === 'hat' ? 'highpass' : 'bandpass';
    filter.frequency.value = padId === 'hat' ? 7500 : padId === 'clap' ? 1800 : 1200;
    const g = ctx.createGain();
    g.gain.value = padId === 'hat' ? 0.55 : 0.85;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(now);

    if (padId === 'snare') {
      const tone = ctx.createOscillator();
      const tg = ctx.createGain();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(210, now);
      tone.frequency.exponentialRampToValueAtTime(110, now + 0.1);
      tg.gain.setValueAtTime(0.55, now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      tone.connect(tg);
      tg.connect(master);
      tone.start(now);
      tone.stop(now + 0.14);
    }
  } else if (padId === 'sub') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(98, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.85);
    g.gain.setValueAtTime(0.95, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 1.0);
  } else if (padId === 'riser') {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(1600, now + 1.1);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(3600, now + 1.1);
    g.gain.setValueAtTime(0.05, now);
    g.gain.linearRampToValueAtTime(0.55, now + 0.95);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
    osc.connect(filter);
    filter.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 1.2);
  } else if (padId === 'laser') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1900, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.28);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.32);
  } else if (padId === 'horn') {
    const freqs = [392, 493.88, 587.33];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.96, now);
      osc.frequency.linearRampToValueAtTime(f, now + 0.06);
      g.gain.setValueAtTime(0.26, now);
      g.gain.setValueAtTime(0.24, now + 0.42);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 0.62);
    }
  }
}

/**
 * Generates real procedural studio stems (Drums, Synth Bass, Ambient Chords) in browser memory
 * so users can immediately test editing, mashups, and DJ mixing without needing external files.
 */
export async function generateProceduralDemoTrack(
  preset: 'electronic_124' | 'lofi_96' | 'house_126' | 'synthwave_120'
): Promise<{ name: string; buffer: AudioBuffer }> {
  const sampleRate = 44100;
  const bpm =
    preset === 'electronic_124'
      ? 124
      : preset === 'lofi_96'
        ? 96
        : preset === 'synthwave_120'
          ? 120
          : 126;
  const beatDur = 60 / bpm;
  const bars = 8;
  const duration = bars * 4 * beatDur;
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

  const master = offline.createGain();
  master.gain.value = 0.72;
  master.connect(offline.destination);

  const totalBeats = bars * 4;
  for (let b = 0; b < totalBeats; b++) {
    const t = b * beatDur;
    if (preset !== 'lofi_96' || b % 2 === 0) {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(preset === 'house_126' ? 150 : preset === 'synthwave_120' ? 142 : 135, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      gain.gain.setValueAtTime(0.9, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.25);
    }

    const hatTime = t + beatDur * 0.5;
    if (hatTime < duration) {
      const noiseLen = Math.floor(sampleRate * 0.06);
      const noiseBuf = offline.createBuffer(1, noiseLen, sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.25));
      const src = offline.createBufferSource();
      src.buffer = noiseBuf;
      const hp = offline.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7200;
      const g = offline.createGain();
      g.gain.value = 0.22;
      src.connect(hp);
      hp.connect(g);
      g.connect(master);
      src.start(hatTime);
    }
  }

  const chordRoots =
    preset === 'electronic_124'
      ? [220, 174.61, 196, 164.81]
      : preset === 'house_126'
        ? [261.63, 220, 174.61, 196]
        : preset === 'synthwave_120'
          ? [220, 196, 174.61, 196]
          : [293.66, 220, 233.08, 261.63];

  for (let bar = 0; bar < bars; bar++) {
    const t = bar * 4 * beatDur;
    const root = chordRoots[bar % chordRoots.length];
    const thirdRatio = preset === 'house_126' && bar % 4 === 0 ? 1.25 : 1.1892;
    const freqs =
      preset === 'synthwave_120'
        ? [root * 2, root * thirdRatio * 2, root * 1.4983 * 2]
        : [root, root * thirdRatio, root * 1.4983];

    for (const f of freqs) {
      const osc = offline.createOscillator();
      const filter = offline.createBiquadFilter();
      const gain = offline.createGain();
      osc.type = preset === 'lofi_96' ? 'triangle' : 'sawtooth';
      osc.frequency.value = f;
      filter.type = 'lowpass';
      filter.frequency.value = preset === 'lofi_96' ? 950 : preset === 'synthwave_120' ? 2400 : 1850;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.2);
      gain.gain.setValueAtTime(0.1, t + 4 * beatDur - 0.2);
      gain.gain.linearRampToValueAtTime(0.001, t + 4 * beatDur);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 4 * beatDur);
    }

    for (let step = 0; step < 8; step++) {
      const st = t + step * (beatDur * 0.5);
      const osc = offline.createOscillator();
      const filter = offline.createBiquadFilter();
      const gain = offline.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = preset === 'synthwave_120' ? root : root * 0.5;
      filter.type = 'lowpass';
      filter.frequency.value = preset === 'synthwave_120' ? 620 : 380;
      gain.gain.setValueAtTime(0.24, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + beatDur * 0.45);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(st);
      osc.stop(st + beatDur * 0.48);
    }
  }

  const buffer = await offline.startRendering();
  const label =
    preset === 'electronic_124'
      ? 'Neon Pulse (124 BPM Am)'
      : preset === 'lofi_96'
        ? 'Midnight Tape (96 BPM Dm)'
        : preset === 'synthwave_120'
          ? 'Starlight Arp (120 BPM Am)'
          : 'Velvet House (126 BPM C)';
  return { name: label, buffer };
}
