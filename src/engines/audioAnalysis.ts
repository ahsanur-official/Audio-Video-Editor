import { getAudioContext } from './audioEngine';

export interface AudioAnalysisResult {
  bpm: number;
  bpmConfidence: number; // 0 to 1
  key: string; // e.g. "A Minor"
  camelot: string; // e.g. "8A"
  keyConfidence: number; // 0 to 1
  beatPositions: number[]; // timestamps in seconds
  duration: number;
  rmsDb: number;
  peakDb: number;
  dynamicRangeDb: number;
  sections: { label: string; start: number; end: number; energy: number }[];
}

export interface MashupCompatibilityResult {
  overallScore: number; // 0 to 100
  tempoDiffBpm: number;
  tempoRatio: number;
  recommendedBpm: number;
  harmonicRelation: string;
  harmonicScore: number;
  tempoScore: number;
  suggestedTransitionA: number;
  suggestedTransitionB: number;
  explanation: string;
}

// Krumhansl-Schmuckler major & minor pitch profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const MAJOR_CAMELOT = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const MINOR_CAMELOT = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

function pearsonCorr(a: number[], b: number[]): number {
  const n = a.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

/**
 * Estimates musical key via Goertzel pitch-class energy across octaves 2-5
 * correlated against Krumhansl-Schmuckler profiles.
 */
function detectKeyFromMono(mono: Float32Array, sampleRate: number): { key: string; camelot: string; confidence: number } {
  // Analyze up to 30 seconds from the middle of the track for representative harmony
  const maxSamples = Math.min(mono.length, sampleRate * 24);
  const startOffset = Math.max(0, Math.floor((mono.length - maxSamples) / 2));
  const decimate = Math.max(1, Math.floor(sampleRate / 8000));
  const effRate = sampleRate / decimate;
  const frameSize = 2048;
  const hopSize = 4096;
  const chroma = new Array<number>(12).fill(0);

  // Target frequencies for 12 pitch classes across octaves 2..5
  const pitchFreqs: number[][] = Array.from({ length: 12 }, (_, pc) => {
    const freqs: number[] = [];
    for (let oct = 2; oct <= 5; oct++) {
      const midi = (oct + 1) * 12 + pc;
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      if (hz < effRate * 0.45) freqs.push(hz);
    }
    return freqs;
  });

  // Precompute Goertzel coefficients
  const coeffs = pitchFreqs.map((freqs) =>
    freqs.map((f) => 2 * Math.cos((2 * Math.PI * f) / effRate))
  );

  const downsampledLen = Math.floor(maxSamples / decimate);
  const windowBuf = new Float32Array(frameSize);

  let framesProcessed = 0;
  for (let pos = 0; pos + frameSize < downsampledLen && framesProcessed < 24; pos += hopSize) {
    for (let i = 0; i < frameSize; i++) {
      const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
      windowBuf[i] = mono[startOffset + (pos + i) * decimate] * hann;
    }

    for (let pc = 0; pc < 12; pc++) {
      let pcEnergy = 0;
      for (let k = 0; k < coeffs[pc].length; k++) {
        const coeff = coeffs[pc][k];
        let s0 = 0;
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < frameSize; i++) {
          s0 = windowBuf[i] + coeff * s1 - s2;
          s2 = s1;
          s1 = s0;
        }
        const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        pcEnergy += Math.max(0, power);
      }
      chroma[pc] += Math.sqrt(pcEnergy);
    }
    framesProcessed++;
  }

  let bestScore = -2;
  let secondScore = -2;
  let bestName = 'C Major';
  let bestCamelot = '8B';

  for (let root = 0; root < 12; root++) {
    const rotated = Array.from({ length: 12 }, (_, i) => chroma[(root + i) % 12]);
    const majCorr = pearsonCorr(rotated, MAJOR_PROFILE);
    const minCorr = pearsonCorr(rotated, MINOR_PROFILE);

    if (majCorr > bestScore) {
      secondScore = bestScore;
      bestScore = majCorr;
      bestName = `${NOTE_NAMES[root]} Major`;
      bestCamelot = MAJOR_CAMELOT[root];
    } else if (majCorr > secondScore) {
      secondScore = majCorr;
    }

    if (minCorr > bestScore) {
      secondScore = bestScore;
      bestScore = minCorr;
      bestName = `${NOTE_NAMES[root]} Minor`;
      bestCamelot = MINOR_CAMELOT[root];
    } else if (minCorr > secondScore) {
      secondScore = minCorr;
    }
  }

  const confidence = Math.max(0.2, Math.min(0.98, 0.5 + (bestScore - Math.max(0, secondScore)) * 1.4));
  return { key: bestName, camelot: bestCamelot, confidence };
}

