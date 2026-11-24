import {
  ArrowDown,
  ArrowUp,
  AudioWaveform,
  Copy,
  Crop,
  Download,
  Flag,
  FolderSync,
  Layers,
  Loader2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Scissors,
  Sliders,
  Square,
  Trash2,
  Upload,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { STUDIO_EASE, TabContentTransition } from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import { WaveformViewer } from '../components/WaveformViewer';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import {
  buildTrackEffectChain,
  concatAudioBuffers,
  decodeAudioFile,
  encodeAudioBufferToMp3,
  encodeAudioBufferToWav,
  extractWaveformPeaks,
  generateProceduralDemoTrack,
  getAudioContext,
  renderMixOffline,
  reverseAudioBuffer,
  sliceAudioBuffer,
  type TrackEffectChainNodes,
} from '../engines/audioEngine';
import { triggerBlobDownload } from '../engines/storageEngine';
import { useMixoraStore } from '../store/useMixoraStore';
import { DEFAULT_AUDIO_EFFECTS, type AudioTrackEffects, type AudioTrackModel } from '../types/mixora';

const TRACK_COLORS = ['#22D3EE', '#8B5CF6', '#3B82F6', '#A3E635', '#F59E0B'];

function formatTimecode(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe * 10) % 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function AudioStudioPage() {
  const tracks = useMixoraStore((s) => s.audioTracks);
  const markers = useMixoraStore((s) => s.audioMarkers);
  const selectedTrackId = useMixoraStore((s) => s.selectedAudioTrackId);
  const masterVolume = useMixoraStore((s) => s.masterVolume);
  const projectName = useMixoraStore((s) => s.projectName);

  const addAudioTrack = useMixoraStore((s) => s.addAudioTrack);
  const updateAudioTrack = useMixoraStore((s) => s.updateAudioTrack);
  const removeAudioTrack = useMixoraStore((s) => s.removeAudioTrack);
  const reorderAudioTrack = useMixoraStore((s) => s.reorderAudioTrack);
  const setSelectedAudioTrackId = useMixoraStore((s) => s.setSelectedAudioTrackId);
  const setMasterVolume = useMixoraStore((s) => s.setMasterVolume);
  const addAudioMarker = useMixoraStore((s) => s.addAudioMarker);
  const removeAudioMarker = useMixoraStore((s) => s.removeAudioMarker);
  const pushToast = useMixoraStore((s) => s.pushToast);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [trackHeight, setTrackHeight] = useState(76);
  const [regionStart, setRegionStart] = useState<number | null>(null);
  const [regionEnd, setRegionEnd] = useState<number | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'edit' | 'mixer' | 'effects'>('effects');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');
  const [wavDepth, setWavDepth] = useState<16 | 24>(16);
  const [mp3Bitrate, setMp3Bitrate] = useState(192);
  const [exportScope, setExportScope] = useState<'full' | 'region'>('full');
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const relinkInputRef = useRef<HTMLInputElement | null>(null);
  const relinkTargetIdRef = useRef<string | null>(null);

  const playbackRef = useRef<{
    sources: AudioBufferSourceNode[];
    chains: Map<string, { chain: TrackEffectChainNodes; gain: GainNode; panner: StereoPannerNode }>;
    masterGain: GainNode;
    analyser: AnalyserNode;
    startContextTime: number;
    startPlayhead: number;
    rafId: number;
  } | null>(null);

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? tracks[0] ?? null;

  const totalTimelineDuration = Math.max(
    10,
    ...tracks.map((t) => t.startOffset + Math.max(0.1, (t.trimEnd - t.trimStart) / Math.max(0.25, t.speed)))
  );

  const stopPlayback = () => {
    const pb = playbackRef.current;
    if (!pb) return;
    cancelAnimationFrame(pb.rafId);
    for (const src of pb.sources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // already stopped
      }
    }
    try {
      pb.masterGain.disconnect();
      pb.analyser.disconnect();
    } catch {
      // ignore
    }
    playbackRef.current = null;
    setIsPlaying(false);
    setMeterLevel(0);
  };

  useEffect(() => {
    return () => stopPlayback();
  }, []);

  // Live update audio effects & mixer parameters while playing
  useEffect(() => {
    const pb = playbackRef.current;
    if (!pb) return;
    const ctx = pb.masterGain.context;
    pb.masterGain.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.02);
    const anySolo = tracks.some((t) => t.solo);
    for (const t of tracks) {
      const node = pb.chains.get(t.id);
      if (!node) continue;
      const audible = !t.mute && (!anySolo || t.solo);
      node.gain.gain.setTargetAtTime(audible ? t.volume : 0, ctx.currentTime, 0.02);
      node.panner.pan.setTargetAtTime(t.pan, ctx.currentTime, 0.02);
      node.chain.updateEffects(t.effects);
    }
  }, [tracks, masterVolume]);

  const startPlayback = (fromSec = playhead) => {
    stopPlayback();
    const playable = tracks.filter((t) => t.buffer);
    if (playable.length === 0) {
      pushToast({ type: 'warning', title: 'Load an audio track before playing' });
      return;
    }

    const ctx = getAudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    const anySolo = tracks.some((t) => t.solo);
    const sources: AudioBufferSourceNode[] = [];
    const chains = new Map<string, { chain: TrackEffectChainNodes; gain: GainNode; panner: StereoPannerNode }>();

    const startAt = ctx.currentTime + 0.04;

    for (const track of playable) {
      if (!track.buffer) continue;
      const rawBuf = track.reversed ? reverseAudioBuffer(track.buffer) : track.buffer;
      const source = ctx.createBufferSource();
      source.buffer = rawBuf;
      const pitchFactor = Math.pow(2, track.pitchSemitones / 12);
      const effRate = Math.max(0.25, Math.min(4, track.speed * pitchFactor));
      source.playbackRate.value = effRate;

      const chain = buildTrackEffectChain(ctx, track.effects);
      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan;
      const gain = ctx.createGain();
      const audible = !track.mute && (!anySolo || track.solo);

      const effClipDur = (track.trimEnd - track.trimStart) / effRate;
      const clipEnd = track.startOffset + effClipDur;
      if (clipEnd <= fromSec) continue;

      const delay = Math.max(0, track.startOffset - fromSec);
      const skipTimeline = Math.max(0, fromSec - track.startOffset);
      const bufOffset = track.trimStart + skipTimeline * effRate;
      const bufDur = Math.max(0.01, track.trimEnd - bufOffset);

      const baseVol = audible ? track.volume : 0;
      gain.gain.setValueAtTime(baseVol, startAt + delay);

      if (audible && track.fadeIn > 0 && skipTimeline === 0) {
        gain.gain.setValueAtTime(0.0001, startAt + delay);
        gain.gain.linearRampToValueAtTime(
          Math.max(0.0001, track.volume),
          startAt + delay + Math.min(track.fadeIn, effClipDur / 2)
        );
      }
      if (audible && track.fadeOut > 0) {
        const remainingDur = effClipDur - skipTimeline;
        const fadeOutDur = Math.min(track.fadeOut, remainingDur);
        const fadeStart = startAt + delay + Math.max(0, remainingDur - fadeOutDur);
        gain.gain.setValueAtTime(Math.max(0.0001, track.volume), fadeStart);
        gain.gain.linearRampToValueAtTime(0.0001, startAt + delay + remainingDur);
      }

      source.connect(chain.input);
      chain.output.connect(panner);
      panner.connect(gain);
      gain.connect(masterGain);

      source.start(startAt + delay, bufOffset, bufDur);
      sources.push(source);
      chains.set(track.id, { chain, gain, panner });
    }

    const timeData = new Uint8Array(analyser.fftSize);
    const loopEndTarget = regionEnd && regionStart != null && regionEnd > regionStart ? regionEnd : totalTimelineDuration;
    const loopStartTarget = regionEnd && regionStart != null && regionEnd > regionStart ? regionStart : 0;

    const tick = () => {
      const pb = playbackRef.current;
      if (!pb) return;
      const elapsed = Math.max(0, ctx.currentTime - pb.startContextTime);
      const current = pb.startPlayhead + elapsed;

      analyser.getByteTimeDomainData(timeData);
      let maxAmp = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = Math.abs(timeData[i] - 128) / 128;
        if (v > maxAmp) maxAmp = v;
      }
      setMeterLevel(Math.min(1, maxAmp * 1.4));

      if (current >= loopEndTarget) {
        if (loopEnabled) {
          startPlayback(loopStartTarget);
          return;
        }
        setPlayhead(0);
        stopPlayback();
        return;
      }

      setPlayhead(current);
      pb.rafId = requestAnimationFrame(tick);
    };

    playbackRef.current = {
      sources,
      chains,
      masterGain,
      analyser,
      startContextTime: startAt,
      startPlayhead: fromSec,
      rafId: requestAnimationFrame(tick),
    };
    setIsPlaying(true);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = await decodeAudioFile(file);
        const peaks = extractWaveformPeaks(buffer, 640);
        const color = TRACK_COLORS[(tracks.length + i) % TRACK_COLORS.length];
        const track: AudioTrackModel = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          duration: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          startOffset: 0,
          trimStart: 0,
          trimEnd: buffer.duration,
          volume: 1,
          pan: 0,
          mute: false,
          solo: false,
          group: 'Master',
          fadeIn: 0,
          fadeOut: 0,
          reversed: false,
          speed: 1,
          pitchSemitones: 0,
          color,
          peaks,
          effects: { ...DEFAULT_AUDIO_EFFECTS },
          buffer,
          missingMedia: false,
        };
        addAudioTrack(track);
      }
      pushToast({ type: 'success', title: `Imported ${files.length} audio file(s)` });
    } catch (err) {
      trackAnonymousEvent({
        eventType: 'processing_error',
        feature: 'audio_studio',
        status: 'error',
        errorCategory: 'unsupported_format',
      });
      pushToast({
        type: 'error',
        title: 'Audio import failed',
        detail: err instanceof Error ? err.message : 'Unable to decode audio file.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleRelinkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = relinkTargetIdRef.current;
    if (!file || !targetId) return;
    try {
      const buffer = await decodeAudioFile(file);
      const peaks = extractWaveformPeaks(buffer, 640);
      updateAudioTrack(targetId, {
        buffer,
        peaks,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        fileName: file.name,
        missingMedia: false,
      });
      pushToast({ type: 'success', title: `Relinked "${file.name}"` });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Relink failed',
        detail: err instanceof Error ? err.message : 'Unable to decode selected audio.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const loadDemoTrack = async (preset: 'electronic_124' | 'lofi_96' | 'house_126') => {
    setIsImporting(true);
    try {
      const { name, buffer } = await generateProceduralDemoTrack(preset);
      const peaks = extractWaveformPeaks(buffer, 640);
      const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
      addAudioTrack({
        id: crypto.randomUUID(),
        name,
        fileName: `${preset}.wav`,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        startOffset: 0,
        trimStart: 0,
        trimEnd: buffer.duration,
        volume: 1,
        pan: 0,
        mute: false,
        solo: false,
        group: 'Master',
        fadeIn: 0,
        fadeOut: 0,
        reversed: false,
        speed: 1,
        pitchSemitones: 0,
        color,
        peaks,
        effects: { ...DEFAULT_AUDIO_EFFECTS },
        buffer,
        missingMedia: false,
      });
      pushToast({ type: 'success', title: `Generated studio track: ${name}` });
    } finally {
      setIsImporting(false);
    }
  };

  // Editing operations
  const handleSplitTrack = () => {
    if (!selectedTrack || !selectedTrack.buffer) return;
    const localTime = (playhead - selectedTrack.startOffset) * selectedTrack.speed + selectedTrack.trimStart;
    if (localTime <= selectedTrack.trimStart + 0.1 || localTime >= selectedTrack.trimEnd - 0.1) {
      pushToast({
        type: 'warning',
        title: 'Place the playhead inside the selected clip to split',
      });
      return;
    }
    const rightStartOffset = playhead;
    const rightTrack: AudioTrackModel = {
      ...selectedTrack,
      id: crypto.randomUUID(),
      name: `${selectedTrack.name} (Part 2)`,
      startOffset: rightStartOffset,
      trimStart: localTime,
      trimEnd: selectedTrack.trimEnd,
      effects: { ...selectedTrack.effects },
    };
    updateAudioTrack(selectedTrack.id, { trimEnd: localTime });
    addAudioTrack(rightTrack);
    pushToast({ type: 'success', title: `Split clip at ${formatTimecode(playhead)}` });
  };

  const handleDuplicateTrack = () => {
    if (!selectedTrack) return;
    addAudioTrack({
      ...selectedTrack,
      id: crypto.randomUUID(),
      name: `${selectedTrack.name} Copy`,
      startOffset: selectedTrack.startOffset + 0.5,
      effects: { ...selectedTrack.effects },
    });
    pushToast({ type: 'success', title: 'Duplicated track' });
  };

  const handleCropSelection = () => {
    if (!selectedTrack || !selectedTrack.buffer) return;
    if (regionStart == null || regionEnd == null || regionEnd <= regionStart + 0.1) {
      pushToast({ type: 'warning', title: 'Set a valid selection region before cropping' });
      return;
    }
    const cropped = sliceAudioBuffer(selectedTrack.buffer, regionStart, regionEnd);
    const peaks = extractWaveformPeaks(cropped, 640);
    updateAudioTrack(selectedTrack.id, {
      buffer: cropped,
      peaks,
      duration: cropped.duration,
      trimStart: 0,
      trimEnd: cropped.duration,
      startOffset: 0,
    });
    setRegionStart(null);
    setRegionEnd(null);
    pushToast({ type: 'success', title: 'Cropped track to selected region' });
  };

  const handleMergeTracks = () => {
    const buffers = tracks.filter((t) => t.buffer).map((t) => sliceAudioBuffer(t.buffer!, t.trimStart, t.trimEnd));
    if (buffers.length < 2) {
      pushToast({ type: 'warning', title: 'Add at least 2 tracks to merge sequentially' });
      return;
    }
    const merged = concatAudioBuffers(buffers);
    const peaks = extractWaveformPeaks(merged, 640);
    addAudioTrack({
      id: crypto.randomUUID(),
      name: 'Merged Sequence',
      fileName: 'merged-sequence.wav',
      duration: merged.duration,
      sampleRate: merged.sampleRate,
      channels: merged.numberOfChannels,
      startOffset: 0,
      trimStart: 0,
      trimEnd: merged.duration,
      volume: 1,
      pan: 0,
      mute: false,
      solo: false,
      group: 'Master',
      fadeIn: 0,
      fadeOut: 0,
      reversed: false,
      speed: 1,
      pitchSemitones: 0,
      color: '#A3E635',
      peaks,
      effects: { ...DEFAULT_AUDIO_EFFECTS },
      buffer: merged,
    });
    pushToast({ type: 'success', title: `Merged ${buffers.length} clips into new track` });
  };

  const handleCrossfadeSelectedWithNext = () => {
    if (!selectedTrack) return;
    const idx = tracks.findIndex((t) => t.id === selectedTrack.id);
    const next = tracks[idx + 1];
    if (!next) {
      pushToast({ type: 'warning', title: 'Select a track with another track below it to crossfade' });
      return;
    }
    const fadeDur = 2.0;
    const clipEnd = selectedTrack.startOffset + (selectedTrack.trimEnd - selectedTrack.trimStart) / selectedTrack.speed;
    updateAudioTrack(selectedTrack.id, { fadeOut: fadeDur });
    updateAudioTrack(next.id, { startOffset: Math.max(0, clipEnd - fadeDur), fadeIn: fadeDur });
    pushToast({ type: 'success', title: `Applied 2.0s crossfade between "${selectedTrack.name}" and "${next.name}"` });
  };

  const handleReverseTrack = () => {
    if (!selectedTrack || !selectedTrack.buffer) return;
    const nextRev = !selectedTrack.reversed;
    updateAudioTrack(selectedTrack.id, {
      reversed: nextRev,
      peaks: [...selectedTrack.peaks].reverse(),
    });
    pushToast({ type: 'info', title: nextRev ? 'Track reversed' : 'Track restored to forward' });
  };

  const updateSelectedEffect = <K extends keyof AudioTrackEffects>(key: K, val: AudioTrackEffects[K]) => {
    if (!selectedTrack) return;
    updateAudioTrack(selectedTrack.id, {
      effects: { ...selectedTrack.effects, [key]: val },
    });
  };

  const handleExport = async () => {
    if (tracks.every((t) => !t.buffer)) {
      pushToast({ type: 'error', title: 'No audio loaded to export' });
      return;
    }
    setExportProgress(5);
    trackAnonymousEvent({
      eventType: 'export_attempt',
      feature: 'audio_studio',
      format: exportFormat,
    });

    try {
      const region =
        exportScope === 'region' && regionStart != null && regionEnd != null && regionEnd > regionStart
          ? { start: regionStart, end: regionEnd }
          : undefined;
      setExportProgress(25);
      const rendered = await renderMixOffline(tracks, masterVolume, region);
      setExportProgress(55);

      const safeBase = projectName.replace(/[^a-z0-9\-_\s]/gi, '').trim().replace(/\s+/g, '_') || 'mixora_audio';
      let blob: Blob;
      let ext: string;

      if (exportFormat === 'wav') {
        blob = encodeAudioBufferToWav(rendered, wavDepth);
        ext = 'wav';
        setExportProgress(100);
      } else {
        blob = await encodeAudioBufferToMp3(rendered, mp3Bitrate, (pct) => {
          setExportProgress(55 + Math.round(pct * 0.45));
        });
        ext = 'mp3';
      }

      triggerBlobDownload(blob, `${safeBase}.${ext}`);
      trackAnonymousEvent({
        eventType: 'export_success',
        feature: 'audio_studio',
        status: 'success',
        format: exportFormat,
      });
      pushToast({ type: 'success', title: `Exported ${safeBase}.${ext}` });
      setExportOpen(false);
    } catch (err) {
      trackAnonymousEvent({
        eventType: 'export_fail',
        feature: 'audio_studio',
        status: 'error',
        format: exportFormat,
        errorCategory: 'export_failed',
      });
      pushToast({
        type: 'error',
        title: 'Audio export failed',
        detail: err instanceof Error ? err.message : 'Offline render error.',
      });
    } finally {
      setExportProgress(null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Top Transport & Editing Bar */}
      <div className="bg-[#14141D] border-b border-[#292938] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Transport */}
        <div className="flex items-center gap-2">
          <StudioButton
            variant="primary"
            size="sm"
            onClick={() => (isPlaying ? stopPlayback() : startPlayback(playhead))}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause' : 'Play'}
          </StudioButton>
          <button
            type="button"
            onClick={() => {
              stopPlayback();
              setPlayhead(0);
            }}
            aria-label="Stop and rewind"
            className="p-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setLoopEnabled((l) => !l)}
            title="Toggle Loop"
            className={`p-2 rounded-md border transition-colors ${
              loopEnabled
                ? 'bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE]'
                : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <div className="px-3 py-1.5 rounded bg-[#09090D] border border-[#292938] font-mono tabular-nums text-xs text-[#22D3EE]">
            {formatTimecode(playhead)} / {formatTimecode(totalTimelineDuration)}
          </div>
        </div>

        {/* Editing Action Bar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*"
            multiple
            onChange={(e) => void handleFiles(e.target.files)}
            className="hidden"
          />
          <input
            ref={relinkInputRef}
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*"
            onChange={(e) => void handleRelinkFile(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
          >
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-[#22D3EE]" />}
            Import Audio
          </button>
          <button
            type="button"
            onClick={handleSplitTrack}
            disabled={!selectedTrack}
            title="Split clip at playhead"
            className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
          >
            <Scissors className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCropSelection}
            disabled={!selectedTrack || regionStart == null || regionEnd == null}
            title="Crop track to selection"
            className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
          >
            <Crop className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDuplicateTrack}
            disabled={!selectedTrack}
            title="Duplicate track"
            className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleMergeTracks}
            disabled={tracks.length < 2}
            title="Merge tracks sequentially"
            className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCrossfadeSelectedWithNext}
            disabled={tracks.length < 2}
            className="px-2.5 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40 whitespace-nowrap"
          >
            Crossfade
          </button>
          <button
            type="button"
            onClick={handleReverseTrack}
            disabled={!selectedTrack}
            title="Reverse track"
            className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              addAudioMarker({
                id: crypto.randomUUID(),
                time: Number(playhead.toFixed(2)),
                label: `M${markers.length + 1}`,
                color: '#F59E0B',
              })
            }
            title="Add timeline marker at playhead"
            className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F59E0B]"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
            aria-label="Zoom out timeline"
            className="p-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono tabular-nums text-[#94A3B8] px-0.5">
            {zoom.toFixed(1)}x
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(6, Number((z + 0.5).toFixed(1))))}
            aria-label="Zoom in timeline"
            className="p-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="hidden sm:flex items-center gap-0.5 bg-[#09090D] p-0.5 rounded-md border border-[#292938]">
            {[
              { label: 'S', value: 52 },
              { label: 'M', value: 76 },
              { label: 'L', value: 116 },
            ].map((h) => (
              <button
                key={h.label}
                type="button"
                onClick={() => setTrackHeight(h.value)}
                title={`Waveform track height: ${h.value}px`}
                className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                  trackHeight === h.value
                    ? 'bg-[#8B5CF6] text-[#F8FAFC]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
          <StudioButton
            variant="audio"
            size="xs"
            onClick={() => setExportOpen(true)}
            disabled={tracks.every((t) => !t.buffer)}
            className="px-3.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Audio
          </StudioButton>
        </div>
      </div>

      {/* Main Workspace Split: Multitrack Timeline + Inspector */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Multitrack Timeline Area */}
        <div
          className="flex-1 min-w-0 overflow-y-auto p-4 space-y-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleFiles(e.dataTransfer.files);
          }}
        >
          {/* Master Bus Strip */}
          <div className="bg-[#14141D] border border-[#292938] rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-[#22D3EE]" />
              <span className="text-xs font-medium text-[#F8FAFC]">Master Bus</span>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={masterVolume}
                onChange={(e) => setMasterVolume(Number(e.target.value))}
                className="w-28"
              />
              <span className="text-xs font-mono tabular-nums text-[#94A3B8]">
                {Math.round(masterVolume * 100)}%
              </span>
            </div>

            {/* Live Peak Meter */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#94A3B8]">Peak</span>
              <div className="w-32 h-2 bg-[#09090D] rounded overflow-hidden border border-[#292938]">
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${Math.round(meterLevel * 100)}%`,
                    backgroundColor: meterLevel > 0.85 ? '#F43F5E' : meterLevel > 0.6 ? '#F59E0B' : '#A3E635',
                  }}
                />
              </div>
            </div>

            {/* Region Selection */}
            <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
              <span>Region:</span>
              <input
                type="number"
                step={0.5}
                min={0}
                max={totalTimelineDuration}
                placeholder="Start"
                value={regionStart ?? ''}
                onChange={(e) => setRegionStart(e.target.value === '' ? null : Number(e.target.value))}
                className="w-16 bg-[#09090D] border border-[#292938] rounded px-1.5 py-0.5 text-xs font-mono text-[#F8FAFC]"
              />
              <span>–</span>
              <input
                type="number"
                step={0.5}
                min={0}
                max={totalTimelineDuration}
                placeholder="End"
                value={regionEnd ?? ''}
                onChange={(e) => setRegionEnd(e.target.value === '' ? null : Number(e.target.value))}
                className="w-16 bg-[#09090D] border border-[#292938] rounded px-1.5 py-0.5 text-xs font-mono text-[#F8FAFC]"
              />
            </div>
          </div>

          {/* Markers Strip */}
          {markers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#94A3B8]">Markers:</span>
              {markers.map((m) => (
                <div
                  key={m.id}
                  className="inline-flex items-center gap-1.5 bg-[#14141D] border border-[#292938] rounded px-2 py-1"
                >
                  <button
                    type="button"
                    onClick={() => setPlayhead(m.time)}
                    className="font-mono text-[#F59E0B] hover:text-[#F8FAFC]"
                  >
                    {m.label} ({formatTimecode(m.time)})
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAudioMarker(m.id)}
                    aria-label="Remove marker"
                    className="text-[#94A3B8] hover:text-[#F43F5E]"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tracks or Empty State */}
          {tracks.length === 0 ? (
            <div className="bg-[#14141D] border border-dashed border-[#292938] rounded-xl p-10 text-center space-y-4">
              <AudioWaveform className="w-9 h-9 text-[#22D3EE] mx-auto" />
              <div className="space-y-1">
                <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
                  Drop MP3, WAV, FLAC, OGG, or AAC files here
                </h2>
                <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
                  Everything decodes and processes directly in your browser. Or generate a built-in
                  studio stem to test multitrack mixing right away.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <StudioButton
                  variant="primary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose Local Audio Files
                </StudioButton>
                <button
                  type="button"
                  onClick={() => void loadDemoTrack('electronic_124')}
                  className="px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#22D3EE]"
                >
                  Load 124 BPM Studio Synth Stem
                </button>
                <button
                  type="button"
                  onClick={() => void loadDemoTrack('lofi_96')}
                  className="px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
                >
                  Load 96 BPM Lo-Fi Tape Stem
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {tracks.map((track, idx) => {
                  const isSelected = selectedTrack?.id === track.id;
                  return (
                    <motion.div
                      key={track.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      onClick={() => setSelectedAudioTrackId(track.id)}
                      className={`bg-[#14141D] border rounded-lg p-3.5 transition-colors ${
                        isSelected ? 'border-[#8B5CF6]' : 'border-[#292938] hover:border-[#3A3A4F]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs text-[#94A3B8]">{String(idx + 1).padStart(2, '0')}</span>
                          <span className="text-sm font-medium text-[#F8FAFC] truncate">{track.name}</span>
                          <span className="text-xs text-[#94A3B8] font-mono tabular-nums hidden sm:inline">
                            · {formatTimecode(track.trimEnd - track.trimStart)} · {track.sampleRate / 1000}kHz
                            {track.reversed ? ' · REV' : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {track.missingMedia && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                relinkTargetIdRef.current = track.id;
                                relinkInputRef.current?.click();
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[11px] font-medium text-[#F59E0B]"
                            >
                              <FolderSync className="w-3 h-3" />
                              Relink Media
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateAudioTrack(track.id, { mute: !track.mute });
                            }}
                            className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
                              track.mute
                                ? 'bg-[#F43F5E]/20 border-[#F43F5E] text-[#F43F5E]'
                                : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                            }`}
                          >
                            M
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateAudioTrack(track.id, { solo: !track.solo });
                            }}
                            className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
                              track.solo
                                ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B]'
                                : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                            }`}
                          >
                            S
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderAudioTrack(track.id, 'up');
                            }}
                            disabled={idx === 0}
                            aria-label="Move track up"
                            className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderAudioTrack(track.id, 'down');
                            }}
                            disabled={idx === tracks.length - 1}
                            aria-label="Move track down"
                            className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAudioTrack(track.id);
                            }}
                            aria-label="Delete track"
                            className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F43F5E]"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* WaveSurfer.js Waveform Viewer with zoom & configurable track height */}
                      <WaveformViewer
                        audioBuffer={track.buffer}
                        peaks={track.peaks}
                        duration={track.duration}
                        currentTime={Math.max(0, (playhead - track.startOffset) * track.speed)}
                        zoom={zoom}
                        height={trackHeight}
                        waveColor={track.color}
                        progressColor="#8B5CF6"
                        trimStart={track.trimStart}
                        trimEnd={track.trimEnd}
                        selectionStart={regionStart}
                        selectionEnd={regionEnd}
                        markers={markers}
                        onSeek={(t) => setPlayhead(track.startOffset + t / Math.max(0.25, track.speed))}
                      />

                      {/* Inline quick mixer */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-[#94A3B8]">
                        <label className="flex items-center gap-2">
                          Vol
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={track.volume}
                            onChange={(e) => updateAudioTrack(track.id, { volume: Number(e.target.value) })}
                            className="w-20"
                          />
                          <span className="font-mono tabular-nums text-[#F8FAFC] w-9">
                            {Math.round(track.volume * 100)}%
                          </span>
                        </label>
                        <label className="flex items-center gap-2">
                          Pan
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.05}
                            value={track.pan}
                            onChange={(e) => updateAudioTrack(track.id, { pan: Number(e.target.value) })}
                            className="w-20"
                          />
                          <span className="font-mono tabular-nums text-[#F8FAFC] w-8">
                            {track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`}
                          </span>
                        </label>
                        <label className="flex items-center gap-2">
                          Offset (s)
                          <input
                            type="number"
                            min={0}
                            step={0.25}
                            value={track.startOffset}
                            onChange={(e) =>
                              updateAudioTrack(track.id, { startOffset: Math.max(0, Number(e.target.value)) })
                            }
                            className="w-16 bg-[#09090D] border border-[#292938] rounded px-1.5 py-0.5 font-mono text-[#F8FAFC]"
                          />
                        </label>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Contextual Inspector Sidebar (Edit / Mixer / Effects Rack) */}
        <aside className="w-full lg:w-80 xl:w-96 shrink-0 bg-[#14141D] border-t lg:border-t-0 lg:border-l border-[#292938] flex flex-col max-h-[45vh] lg:max-h-none">
          <div className="p-3 border-b border-[#292938] flex items-center justify-between">
            <div className="flex items-center gap-1 bg-[#09090D] p-1 rounded-md border border-[#292938]">
              {(['effects', 'edit', 'mixer'] as const).map((t) => {
                const active = inspectorTab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInspectorTab(t)}
                    className={`relative px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                      active ? 'text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="audio-inspector-tab-bg"
                        transition={{ duration: 0.2, ease: STUDIO_EASE }}
                        className="absolute inset-0 rounded bg-[#8B5CF6]"
                      />
                    )}
                    <span className="relative z-10">{t}</span>
                  </button>
                );
              })}
            </div>
            <Sliders className="w-4 h-4 text-[#94A3B8]" />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <TabContentTransition tabKey={!selectedTrack ? 'empty' : inspectorTab} className="space-y-4">
            {!selectedTrack ? (
              <p className="text-xs text-[#94A3B8]">Select or import a track to inspect effects and trim settings.</p>
            ) : inspectorTab === 'edit' ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#F8FAFC] truncate">{selectedTrack.name}</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#94A3B8]">Trim Start</span>
                    <span className="font-mono tabular-nums">{formatTimecode(selectedTrack.trimStart)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, selectedTrack.trimEnd - 0.1)}
                    step={0.05}
                    value={selectedTrack.trimStart}
                    onChange={(e) => updateAudioTrack(selectedTrack.id, { trimStart: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#94A3B8]">Trim End</span>
                    <span className="font-mono tabular-nums">{formatTimecode(selectedTrack.trimEnd)}</span>
                  </div>
                  <input
                    type="range"
                    min={selectedTrack.trimStart + 0.1}
                    max={selectedTrack.duration}
                    step={0.05}
                    value={selectedTrack.trimEnd}
                    onChange={(e) => updateAudioTrack(selectedTrack.id, { trimEnd: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#94A3B8]">Fade In</span>
                      <span className="font-mono">{selectedTrack.fadeIn.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={0.1}
                      value={selectedTrack.fadeIn}
                      onChange={(e) => updateAudioTrack(selectedTrack.id, { fadeIn: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#94A3B8]">Fade Out</span>
                      <span className="font-mono">{selectedTrack.fadeOut.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={0.1}
                      value={selectedTrack.fadeOut}
                      onChange={(e) => updateAudioTrack(selectedTrack.id, { fadeOut: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#94A3B8]">Playback Speed</span>
                    <span className="font-mono tabular-nums">{selectedTrack.speed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    value={selectedTrack.speed}
                    onChange={(e) => updateAudioTrack(selectedTrack.id, { speed: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#94A3B8]">Pitch Adjustment</span>
                    <span className="font-mono tabular-nums">
                      {selectedTrack.pitchSemitones > 0 ? `+${selectedTrack.pitchSemitones}` : selectedTrack.pitchSemitones} st
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={selectedTrack.pitchSemitones}
                    onChange={(e) => updateAudioTrack(selectedTrack.id, { pitchSemitones: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            ) : inspectorTab === 'mixer' ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#F8FAFC]">Track Routing & Grouping</p>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#94A3B8]">Track Group Bus</label>
                  <select
                    value={selectedTrack.group}
                    onChange={(e) => updateAudioTrack(selectedTrack.id, { group: e.target.value })}
                    className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-xs text-[#F8FAFC]"
                  >
                    <option value="Master">Master Bus</option>
                    <option value="Vocals">Vocals Group</option>
                    <option value="Drums">Drums & Bass Group</option>
                    <option value="Instruments">Instruments Group</option>
                  </select>
                </div>
                <div className="space-y-2 border-t border-[#292938] pt-3">
                  <p className="text-xs font-medium text-[#94A3B8]">All Channel Levels</p>
                  {tracks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span className="w-24 truncate text-[#F8FAFC]">{t.name}</span>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.01}
                        value={t.volume}
                        onChange={(e) => updateAudioTrack(t.id, { volume: Number(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="font-mono tabular-nums w-10 text-right text-[#94A3B8]">
                        {Math.round(t.volume * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#F8FAFC]">Web Audio DSP Rack</p>
                  <button
                    type="button"
                    onClick={() => updateAudioTrack(selectedTrack.id, { effects: { ...DEFAULT_AUDIO_EFFECTS } })}
                    className="text-[11px] text-[#94A3B8] hover:text-[#F43F5E]"
                  >
                    Reset FX
                  </button>
                </div>

                {[
                  { key: 'eqLow' as const, label: 'EQ Low (220 Hz)', min: -12, max: 12, step: 0.5, unit: ' dB' },
                  { key: 'eqMid' as const, label: 'EQ Mid (1.2 kHz)', min: -12, max: 12, step: 0.5, unit: ' dB' },
                  { key: 'eqHigh' as const, label: 'EQ High (5 kHz)', min: -12, max: 12, step: 0.5, unit: ' dB' },
                  { key: 'bassBoost' as const, label: 'Bass Boost', min: 0, max: 12, step: 0.5, unit: ' dB' },
                  { key: 'reverbMix' as const, label: 'Convolution Reverb', min: 0, max: 1, step: 0.02, unit: '%' },
                  { key: 'delayTime' as const, label: 'Delay Time', min: 0.05, max: 1.0, step: 0.02, unit: ' s' },
                  { key: 'delayFeedback' as const, label: 'Delay Feedback', min: 0, max: 0.78, step: 0.02, unit: '%' },
                  { key: 'echoMix' as const, label: 'Echo Mix', min: 0, max: 1, step: 0.02, unit: '%' },
                  { key: 'compressorThreshold' as const, label: 'Compressor Threshold', min: -48, max: 0, step: 1, unit: ' dB' },
                  { key: 'compressorRatio' as const, label: 'Compressor Ratio', min: 1, max: 20, step: 0.5, unit: ':1' },
                  { key: 'distortionAmount' as const, label: 'Warm Distortion', min: 0, max: 100, step: 1, unit: '%' },
                  { key: 'noiseReduction' as const, label: 'High-Freq Denoise', min: 0, max: 1, step: 0.05, unit: '%' },
                  { key: 'highPassFreq' as const, label: 'High-Pass Filter', min: 20, max: 2000, step: 10, unit: ' Hz' },
                  { key: 'lowPassFreq' as const, label: 'Low-Pass Filter', min: 1000, max: 20000, step: 100, unit: ' Hz' },
                ].map((fx) => {
                  const val = selectedTrack.effects[fx.key];
                  const display =
                    fx.unit === '%' && fx.max === 1
                      ? `${Math.round(val * 100)}%`
                      : `${val}${fx.unit}`;
                  return (
                    <div key={fx.key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#94A3B8]">{fx.label}</span>
                        <span className="font-mono tabular-nums text-[#F8FAFC]">{display}</span>
                      </div>
                      <input
                        type="range"
                        min={fx.min}
                        max={fx.max}
                        step={fx.step}
                        value={val}
                        onChange={(e) => updateSelectedEffect(fx.key, Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  );
                })}

                <label className="flex items-center justify-between pt-2 border-t border-[#292938] text-xs text-[#F8FAFC] cursor-pointer">
                  <span>Brickwall Master Limiter</span>
                  <input
                    type="checkbox"
                    checked={selectedTrack.effects.limiterEnabled}
                    onChange={(e) => updateSelectedEffect('limiterEnabled', e.target.checked)}
                    className="accent-[#8B5CF6] w-4 h-4"
                  />
                </label>
              </div>
            )}
            </TabContentTransition>
          </div>
        </aside>
      </div>

      {/* Audio Export Modal */}
      <AnimatePresence>
        {exportOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[#14141D] border border-[#292938] rounded-xl max-w-md w-full p-6 space-y-5"
            >
              <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">Export Master Audio</h3>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-[#94A3B8]">Format</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportFormat('wav')}
                      className={`py-2 rounded-md border text-xs font-medium transition-colors ${
                        exportFormat === 'wav'
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                          : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                      }`}
                    >
                      WAV (Lossless PCM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('mp3')}
                      className={`py-2 rounded-md border text-xs font-medium transition-colors ${
                        exportFormat === 'mp3'
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                          : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                      }`}
                    >
                      MP3 (LAME Encoder)
                    </button>
                  </div>
                </div>

                {exportFormat === 'wav' ? (
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#94A3B8]">Bit Depth</label>
                    <select
                      value={wavDepth}
                      onChange={(e) => setWavDepth(Number(e.target.value) as 16 | 24)}
                      className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-xs text-[#F8FAFC]"
                    >
                      <option value={16}>16-bit PCM (CD Quality)</option>
                      <option value={24}>24-bit PCM (Studio Master)</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#94A3B8]">MP3 Bitrate</label>
                    <select
                      value={mp3Bitrate}
                      onChange={(e) => setMp3Bitrate(Number(e.target.value))}
                      className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-xs text-[#F8FAFC]"
                    >
                      <option value={128}>128 kbps (Compact)</option>
                      <option value={192}>192 kbps (Standard)</option>
                      <option value={256}>256 kbps (High)</option>
                      <option value={320}>320 kbps (Maximum)</option>
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-[#94A3B8]">Export Scope</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportScope('full')}
                      className={`py-2 rounded-md border text-xs font-medium transition-colors ${
                        exportScope === 'full'
                          ? 'bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE]'
                          : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                      }`}
                    >
                      Full Arrangement
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportScope('region')}
                      disabled={regionStart == null || regionEnd == null || regionEnd <= regionStart}
                      className={`py-2 rounded-md border text-xs font-medium disabled:opacity-40 transition-colors ${
                        exportScope === 'region'
                          ? 'bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE]'
                          : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                      }`}
                    >
                      Selected Region
                    </button>
                  </div>
                </div>

                {exportProgress != null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[#94A3B8]">
                      <span>Encoding locally in browser...</span>
                      <span className="font-mono tabular-nums text-[#F8FAFC]">{exportProgress}%</span>
                    </div>
                    <div className="h-2 bg-[#09090D] rounded overflow-hidden">
                      <div
                        className="h-full bg-[#8B5CF6] transition-all"
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
                  onClick={() => void handleExport()}
                >
                  {exportProgress != null && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Render & Download
                </StudioButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
