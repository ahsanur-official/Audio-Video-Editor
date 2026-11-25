import {
  ArrowDown,
  ArrowUp,
  AudioWaveform,
  Copy,
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ModalTransition, ScrollReveal, STUDIO_EASE } from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import { WaveformCanvas } from '../components/WaveformCanvas';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import {
  analyzeAudioBuffer,
  calculateMashupCompatibility,
  separateMidSideVocals,
  type AudioAnalysisResult,
} from '../engines/audioAnalysis';
import {
  decodeAudioFile,
  encodeAudioBufferToMp3,
  encodeAudioBufferToWav,
  estimateAudioExportBytes,
  extractWaveformPeaks,
  generateProceduralDemoTrack,
  getAudioContext,
  renderMixOffline,
} from '../engines/audioEngine';
import { formatBytes, triggerBlobDownload } from '../engines/storageEngine';
import { useMixoraStore } from '../store/useMixoraStore';
import {
  DEFAULT_AUDIO_EFFECTS,
  type AudioBitDepth,
  type AudioExportFormat,
  type AudioSampleRate,
  type AudioTrackModel,
  type Mp3Bitrate,
} from '../types/mixora';

const SLOT_COLORS = ['#22D3EE', '#8B5CF6', '#3B82F6', '#A3E635', '#F59E0B', '#EC4899', '#10B981'];

interface MashupSlot {
  id: string;
  name: string;
  buffer: AudioBuffer;
  peaks: number[];
  analysis: AudioAnalysisResult;
  stemMode: 'full' | 'vocals' | 'instrumental';
  processedBuffer: AudioBuffer;
  volume: number;
  pan: number;
  startOffset: number;
  fadeIn: number;
  fadeOut: number;
  mute: boolean;
  solo: boolean;
  color: string;
}

function camelotOrderValue(camelot: string): number {
  const num = parseInt(camelot, 10) || 1;
  const letter = camelot.endsWith('B') ? 0.5 : 0;
  return num + letter;
}