/**
 * Estimates BPM and beat positions using onset energy envelope + autocorrelation.
 */
function detectTempoAndBeats(mono: Float32Array, sampleRate: number): {
  bpm: number;
  confidence: number;
  beatPositions: number[];
} {
  const hop = 512;
  const numFrames = Math.floor(mono.length / hop);
  if (numFrames < 16) {
    return { bpm: 120, confidence: 0.2, beatPositions: [] };
  }

  const energies = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) {
      const v = mono[base + i];
      sum += v * v;
    }
    energies[f] = Math.sqrt(sum / hop);
  }

  // Positive onset difference (half-wave rectified)
  const onset = new Float32Array(numFrames);
  let meanOnset = 0;
  for (let f = 1; f < numFrames; f++) {
    const diff = energies[f] - energies[f - 1];
    onset[f] = diff > 0 ? diff : 0;
    meanOnset += onset[f];
  }
  meanOnset /= numFrames;

  const framesPerSec = sampleRate / hop;
  const minLag = Math.floor((framesPerSec * 60) / 178);
  const maxLag = Math.ceil((framesPerSec * 60) / 72);

  let bestLag = Math.round((framesPerSec * 60) / 120);
  let bestAuto = -1;
  let avgAuto = 0;
  let lagCount = 0;

  const analysisFrames = Math.min(numFrames, Math.floor(framesPerSec * 45));
  for (let lag = minLag; lag <= maxLag && lag < analysisFrames / 2; lag++) {
    let acc = 0;
    for (let i = 0; i < analysisFrames - lag; i++) {
      acc += onset[i] * onset[i + lag];
    }
    acc /= analysisFrames - lag;
    avgAuto += acc;
    lagCount++;
    if (acc > bestAuto) {
      bestAuto = acc;
      bestLag = lag;
    }
  }

  let bpm = (framesPerSec * 60) / bestLag;
  // Normalize into common musical range 78-165 BPM
  while (bpm < 78) bpm *= 2;
  while (bpm > 165) bpm /= 2;
  bpm = Math.round(bpm * 10) / 10;

  const meanA = lagCount > 0 ? avgAuto / lagCount : 0.0001;
  const confidence = Math.max(0.25, Math.min(0.97, bestAuto / (meanA * 2.4 + 1e-9)));

  // Detect beat positions by snapping to highest onset near beat period
  const beatPeriodSec = 60 / bpm;
  const duration = mono.length / sampleRate;
  // Find strongest downbeat offset within first beat period
  const firstBeatFrames = Math.min(numFrames, Math.floor(beatPeriodSec * framesPerSec));
  let bestPhaseFrame = 0;
  let bestPhaseEnergy = -1;
  for (let p = 0; p < firstBeatFrames; p++) {
    let phaseSum = 0;
    for (let k = 0; k < 16; k++) {
      const idx = Math.round(p + k * beatPeriodSec * framesPerSec);
      if (idx < numFrames) phaseSum += onset[idx];
    }
    if (phaseSum > bestPhaseEnergy) {
      bestPhaseEnergy = phaseSum;
      bestPhaseFrame = p;
    }
  }

  const beatPositions: number[] = [];
  const startBeatSec = bestPhaseFrame / framesPerSec;
  for (let t = startBeatSec; t < duration; t += beatPeriodSec) {
    beatPositions.push(Number(t.toFixed(3)));
  }

  return { bpm, confidence, beatPositions };
}

