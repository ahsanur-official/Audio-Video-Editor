import {
  AudioWaveform,
  Download,
  Loader2,
  Pause,
  Play,
  Sliders,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ScrollReveal, StaggerGroup, StaggerItem } from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import { WaveformCanvas } from '../components/WaveformCanvas';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import {
  analyzeAudioBuffer,
  calculateMashupCompatibility,
  separateMidSideVocals,
  type AudioAnalysisResult,
  type MashupCompatibilityResult,
} from '../engines/audioAnalysis';
import {
  decodeAudioFile,
  encodeAudioBufferToMp3,
  encodeAudioBufferToWav,
  extractWaveformPeaks,
  generateProceduralDemoTrack,
  getAudioContext,
  renderMixOffline,
} from '../engines/audioEngine';
import { triggerBlobDownload } from '../engines/storageEngine';
import { useMixoraStore } from '../store/useMixoraStore';
import { DEFAULT_AUDIO_EFFECTS, type AudioTrackModel } from '../types/mixora';

interface MashupSlot {
  name: string;
  buffer: AudioBuffer;
  peaks: number[];
  analysis: AudioAnalysisResult;
  stemMode: 'full' | 'vocals' | 'instrumental';
  processedBuffer: AudioBuffer;
  volume: number;
  startOffset: number;
}