export function MashupCreatorPage() {
  const pushToast = useMixoraStore((s) => s.pushToast);

  const [slots, setSlots] = useState<MashupSlot[]>([]);
  const [targetBpm, setTargetBpm] = useState<number>(124);
  const [crossfadeSec, setCrossfadeSec] = useState<number>(4);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);

  // Multi-quality export modal state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<AudioExportFormat>('mp3');
  const [wavDepth, setWavDepth] = useState<AudioBitDepth>(24);
  const [mp3Bitrate, setMp3Bitrate] = useState<Mp3Bitrate>(320);
  const [sampleRate, setSampleRate] = useState<AudioSampleRate>(44100);
  const [channels, setChannels] = useState<1 | 2>(2);
  const [normalizePeak, setNormalizePeak] = useState(true);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  const multiInputRef = useRef<HTMLInputElement | null>(null);
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

  // Multi-track harmonic & tempo compatibility summary across all loaded songs
  const multiReport = useMemo(() => {
    if (slots.length < 2) return null;
    const pairwise = [];
    let totalOverall = 0;
    let totalTempo = 0;
    let totalHarmonic = 0;
    for (let i = 0; i < slots.length - 1; i++) {
      const comp = calculateMashupCompatibility(slots[i].analysis, slots[i + 1].analysis);
      pairwise.push({
        from: slots[i].name,
        to: slots[i + 1].name,
        ...comp,
      });
      totalOverall += comp.overallScore;
      totalTempo += comp.tempoScore;
      totalHarmonic += comp.harmonicScore;
    }
    const avgBpm =
      Math.round((slots.reduce((sum, s) => sum + s.analysis.bpm, 0) / slots.length) * 10) / 10;
    const count = pairwise.length;
    return {
      overallScore: Math.round(totalOverall / count),
      tempoScore: Math.round(totalTempo / count),
      harmonicScore: Math.round(totalHarmonic / count),
      recommendedBpm: avgBpm,
      pairwise,
    };
  }, [slots]);

  const addBuffersToMashup = async (entries: { name: string; buffer: AudioBuffer }[]) => {
    setIsImporting(true);
    try {
      const nextSlots: MashupSlot[] = [];
      let runningOffset = slots.reduce((maxEnd, s) => {
        const speed = Math.max(0.6, Math.min(1.5, targetBpm / Math.max(40, s.analysis.bpm)));
        const dur = s.processedBuffer.duration / speed;
        return Math.max(maxEnd, s.startOffset + Math.max(1, dur - crossfadeSec));
      }, 0);

      for (let i = 0; i < entries.length; i++) {
        const { name, buffer } = entries[i];
        const [peaks, analysis] = await Promise.all([
          Promise.resolve(extractWaveformPeaks(buffer, 460)),
          analyzeAudioBuffer(buffer),
        ]);
        const idx = slots.length + i;
        const offset = idx === 0 ? 0 : Number(runningOffset.toFixed(1));
        nextSlots.push({
          id: crypto.randomUUID(),
          name,
          buffer,
          peaks,
          analysis,
          stemMode: 'full',
          processedBuffer: buffer,
          volume: 0.92,
          pan: 0,
          startOffset: offset,
          fadeIn: idx === 0 ? 0 : crossfadeSec,
          fadeOut: crossfadeSec,
          mute: false,
          solo: false,
          color: SLOT_COLORS[idx % SLOT_COLORS.length],
        });
        runningOffset = offset + Math.max(2, buffer.duration - crossfadeSec);
      }

      setSlots((prev) => {
        const combined = [...prev, ...nextSlots];
        if (prev.length === 0 && combined.length > 0) {
          const avg =
            Math.round((combined.reduce((sum, s) => sum + s.analysis.bpm, 0) / combined.length) * 10) / 10;
          setTargetBpm(avg);
        }
        return combined;
      });

      trackAnonymousEvent({ eventType: 'ai_feature_used', feature: 'mashup_creator', effect: 'multi_song_load' });
      pushToast({
        type: 'success',
        title: `Added ${nextSlots.length} song${nextSlots.length > 1 ? 's' : ''} to Mashup`,
        detail: nextSlots.map((s) => `${s.analysis.bpm} BPM (${s.analysis.camelot})`).join(' · '),
      });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Failed to analyze uploaded song(s)',
        detail: err instanceof Error ? err.message : 'Decode error.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleMultiFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    const decoded: { name: string; buffer: AudioBuffer }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buffer = await decodeAudioFile(file);
        decoded.push({ name: file.name.replace(/\.[^.]+$/, ''), buffer });
      } catch (err) {
        pushToast({
          type: 'error',
          title: `Could not decode "${file.name}"`,
          detail: err instanceof Error ? err.message : 'Unsupported format.',
        });
      }
    }
    if (decoded.length > 0) {
      await addBuffersToMashup(decoded);
    } else {
      setIsImporting(false);
    }
  };

  const loadDemoPack = async () => {
    setIsImporting(true);
    try {
      const demos = await Promise.all([
        generateProceduralDemoTrack('electronic_124'),
        generateProceduralDemoTrack('house_126'),
        generateProceduralDemoTrack('synthwave_120'),
      ]);
      await addBuffersToMashup(demos);
    } finally {
      setIsImporting(false);
    }
  };

  const updateSlot = (id: string, patch: Partial<MashupSlot>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSlot = (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const duplicateSlot = (slot: MashupSlot) => {
    const copy: MashupSlot = {
      ...slot,
      id: crypto.randomUUID(),
      name: `${slot.name} (Copy)`,
      startOffset: Number((slot.startOffset + 4).toFixed(1)),
      color: SLOT_COLORS[(slots.length + 1) % SLOT_COLORS.length],
    };
    setSlots((prev) => [...prev, copy]);
  };

  const moveSlot = (id: string, dir: 'up' | 'down') => {
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const applyStemMode = async (id: string, mode: 'full' | 'vocals' | 'instrumental') => {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return;
    setBusySlotId(id);
    try {
      const processedBuffer =
        mode === 'full' ? slot.buffer : await separateMidSideVocals(slot.buffer, mode);
      updateSlot(id, {
        stemMode: mode,
        processedBuffer,
        peaks: extractWaveformPeaks(processedBuffer, 460),
      });
    } finally {
      setBusySlotId(null);
    }
  };

  const autoArrangeAndSyncAll = () => {
    if (slots.length < 2) return;
    const avgBpm =
      Math.round((slots.reduce((sum, s) => sum + s.analysis.bpm, 0) / slots.length) * 10) / 10;
    const syncedCrossfade = Math.min(8, Math.max(2, Number(((60 / avgBpm) * 8).toFixed(1))));

    // Sort harmonically along the Camelot wheel so adjacent transitions blend smoothly
    const sorted = [...slots].sort(
      (a, b) => camelotOrderValue(a.analysis.camelot) - camelotOrderValue(b.analysis.camelot)
    );

    let cursor = 0;
    const arranged = sorted.map((s, idx) => {
      const speed = Math.max(0.6, Math.min(1.5, avgBpm / Math.max(40, s.analysis.bpm)));
      const effDur = s.processedBuffer.duration / speed;
      const startOffset = Number(cursor.toFixed(1));
      const fadeIn = idx === 0 ? 0 : syncedCrossfade;
      const fadeOut = idx === sorted.length - 1 ? 1.5 : syncedCrossfade;
      cursor = Math.max(0, startOffset + Math.max(2, effDur - syncedCrossfade));
      return { ...s, startOffset, fadeIn, fadeOut };
    });

    setTargetBpm(avgBpm);
    setCrossfadeSec(syncedCrossfade);
    setSlots(arranged);
    pushToast({
      type: 'success',
      title: `Auto-arranged ${arranged.length} songs harmonically`,
      detail: `Beat-synced to ${avgBpm} BPM with ${syncedCrossfade}s smooth crossfades.`,
    });
  };

  const stackAllSimultaneously = () => {
    if (slots.length < 2) return;
    setSlots((prev) => prev.map((s) => ({ ...s, startOffset: 0, fadeIn: 0.5, fadeOut: 1.5 })));
    pushToast({
      type: 'info',
      title: 'Stacked all songs at 0.0s',
      detail: 'Use Vocals / Instrumental stem toggles to blend acapellas over beats.',
    });
  };

  const buildMashupTracks = (): AudioTrackModel[] => {
    return slots.map((slot) => {
      const speed = Math.max(0.6, Math.min(1.5, targetBpm / Math.max(40, slot.analysis.bpm)));
      return {
        id: slot.id,
        name: slot.name,
        fileName: `${slot.name}.wav`,
        duration: slot.processedBuffer.duration,
        sampleRate: slot.processedBuffer.sampleRate,
        channels: slot.processedBuffer.numberOfChannels,
        startOffset: slot.startOffset,
        trimStart: 0,
        trimEnd: slot.processedBuffer.duration,
        volume: slot.volume,
        pan: slot.pan,
        mute: slot.mute,
        solo: slot.solo,
        group: 'Master',
        fadeIn: slot.fadeIn,
        fadeOut: slot.fadeOut,
        reversed: false,
        speed,
        pitchSemitones: 0,
        color: slot.color,
        peaks: slot.peaks,
        effects: { ...DEFAULT_AUDIO_EFFECTS },
        buffer: slot.processedBuffer,
      };
    });
  };

  const estimatedTotalDuration = useMemo(() => {
    if (slots.length === 0) return 0;
    return slots.reduce((maxEnd, s) => {
      const speed = Math.max(0.6, Math.min(1.5, targetBpm / Math.max(40, s.analysis.bpm)));
      return Math.max(maxEnd, s.startOffset + s.processedBuffer.duration / speed);
    }, 0);
  }, [slots, targetBpm]);

  const estimatedExportSize = useMemo(() => {
    return estimateAudioExportBytes(
      Math.max(1, estimatedTotalDuration),
      exportFormat,
      exportFormat === 'mp3' ? Math.min(48000, sampleRate) : sampleRate,
      channels,
      exportFormat === 'wav' ? wavDepth : mp3Bitrate
    );
  }, [estimatedTotalDuration, exportFormat, sampleRate, channels, wavDepth, mp3Bitrate]);

  const togglePreview = () => {
    if (isPlaying) {
      stopPreview();
      return;
    }
    const mashupTracks = buildMashupTracks();
    const anySolo = mashupTracks.some((t) => t.solo);
    const audible = mashupTracks.filter((t) => t.buffer && !t.mute && (!anySolo || t.solo));
    if (audible.length === 0) {
      pushToast({ type: 'warning', title: 'No audible songs to preview' });
      return;
    }

    const ctx = getAudioContext();
    const startAt = ctx.currentTime + 0.05;
    const sources: AudioBufferSourceNode[] = [];
    let totalDur = 0;

    for (const tr of audible) {
      if (!tr.buffer) continue;
      const src = ctx.createBufferSource();
      src.buffer = tr.buffer;
      src.playbackRate.value = tr.speed;
      const panner = ctx.createStereoPanner();
      panner.pan.value = tr.pan;
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

      src.connect(panner);
      panner.connect(gain);
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

  const handleExportMashup = async () => {
    const mashupTracks = buildMashupTracks();
    if (mashupTracks.length === 0) {
      pushToast({ type: 'warning', title: 'Add at least one song to export' });
      return;
    }
    setExportProgress(10);
    trackAnonymousEvent({ eventType: 'export_attempt', feature: 'mashup_creator', format: exportFormat });
    try {
      const renderRate = exportFormat === 'mp3' ? Math.min(48000, sampleRate) : sampleRate;
      const rendered = await renderMixOffline(
        mashupTracks,
        0.95,
        undefined,
        renderRate,
        channels,
        normalizePeak
      );
      setExportProgress(55);
      const blob =
        exportFormat === 'wav'
          ? encodeAudioBufferToWav(rendered, wavDepth)
          : await encodeAudioBufferToMp3(rendered, mp3Bitrate, (pct) => {
              setExportProgress(55 + Math.round(pct * 0.45));
            });
      setExportProgress(100);
      const qualityTag =
        exportFormat === 'wav'
          ? `${wavDepth}bit-${renderRate / 1000}kHz`
          : `${mp3Bitrate}kbps`;
      triggerBlobDownload(
        blob,
        `mixora-mashup-${slots.length}songs-${Math.round(targetBpm)}bpm-${qualityTag}.${exportFormat}`
      );
      trackAnonymousEvent({
        eventType: 'export_success',
        feature: 'mashup_creator',
        status: 'success',
        format: exportFormat,
      });
      pushToast({
        type: 'success',
        title: `Exported ${slots.length}-song mashup (.${exportFormat.toUpperCase()})`,
        detail: `${qualityTag} · ${channels === 2 ? 'Stereo' : 'Mono'}`,
      });
      setExportOpen(false);
    } catch (err) {
      trackAnonymousEvent({
        eventType: 'export_fail',
        feature: 'mashup_creator',
        status: 'error',
        format: exportFormat,
      });
      pushToast({
        type: 'error',
        title: 'Mashup export failed',
        detail: err instanceof Error ? err.message : 'Unable to encode mashup.',
      });
    } finally {
      setExportProgress(null);
    }
  };

  return (
    <div
      className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handleMultiFileUpload(e.dataTransfer.files);
      }}
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[#292938] pb-6">
        <div>
          <p className="text-xs font-medium text-[#22D3EE] uppercase tracking-wider mb-1">
            Unlimited Multi-Song Studio
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight studio-gradient-text">
            Music Mashup Creator
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Select as many songs as you want — beat-sync, harmonically sort, split vocals/instrumentals, and export in studio quality.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={multiInputRef}
            type="file"
            multiple
            accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*"
            onChange={(e) => {
              void handleMultiFileUpload(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <StudioButton
            variant="secondary"
            size="sm"
            onClick={() => multiInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 text-[#22D3EE]" />}
            Add Songs (Unlimited)
          </StudioButton>
          <button
            type="button"
            onClick={() => void loadDemoPack()}
            disabled={isImporting}
            className="px-3.5 py-2 rounded-md bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] text-xs font-medium text-[#22D3EE] whitespace-nowrap"
          >
            Load 3-Song Demo Pack
          </button>
          <StudioButton
            variant="primary"
            size="sm"
            onClick={togglePreview}
            disabled={slots.length === 0}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Stop Preview' : `Preview (${slots.length})`}
          </StudioButton>
          <StudioButton
            variant="audio"
            size="sm"
            onClick={() => setExportOpen(true)}
            disabled={slots.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            Export Quality...
          </StudioButton>
        </div>
      </div>

      {/* Empty State or Dynamic Unlimited Song Stack */}
      {slots.length === 0 ? (
        <div className="studio-card-surface border border-dashed border-[#8B5CF6]/40 rounded-2xl p-12 text-center space-y-5">
          <div className="w-14 h-14 rounded-xl studio-accent-gradient mx-auto flex items-center justify-center shadow-[0_0_28px_rgba(139,92,246,0.35)]">
            <AudioWaveform className="w-7 h-7 text-white" />
          </div>
          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="font-display text-xl font-semibold text-[#F8FAFC]">
              Drop 2, 3, 5, or as many songs as you want
            </h2>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              Select multiple audio files at once (MP3, WAV, FLAC, OGG, AAC). MIXORA analyzes each
              song&apos;s BPM, beat grid, and Camelot key locally so you can blend unlimited tracks cleanly.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <StudioButton
              variant="primary"
              size="md"
              onClick={() => multiInputRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className="w-4 h-4" />
              Select Multiple Songs
            </StudioButton>
            <StudioButton
              variant="secondary"
              size="md"
              onClick={() => void loadDemoPack()}
              disabled={isImporting}
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-[#22D3EE]" />}
              Try 3-Song Harmonic Demo Pack
            </StudioButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Multi-Track Actions Strip */}
          <div className="bg-[#14141D] border border-[#292938] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-[#F8FAFC]">
                {slots.length} Song{slots.length > 1 ? 's' : ''} Loaded
              </span>
              <span className="text-[#292938]">·</span>
              <span className="text-[#94A3B8] font-mono tabular-nums">
                Master Tempo: <strong className="text-[#22D3EE]">{targetBpm.toFixed(1)} BPM</strong>
              </span>
              <span className="text-[#292938]">·</span>
              <span className="text-[#94A3B8] font-mono tabular-nums">
                Total Length: <strong className="text-[#F8FAFC]">{estimatedTotalDuration.toFixed(1)}s</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={autoArrangeAndSyncAll}
                disabled={slots.length < 2}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 border border-[#8B5CF6]/50 text-xs font-medium text-[#F8FAFC] disabled:opacity-40 whitespace-nowrap"
              >
                <Wand2 className="w-3.5 h-3.5 text-[#22D3EE]" />
                Auto-Sort & Beat-Sync All
              </button>
              <button
                type="button"
                onClick={stackAllSimultaneously}
                disabled={slots.length < 2}
                className="px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40 whitespace-nowrap"
              >
                Layer All at 0.0s
              </button>
              <button
                type="button"
                onClick={() => multiInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#22D3EE] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add More Songs
              </button>
            </div>
          </div>

          {/* Unlimited Song Cards */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AnimatePresence initial={false}>
              {slots.map((slot, idx) => (
                <motion.div
                  key={slot.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: STUDIO_EASE }}
                  className="studio-card-surface border border-[#292938] rounded-xl p-4 space-y-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-xs font-bold text-[#09090D] shrink-0"
                        style={{ backgroundColor: slot.color }}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-display text-sm font-semibold text-[#F8FAFC] truncate">
                          {slot.name}
                        </h2>
                        <p className="text-[11px] font-mono text-[#94A3B8] tabular-nums">
                          {slot.analysis.bpm} BPM · {slot.analysis.key} ({slot.analysis.camelot}) ·{' '}
                          {slot.processedBuffer.duration.toFixed(1)}s
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateSlot(slot.id, { mute: !slot.mute })}
                        className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                          slot.mute
                            ? 'bg-[#F43F5E]/20 border-[#F43F5E] text-[#F43F5E]'
                            : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                        }`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSlot(slot.id, { solo: !slot.solo })}
                        className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                          slot.solo
                            ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B]'
                            : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                        }`}
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlot(slot.id, 'up')}
                        disabled={idx === 0}
                        title="Move song earlier"
                        className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlot(slot.id, 'down')}
                        disabled={idx === slots.length - 1}
                        title="Move song later"
                        className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateSlot(slot)}
                        title="Duplicate song"
                        className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.id)}
                        title="Remove song"
                        className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F43F5E]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {busySlotId === slot.id ? (
                    <div className="h-[68px] flex items-center justify-center gap-2 bg-[#09090D] rounded border border-[#292938] text-xs text-[#94A3B8]">
                      <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />
                      Processing stem separation...
                    </div>
                  ) : (
                    <WaveformCanvas
                      peaks={slot.peaks}
                      duration={slot.processedBuffer.duration}
                      beatPositions={slot.analysis.beatPositions}
                      currentTime={Math.max(0, playhead - slot.startOffset)}
                      color={slot.color}
                      height={68}
                    />
                  )}

                  {/* Per-song Stem + Timing + Mix Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                    <div className="flex items-center gap-1 bg-[#09090D] p-1 rounded-md border border-[#292938]">
                      {(['full', 'vocals', 'instrumental'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => void applyStemMode(slot.id, m)}
                          className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                            slot.stemMode === m
                              ? 'bg-[#8B5CF6] text-[#F8FAFC]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#94A3B8]">
                      <label className="flex items-center gap-1">
                        Start
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={slot.startOffset}
                          onChange={(e) =>
                            updateSlot(slot.id, { startOffset: Math.max(0, Number(e.target.value)) })
                          }
                          className="w-14 bg-[#09090D] border border-[#292938] rounded px-1.5 py-0.5 font-mono text-[#F8FAFC]"
                        />
                        s
                      </label>
                      <label className="flex items-center gap-1">
                        Fade
                        <input
                          type="number"
                          min={0}
                          max={12}
                          step={0.5}
                          value={slot.fadeIn}
                          onChange={(e) =>
                            updateSlot(slot.id, { fadeIn: Math.max(0, Number(e.target.value)) })
                          }
                          className="w-12 bg-[#09090D] border border-[#292938] rounded px-1 py-0.5 font-mono text-[#F8FAFC]"
                        />
                        /
                        <input
                          type="number"
                          min={0}
                          max={12}
                          step={0.5}
                          value={slot.fadeOut}
                          onChange={(e) =>
                            updateSlot(slot.id, { fadeOut: Math.max(0, Number(e.target.value)) })
                          }
                          className="w-12 bg-[#09090D] border border-[#292938] rounded px-1 py-0.5 font-mono text-[#F8FAFC]"
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
                          onChange={(e) => updateSlot(slot.id, { volume: Number(e.target.value) })}
                          className="w-16"
                        />
                      </label>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Multi-Track Smart Mashup Assistant Report */}
      {multiReport && (
        <ScrollReveal className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-[#A3E635]" />
              <div>
                <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
                  Multi-Song Smart Mashup Report ({slots.length} Songs)
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Calculated locally from BPM autocorrelation & Camelot harmonic distance across every transition
                </p>
              </div>
            </div>

            <StudioButton variant="primary" size="sm" onClick={autoArrangeAndSyncAll}>
              <Wand2 className="w-3.5 h-3.5" />
              Auto-Sort & Sync All
            </StudioButton>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
              <p className="text-xs text-[#94A3B8]">Overall Flow Score</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#A3E635] mt-1">
                {multiReport.overallScore}%
              </p>
            </div>
            <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
              <p className="text-xs text-[#94A3B8]">Avg Tempo Match</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#22D3EE] mt-1">
                {multiReport.tempoScore}%
              </p>
            </div>
            <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
              <p className="text-xs text-[#94A3B8]">Harmonic Blend</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#8B5CF6] mt-1">
                {multiReport.harmonicScore}%
              </p>
            </div>
            <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
              <p className="text-xs text-[#94A3B8]">Recommended BPM</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#F8FAFC] mt-1">
                {multiReport.recommendedBpm}
              </p>
            </div>
          </div>

          {/* Transition Chain Breakdown */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#94A3B8]">Transition Chain Analysis</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {multiReport.pairwise.map((pair, idx) => (
                <div
                  key={`${pair.from}-${pair.to}-${idx}`}
                  className="bg-[#09090D] border border-[#292938] rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="text-[#F8FAFC] font-medium truncate">
                      {idx + 1}. {pair.from} → {pair.to}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] truncate">{pair.explanation}</p>
                  </div>
                  <span className="font-mono font-bold text-[#A3E635] shrink-0">
                    {pair.overallScore}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-[#292938]">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[#94A3B8] inline-flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#22D3EE]" />
                  Target Mashup Tempo (All Songs)
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
                <span className="text-[#94A3B8]">Default Crossfade Duration</span>
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

      {/* Multi-Quality Mashup Export Modal */}
      <ModalTransition open={exportOpen} onClose={() => exportProgress == null && setExportOpen(false)}>
        <div className="bg-[#14141D] border border-[#292938] rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">
              Export Multi-Song Mashup
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              {slots.length} songs · {Math.round(targetBpm)} BPM · Estimated size:{' '}
              <span className="font-mono text-[#22D3EE]">{formatBytes(estimatedExportSize)}</span>
            </p>
          </div>

          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2">
              {(['mp3', 'wav'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={`py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    exportFormat === fmt
                      ? 'studio-nav-bar-glow border-[#8B5CF6] text-[#F8FAFC]'
                      : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                  }`}
                >
                  {fmt === 'mp3' ? 'MP3 (64–320 kbps)' : 'WAV Lossless (16/24/32-bit)'}
                </button>
              ))}
            </div>

            {exportFormat === 'wav' ? (
              <div className="space-y-1.5">
                <label className="text-xs text-[#94A3B8]">WAV Bit Depth</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([16, 24, 32] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setWavDepth(d)}
                      className={`py-2 rounded-md border text-xs font-mono ${
                        wavDepth === d
                          ? 'bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE]'
                          : 'bg-[#09090D] border-[#292938] text-[#94A3B8]'
                      }`}
                    >
                      {d === 32 ? '32-bit Float' : `${d}-bit PCM`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs text-[#94A3B8]">MP3 Quality Bitrate</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([64, 96, 128, 192, 256, 320] as const).map((br) => (
                    <button
                      key={br}
                      type="button"
                      onClick={() => setMp3Bitrate(br)}
                      className={`py-1.5 rounded-md border text-xs font-mono ${
                        mp3Bitrate === br
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                          : 'bg-[#09090D] border-[#292938] text-[#94A3B8]'
                      }`}
                    >
                      {br} kbps
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-[#94A3B8]">Sample Rate</label>
                <select
                  value={sampleRate}
                  onChange={(e) => setSampleRate(Number(e.target.value) as AudioSampleRate)}
                  className="w-full bg-[#09090D] border border-[#292938] rounded-md px-2.5 py-2 text-xs text-[#F8FAFC]"
                >
                  <option value={22050}>22.05 kHz (Compact)</option>
                  <option value={44100}>44.1 kHz (CD Quality)</option>
                  <option value={48000}>48 kHz (Broadcast)</option>
                  {exportFormat === 'wav' && <option value={96000}>96 kHz (Hi-Res Master)</option>}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#94A3B8]">Channels</label>
                <select
                  value={channels}
                  onChange={(e) => setChannels(Number(e.target.value) as 1 | 2)}
                  className="w-full bg-[#09090D] border border-[#292938] rounded-md px-2.5 py-2 text-xs text-[#F8FAFC]"
                >
                  <option value={2}>Stereo (2 ch)</option>
                  <option value={1}>Mono (1 ch)</option>
                </select>
              </div>
            </div>

            <label className="flex items-center justify-between pt-2 border-t border-[#292938] text-xs text-[#F8FAFC] cursor-pointer">
              <span>Normalize Master Peak (-1 dBFS)</span>
              <input
                type="checkbox"
                checked={normalizePeak}
                onChange={(e) => setNormalizePeak(e.target.checked)}
                className="accent-[#8B5CF6] w-4 h-4"
              />
            </label>

            {exportProgress != null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-[#94A3B8]">
                  <span>Rendering {slots.length}-song mashup locally...</span>
                  <span className="font-mono text-[#F8FAFC]">{exportProgress}%</span>
                </div>
                <div className="h-2 bg-[#09090D] rounded overflow-hidden">
                  <div
                    className="h-full studio-accent-gradient transition-all"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={exportProgress != null}
              onClick={() => setExportOpen(false)}
              className="px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] text-xs font-medium text-[#F8FAFC]"
            >
              Cancel
            </button>
            <StudioButton
              variant="primary"
              size="sm"
              disabled={exportProgress != null}
              onClick={() => void handleExportMashup()}
            >
              {exportProgress != null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Render & Download
            </StudioButton>
          </div>
        </div>
      </ModalTransition>
    </div>
  );
}