export async function analyzeAudioBuffer(buffer: AudioBuffer): Promise<AudioAnalysisResult> {
  // Yield briefly so UI remains smooth
  await new Promise((r) => setTimeout(r, 10));

  const len = buffer.length;
  const mono = new Float32Array(len);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const v = 0.5 * (ch0[i] + ch1[i]);
    mono[i] = v;
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    sumSq += v * v;
  }

  const rms = Math.sqrt(sumSq / Math.max(1, len));
  const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -96;
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -96;
  const dynamicRangeDb = Math.max(0, peakDb - rmsDb);

  const tempo = detectTempoAndBeats(mono, buffer.sampleRate);
  await new Promise((r) => setTimeout(r, 0));
  const keyInfo = detectKeyFromMono(mono, buffer.sampleRate);

  // Energy sections (split track into 4 structural blocks)
  const sectionCount = Math.min(6, Math.max(2, Math.round(buffer.duration / 8)));
  const secLen = buffer.duration / sectionCount;
  const sections: { label: string; start: number; end: number; energy: number }[] = [];
  let maxEnergy = 0.0001;
  const rawEnergies: number[] = [];

  for (let s = 0; s < sectionCount; s++) {
    const startIdx = Math.floor(s * secLen * buffer.sampleRate);
    const endIdx = Math.min(len, Math.floor((s + 1) * secLen * buffer.sampleRate));
    let sq = 0;
    for (let i = startIdx; i < endIdx; i += 4) {
      sq += mono[i] * mono[i];
    }
    const e = Math.sqrt(sq / Math.max(1, (endIdx - startIdx) / 4));
    rawEnergies.push(e);
    if (e > maxEnergy) maxEnergy = e;
  }

  for (let s = 0; s < sectionCount; s++) {
    const norm = rawEnergies[s] / maxEnergy;
    let label = 'Verse / Groove';
    if (s === 0 && norm < 0.72) label = 'Intro';
    else if (s === sectionCount - 1 && norm < 0.72) label = 'Outro';
    else if (norm >= 0.85) label = 'Peak / Chorus';
    else if (norm < 0.55) label = 'Breakdown';

    sections.push({
      label,
      start: Number((s * secLen).toFixed(2)),
      end: Number(((s + 1) * secLen).toFixed(2)),
      energy: Number(norm.toFixed(2)),
    });
  }

  return {
    bpm: tempo.bpm,
    bpmConfidence: Number(tempo.confidence.toFixed(2)),
    key: keyInfo.key,
    camelot: keyInfo.camelot,
    keyConfidence: Number(keyInfo.confidence.toFixed(2)),
    beatPositions: tempo.beatPositions,
    duration: buffer.duration,
    rmsDb: Number(rmsDb.toFixed(1)),
    peakDb: Number(peakDb.toFixed(1)),
    dynamicRangeDb: Number(dynamicRangeDb.toFixed(1)),
    sections,
  };
}

function parseCamelot(code: string): { num: number; letter: 'A' | 'B' } {
  const letter = code.endsWith('B') ? 'B' : 'A';
  const num = parseInt(code.slice(0, -1), 10) || 1;
  return { num, letter };
}

/**
 * Computes genuine Camelot wheel harmonic distance & tempo compatibility between two analyzed tracks.
 */