export function MashupCreatorPage() {
  const pushToast = useMixoraStore((s) => s.pushToast);

  const [slotA, setSlotA] = useState<MashupSlot | null>(null);
  const [slotB, setSlotB] = useState<MashupSlot | null>(null);
  const [compatibility, setCompatibility] = useState<MashupCompatibilityResult | null>(null);
  const [targetBpm, setTargetBpm] = useState<number>(124);
  const [crossfadeSec, setCrossfadeSec] = useState<number>(4);
  const [analyzingSlot, setAnalyzingSlot] = useState<'A' | 'B' | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [exporting, setExporting] = useState<'wav' | 'mp3' | null>(null);

  const inputARef = useRef<HTMLInputElement | null>(null);
  const inputBRef = useRef<HTMLInputElement | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const rafRef = useRef<number>(0);

  const stopPreview = () => {
    cancelAnimationFrame(rafRef.current);
    sourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    });
    sourcesRef.current = [];
    setIsPlaying(false);
  };

  useEffect(() => () => stopPreview(), []);

  useEffect(() => {
    if (slotA && slotB) {
      const comp = calculateMashupCompatibility(slotA.analysis, slotB.analysis);
      setCompatibility(comp);
      setTargetBpm(comp.recommendedBpm);
      trackAnonymousEvent({ eventType: 'ai_feature_used', feature: 'mashup_creator', effect: 'smart_mashup' });
    } else {
      setCompatibility(null);
    }
  }, [slotA?.name, slotB?.name]);

  const loadIntoSlot = async (which: 'A' | 'B', name: string, buffer: AudioBuffer) => {
    setAnalyzingSlot(which);
    try {
      const [peaks, analysis] = await Promise.all([
        Promise.resolve(extractWaveformPeaks(buffer, 500)),
        analyzeAudioBuffer(buffer),
      ]);
      const next: MashupSlot = {
        name,
        buffer,
        peaks,
        analysis,
        stemMode: 'full',
        processedBuffer: buffer,
        volume: 0.95,
        startOffset: which === 'B' ? Math.max(0, Number((buffer.duration * 0.5).toFixed(1))) : 0,
      };
      if (which === 'A') setSlotA(next);
      else setSlotB(next);
      pushToast({
        type: 'success',
        title: `Analyzed Track ${which}: ${analysis.bpm} BPM · ${analysis.key} (${analysis.camelot})`,
      });
    } catch (err) {
      pushToast({
        type: 'error',
        title: `Failed to analyze Track ${which}`,
        detail: err instanceof Error ? err.message : 'Decode error.',
      });
    } finally {
      setAnalyzingSlot(null);
    }
  };

  const handleFileUpload = async (which: 'A' | 'B', file?: File) => {
    if (!file) return;
    try {
      const buffer = await decodeAudioFile(file);
      await loadIntoSlot(which, file.name.replace(/\.[^.]+$/, ''), buffer);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Audio load error',
        detail: err instanceof Error ? err.message : 'Invalid audio file.',
      });
    }
  };

  const loadDemoPair = async () => {
    const [a, b] = await Promise.all([
      generateProceduralDemoTrack('electronic_124'),
      generateProceduralDemoTrack('house_126'),
    ]);
    await loadIntoSlot('A', a.name, a.buffer);
    await loadIntoSlot('B', b.name, b.buffer);
  };

  const applyStemMode = async (which: 'A' | 'B', mode: 'full' | 'vocals' | 'instrumental') => {
    const slot = which === 'A' ? slotA : slotB;
    if (!slot) return;
    setAnalyzingSlot(which);
    try {
      const processedBuffer =
        mode === 'full' ? slot.buffer : await separateMidSideVocals(slot.buffer, mode);
      const updated: MashupSlot = {
        ...slot,
        stemMode: mode,
        processedBuffer,
        peaks: extractWaveformPeaks(processedBuffer, 500),
      };
      if (which === 'A') setSlotA(updated);
      else setSlotB(updated);
    } finally {
      setAnalyzingSlot(null);
    }
  };

  const applySmartSuggestion = () => {
    if (!slotA || !slotB || !compatibility) return;
    setTargetBpm(compatibility.recommendedBpm);
    setSlotA({ ...slotA, startOffset: 0 });
    setSlotB({ ...slotB, startOffset: compatibility.suggestedTransitionA });
    setCrossfadeSec(Math.min(6, Math.max(2, Math.round((60 / compatibility.recommendedBpm) * 8))));
    pushToast({
      type: 'success',
      title: 'Applied Smart Mashup alignment',
      detail: `Matched to ${compatibility.recommendedBpm} BPM with transition at ${compatibility.suggestedTransitionA}s.`,
    });
  };

  const buildMashupTracks = (): AudioTrackModel[] => {
    const list: AudioTrackModel[] = [];
    if (slotA) {
      const speedA = Math.max(0.6, Math.min(1.5, targetBpm / Math.max(40, slotA.analysis.bpm)));
      list.push({
        id: 'mashup-a',
        name: slotA.name,
        fileName: `${slotA.name}.wav`,
        duration: slotA.processedBuffer.duration,
        sampleRate: slotA.processedBuffer.sampleRate,
        channels: slotA.processedBuffer.numberOfChannels,
        startOffset: slotA.startOffset,
        trimStart: 0,
        trimEnd: slotA.processedBuffer.duration,
        volume: slotA.volume,
        pan: 0,
        mute: false,
        solo: false,
        group: 'Master',
        fadeIn: 0,
        fadeOut: crossfadeSec,
        reversed: false,
        speed: speedA,
        pitchSemitones: 0,
        color: '#22D3EE',
        peaks: slotA.peaks,
        effects: { ...DEFAULT_AUDIO_EFFECTS },
        buffer: slotA.processedBuffer,
      });
    }
    if (slotB) {
      const speedB = Math.max(0.6, Math.min(1.5, targetBpm / Math.max(40, slotB.analysis.bpm)));
      list.push({
        id: 'mashup-b',
        name: slotB.name,
        fileName: `${slotB.name}.wav`,
        duration: slotB.processedBuffer.duration,
        sampleRate: slotB.processedBuffer.sampleRate,
        channels: slotB.processedBuffer.numberOfChannels,
        startOffset: slotB.startOffset,
        trimStart: 0,
        trimEnd: slotB.processedBuffer.duration,
        volume: slotB.volume,
        pan: 0,
        mute: false,
        solo: false,
        group: 'Master',
        fadeIn: crossfadeSec,
        fadeOut: 1.0,
        reversed: false,
        speed: speedB,
        pitchSemitones: 0,
        color: '#8B5CF6',
        peaks: slotB.peaks,
        effects: { ...DEFAULT_AUDIO_EFFECTS },
        buffer: slotB.processedBuffer,
      });
    }
    return list;
  };

  const togglePreview = () => {
    if (isPlaying) {
      stopPreview();
      return;
    }
    const mashupTracks = buildMashupTracks();
    if (mashupTracks.length === 0) return;

    const ctx = getAudioContext();
    const startAt = ctx.currentTime + 0.05;
    const sources: AudioBufferSourceNode[] = [];

    let totalDur = 0;
    for (const tr of mashupTracks) {
      if (!tr.buffer) continue;
      const src = ctx.createBufferSource();
      src.buffer = tr.buffer;
      src.playbackRate.value = tr.speed;
      const gain = ctx.createGain();
      const effDur = tr.buffer.duration / tr.speed;
      totalDur = Math.max(totalDur, tr.startOffset + effDur);

      const tStart = startAt + tr.startOffset;
      gain.gain.setValueAtTime(tr.fadeIn > 0 ? 0.001 : tr.volume, tStart);
      if (tr.fadeIn > 0) {
        gain.gain.linearRampToValueAtTime(tr.volume, tStart + Math.min(tr.fadeIn, effDur / 2));
      }
      if (tr.fadeOut > 0) {
        const fStart = tStart + Math.max(0, effDur - Math.min(tr.fadeOut, effDur / 2));
        gain.gain.setValueAtTime(tr.volume, fStart);
        gain.gain.linearRampToValueAtTime(0.001, tStart + effDur);
      }

      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(tStart);
      sources.push(src);
    }

    sourcesRef.current = sources;
    setIsPlaying(true);

    const tick = () => {
      const elapsed = Math.max(0, ctx.currentTime - startAt);
      setPlayhead(elapsed);
      if (elapsed >= totalDur) {
        stopPreview();
        setPlayhead(0);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handleExportMashup = async (format: 'mp3' | 'wav') => {
    const mashupTracks = buildMashupTracks();
    if (mashupTracks.length < 2) {
      pushToast({ type: 'warning', title: 'Load two tracks to export a mashup' });
      return;
    }
    setExporting(format);
    trackAnonymousEvent({ eventType: 'export_attempt', feature: 'mashup_creator', format });
    try {
      const rendered = await renderMixOffline(mashupTracks, 0.95);
      const blob =
        format === 'wav' ? encodeAudioBufferToWav(rendered, 16) : await encodeAudioBufferToMp3(rendered, 192);
      triggerBlobDownload(blob, `mixora-mashup-${Math.round(targetBpm)}bpm.${format}`);
      trackAnonymousEvent({ eventType: 'export_success', feature: 'mashup_creator', status: 'success', format });
      pushToast({ type: 'success', title: `Exported mashup as .${format}` });
    } catch (err) {
      trackAnonymousEvent({ eventType: 'export_fail', feature: 'mashup_creator', status: 'error', format });
      pushToast({
        type: 'error',
        title: 'Mashup export failed',
        detail: err instanceof Error ? err.message : 'Unable to encode mashup.',
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#292938] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]">
            Music Mashup Creator
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Analyze BPM, beat grids, and Camelot harmonic keys locally to align and blend songs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDemoPair()}
            disabled={analyzingSlot != null}
            className="px-3.5 py-2 rounded-md bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] text-xs font-medium text-[#22D3EE]"
          >
            Load Compatible Demo Pair
          </button>
          <StudioButton
            variant="primary"
            size="sm"
            onClick={togglePreview}
            disabled={!slotA && !slotB}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Stop Preview' : 'Preview Mashup'}
          </StudioButton>
          <StudioButton
            variant="audio"
            size="sm"
            onClick={() => void handleExportMashup('mp3')}
            disabled={!slotA || !slotB || exporting != null}
          >
            {exporting === 'mp3' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export MP3
          </StudioButton>
          <button
            type="button"
            onClick={() => void handleExportMashup('wav')}
            disabled={!slotA || !slotB || exporting != null}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] disabled:opacity-40"
          >
            {exporting === 'wav' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            WAV
          </button>
        </div>
      </div>

      {/* Dual Track Importers & Analyzers */}
      <StaggerGroup className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(['A', 'B'] as const).map((which) => {
          const slot = which === 'A' ? slotA : slotB;
          const inputRef = which === 'A' ? inputARef : inputBRef;
          const accent = which === 'A' ? '#22D3EE' : '#8B5CF6';

          return (
            <StaggerItem key={which} className="bg-[#14141D] border border-[#292938] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-[#F8FAFC]">
                  Song {which} {slot ? `— ${slot.name}` : ''}
                </h2>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*"
                  onChange={(e) => void handleFileUpload(which, e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
                >
                  <Upload className="w-3.5 h-3.5" style={{ color: accent }} />
                  {slot ? 'Replace' : `Upload Song ${which}`}
                </button>
              </div>

              {analyzingSlot === which ? (
                <div className="py-12 text-center text-xs text-[#94A3B8] space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#8B5CF6]" />
                  <p>Running onset BPM, beat grid, and chromagram key analysis...</p>
                </div>
              ) : !slot ? (
                <div className="py-10 border border-dashed border-[#292938] rounded-lg text-center space-y-2">
                  <AudioWaveform className="w-7 h-7 text-[#94A3B8] mx-auto" />
                  <p className="text-xs text-[#94A3B8]">Upload Song {which} to analyze tempo and musical key</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 bg-[#09090D] border border-[#292938] rounded-lg p-3 text-center">
                    <div>
                      <p className="text-[11px] text-[#94A3B8]">Detected BPM</p>
                      <p className="font-mono tabular-nums text-base font-semibold text-[#F8FAFC]">
                        {slot.analysis.bpm}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#94A3B8]">Estimated Key</p>
                      <p className="font-mono text-sm font-semibold text-[#22D3EE]">
                        {slot.analysis.key} ({slot.analysis.camelot})
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#94A3B8]">Beats Found</p>
                      <p className="font-mono tabular-nums text-base font-semibold text-[#F8FAFC]">
                        {slot.analysis.beatPositions.length}
                      </p>
                    </div>
                  </div>

                  <WaveformCanvas
                    peaks={slot.peaks}
                    duration={slot.processedBuffer.duration}
                    beatPositions={slot.analysis.beatPositions}
                    currentTime={Math.max(0, playhead - slot.startOffset)}
                    color={accent}
                    height={76}
                  />

                  {/* Vocal / Instrumental Mode & Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-1 bg-[#09090D] p-1 rounded border border-[#292938]">
                      {(['full', 'vocals', 'instrumental'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => void applyStemMode(which, m)}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize ${
                            slot.stemMode === m
                              ? 'bg-[#8B5CF6] text-[#F8FAFC]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
                      <label className="flex items-center gap-1.5">
                        Start (s)
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={slot.startOffset}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            if (which === 'A') setSlotA({ ...slot, startOffset: val });
                            else setSlotB({ ...slot, startOffset: val });
                          }}
                          className="w-16 bg-[#09090D] border border-[#292938] rounded px-1.5 py-1 font-mono text-[#F8FAFC]"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        Vol
                        <input
                          type="range"
                          min={0}
                          max={1.3}
                          step={0.05}
                          value={slot.volume}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (which === 'A') setSlotA({ ...slot, volume: val });
                            else setSlotB({ ...slot, volume: val });
                          }}
                          className="w-20"
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}
            </StaggerItem>
          );
        })}
      </StaggerGroup>

      {/* Smart Mashup Assistant Compatibility & Arrangement Controls */}
      {compatibility && (
        <ScrollReveal className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-[#A3E635]" />
              <div>
                <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
                  Smart Mashup Assistant Report
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Calculated directly from local BPM autocorrelation & Camelot harmonic distance
                </p>
              </div>
            </div>

            <StudioButton
              variant="primary"
              size="sm"
              onClick={applySmartSuggestion}
            >
              <Wand2 className="w-3.5 h-3.5" />
              Auto-Align Tempo & Transition
            </StudioButton>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
              <p className="text-xs text-[#94A3B8]">Overall Compatibility</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#A3E635] mt-1">
                {compatibility.overallScore}%
              </p>
            </div>
            <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
              <p className="text-xs text-[#94A3B8]">Tempo Match Score</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#22D3EE] mt-1">
                {compatibility.tempoScore}%
              </p>
            </div>
            <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
              <p className="text-xs text-[#94A3B8]">Harmonic Score</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#8B5CF6] mt-1">
                {compatibility.harmonicScore}%
              </p>
            </div>
            <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
              <p className="text-xs text-[#94A3B8]">Recommended Tempo</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#F8FAFC] mt-1">
                {compatibility.recommendedBpm} BPM
              </p>
            </div>
          </div>

          <p className="text-xs text-[#94A3B8] leading-relaxed">{compatibility.explanation}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-[#292938]">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[#94A3B8] inline-flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#22D3EE]" />
                  Target Mashup Tempo
                </span>
                <span className="font-mono tabular-nums text-[#F8FAFC]">{targetBpm.toFixed(1)} BPM</span>
              </div>
              <input
                type="range"
                min={70}
                max={175}
                step={0.5}
                value={targetBpm}
                onChange={(e) => setTargetBpm(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[#94A3B8]">Crossfade Duration</span>
                <span className="font-mono tabular-nums text-[#F8FAFC]">{crossfadeSec.toFixed(1)} s</span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                step={0.5}
                value={crossfadeSec}
                onChange={(e) => setCrossfadeSec(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </ScrollReveal>
      )}
    </div>
  );
}