export function calculateMashupCompatibility(
  a: AudioAnalysisResult,
  b: AudioAnalysisResult
): MashupCompatibilityResult {
  // Handle double/half tempo gracefully
  let effectiveBpmB = b.bpm;
  if (Math.abs(a.bpm - b.bpm * 2) < Math.abs(a.bpm - b.bpm)) effectiveBpmB = b.bpm * 2;
  if (Math.abs(a.bpm - b.bpm * 0.5) < Math.abs(a.bpm - b.bpm)) effectiveBpmB = b.bpm * 0.5;

  const tempoDiffBpm = Math.abs(a.bpm - effectiveBpmB);
  const tempoRatio = a.bpm / Math.max(1, effectiveBpmB);
  const tempoPctDiff = (tempoDiffBpm / Math.max(1, a.bpm)) * 100;
  const tempoScore = Math.max(0, Math.min(100, Math.round(100 - tempoPctDiff * 4.2)));

  const camA = parseCamelot(a.camelot);
  const camB = parseCamelot(b.camelot);
  const rawDist = Math.abs(camA.num - camB.num);
  const circleDist = Math.min(rawDist, 12 - rawDist);

  let harmonicScore = 40;
  let harmonicRelation = 'Distant Key (Pitch shift recommended)';
  if (circleDist === 0 && camA.letter === camB.letter) {
    harmonicScore = 100;
    harmonicRelation = 'Exact Key Match (Seamless harmonic blend)';
  } else if (circleDist === 0 && camA.letter !== camB.letter) {
    harmonicScore = 92;
    harmonicRelation = 'Relative Major/Minor Match (Strong harmonic blend)';
  } else if (circleDist === 1 && camA.letter === camB.letter) {
    harmonicScore = 88;
    harmonicRelation = 'Adjacent Fifth on Camelot Wheel (Smooth energy shift)';
  } else if (circleDist === 2 && camA.letter === camB.letter) {
    harmonicScore = 72;
    harmonicRelation = 'Energy Boost (+2 Steps, works well in drops)';
  } else if (circleDist === 1 && camA.letter !== camB.letter) {
    harmonicScore = 66;
    harmonicRelation = 'Diagonal Key Neighbor (Use filtered crossfade)';
  }

  const overallScore = Math.round(tempoScore * 0.52 + harmonicScore * 0.48);
  const recommendedBpm = Number(((a.bpm + effectiveBpmB) / 2).toFixed(1));

  // Suggest transition near last 30% of Track A into first high-energy or intro of Track B
  const suggestedTransitionA = Number(Math.max(0, a.duration * 0.65).toFixed(2));
  const introB = b.sections.find((s) => s.label === 'Intro') ?? b.sections[0];
  const suggestedTransitionB = introB ? introB.start : 0;

  const explanation = `Detected ${a.bpm} BPM (${a.key} / ${a.camelot}) vs ${b.bpm} BPM (${b.key} / ${b.camelot}). Tempo spread is ${tempoDiffBpm.toFixed(1)} BPM (${tempoPctDiff.toFixed(1)}%). ${harmonicRelation}. Note: BPM and key estimates are computed locally via onset autocorrelation and chromagram correlation and are approximate on complex polyphonic tracks.`;

  return {
    overallScore,
    tempoDiffBpm: Number(tempoDiffBpm.toFixed(1)),
    tempoRatio: Number(tempoRatio.toFixed(3)),
    recommendedBpm,
    harmonicRelation,
    harmonicScore,
    tempoScore,
    suggestedTransitionA,
    suggestedTransitionB,
    explanation,
  };
}

/**
 * Local DSP Vocal Isolation / Karaoke Instrumental Extraction using Mid/Side matrix + vocal band filtering.
 */
export async function separateMidSideVocals(
  buffer: AudioBuffer,
  mode: 'instrumental' | 'vocals'
): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const len = buffer.length;
  const sr = buffer.sampleRate;

  if (buffer.numberOfChannels < 2) {
    // Mono fallback: use band-pass / band-stop vocal range (300Hz - 3400Hz)
    const offline = new OfflineAudioContext(1, len, sr);
    const src = offline.createBufferSource();
    src.buffer = buffer;
    if (mode === 'vocals') {
      const hp = offline.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 280;
      const lp = offline.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3600;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(offline.destination);
    } else {
      const notch = offline.createBiquadFilter();
      notch.type = 'peaking';
      notch.frequency.value = 1400;
      notch.Q.value = 0.7;
      notch.gain.value = -16;
      src.connect(notch);
      notch.connect(offline.destination);
    }
    src.start(0);
    return await offline.startRendering();
  }

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const out = ctx.createBuffer(2, len, sr);
  const outL = out.getChannelData(0);
  const outR = out.getChannelData(1);

  if (mode === 'instrumental') {
    // Classic Mid/Side center cancellation: preserve stereo sides + keep low bass mono (<160Hz)
    let lpL = 0;
    let lpR = 0;
    const alpha = Math.min(1, (2 * Math.PI * 160) / sr);
    for (let i = 0; i < len; i++) {
      lpL += alpha * (left[i] - lpL);
      lpR += alpha * (right[i] - lpR);
      const side = (left[i] - right[i]) * 0.75;
      const lowMono = (lpL + lpR) * 0.5;
      outL[i] = Math.max(-1, Math.min(1, side + lowMono));
      outR[i] = Math.max(-1, Math.min(1, -side + lowMono));
    }
    return out;
  }

  // Vocal-focused center extraction (Mid minus Side weighted + bandpass 220Hz - 4800Hz)
  const midBuf = ctx.createBuffer(1, len, sr);
  const mid = midBuf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const m = (left[i] + right[i]) * 0.5;
    const s = Math.abs(left[i] - right[i]) * 0.5;
    const weight = Math.max(0, 1 - s / (Math.abs(m) + 0.01));
    mid[i] = m * (0.35 + 0.65 * weight);
  }

  const offline = new OfflineAudioContext(2, len, sr);
  const src = offline.createBufferSource();
  src.buffer = midBuf;
  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 220;
  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4800;
  src.connect(hp);
  hp.connect(lp);
  lp.connect(offline.destination);
  src.start(0);
  return await offline.startRendering();
}

/**
 * 4-Band Frequency & Stereo Stem Separation using cascaded Biquad crossover filters + Side ambience.
 */
export async function splitFourBandStems(buffer: AudioBuffer): Promise<{
  bass: AudioBuffer;
  vocalsMid: AudioBuffer;
  highsPercussion: AudioBuffer;
  ambienceSide: AudioBuffer;
}> {
  const sr = buffer.sampleRate;
  const len = buffer.length;

  const renderFiltered = async (setup: (ctx: OfflineAudioContext, src: AudioBufferSourceNode) => void) => {
    const offline = new OfflineAudioContext(2, len, sr);
    const src = offline.createBufferSource();
    src.buffer = buffer;
    setup(offline, src);
    src.start(0);
    return await offline.startRendering();
  };

  const bass = await renderFiltered((ctx, src) => {
    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.frequency.value = 240;
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 240;
    src.connect(lp1);
    lp1.connect(lp2);
    lp2.connect(ctx.destination);
  });

  const vocalsMid = await separateMidSideVocals(buffer, 'vocals');

  const highsPercussion = await renderFiltered((ctx, src) => {
    const hp1 = ctx.createBiquadFilter();
    hp1.type = 'highpass';
    hp1.frequency.value = 4200;
    const hp2 = ctx.createBiquadFilter();
    hp2.type = 'highpass';
    hp2.frequency.value = 4200;
    src.connect(hp1);
    hp1.connect(hp2);
    hp2.connect(ctx.destination);
  });

  const ambienceSide = await separateMidSideVocals(buffer, 'instrumental');

  return { bass, vocalsMid, highsPercussion, ambienceSide };
}

/**
 * Real Local Audio Enhancement: rumble highpass + presence boost + dynamics compression + peak normalization.
 */
export async function enhanceAndNormalizeAudio(
  buffer: AudioBuffer,
  options: { targetPeakDb?: number; noiseGateThresholdDb?: number; clarityBoost?: boolean } = {}
): Promise<AudioBuffer> {
  const targetPeakLinear = Math.pow(10, (options.targetPeakDb ?? -1.0) / 20);
  const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;

  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 55;

  const presence = offline.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 1.1;
  presence.gain.value = options.clarityBoost !== false ? 2.5 : 0;

  const air = offline.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 10000;
  air.gain.value = options.clarityBoost !== false ? 1.8 : 0;

  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.008;
  comp.release.value = 0.16;

  src.connect(hp);
  hp.connect(presence);
  presence.connect(air);
  air.connect(comp);
  comp.connect(offline.destination);
  src.start(0);

  const rendered = await offline.startRendering();

  // Optional noise gate + peak normalization
  const gateThreshold = options.noiseGateThresholdDb != null ? Math.pow(10, options.noiseGateThresholdDb / 20) : 0;
  let peak = 0;
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  const gain = peak > 0.0001 ? targetPeakLinear / peak : 1;

  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    const data = rendered.getChannelData(ch);
    let env = 0;
    for (let i = 0; i < data.length; i++) {
      let s = data[i];
      if (gateThreshold > 0) {
        const abs = Math.abs(s);
        env = abs > env ? abs : env * 0.996;
        if (env < gateThreshold) {
          s *= env / gateThreshold;
        }
      }
      data[i] = Math.max(-1, Math.min(1, s * gain));
    }
  }

  return rendered;
}
