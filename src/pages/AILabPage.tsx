import {
  AlertCircle,
  AudioWaveform,
  Cpu,
  Download,
  Film,
  Loader2,
  Play,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import {
  ScrollReveal,
  STUDIO_EASE,
  StaggerGroup,
  StaggerItem,
  TabContentTransition,
} from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import { WaveformCanvas } from '../components/WaveformCanvas';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import {
  analyzeAudioBuffer,
  enhanceAndNormalizeAudio,
  separateMidSideVocals,
  splitFourBandStems,
  type AudioAnalysisResult,
} from '../engines/audioAnalysis';
import {
  decodeAudioFile,
  encodeAudioBufferToWav,
  extractWaveformPeaks,
  generateProceduralDemoTrack,
  getAudioContext,
} from '../engines/audioEngine';
import { formatBytes, triggerBlobDownload } from '../engines/storageEngine';
import { extractVideoFrames, probeVideoFile } from '../engines/videoEngine';
import { useMixoraStore } from '../store/useMixoraStore';

export function AILabPage() {
  const capabilities = useMixoraStore((s) => s.capabilities);
  const pushToast = useMixoraStore((s) => s.pushToast);

  const [tab, setTab] = useState<'audio' | 'video'>('audio');

  // Audio AI/DSP State
  const [audioFileName, setAudioFileName] = useState('');
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [analysis, setAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const [stems, setStems] = useState<{ label: string; buffer: AudioBuffer }[]>([]);
  const [playingStemIdx, setPlayingStemIdx] = useState<number | null>(null);

  // Video AI/DSP State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<{ duration: number; width: number; height: number; size: number } | null>(null);
  const [frames, setFrames] = useState<{ time: number; dataUrl: string; blob: Blob }[]>([]);
  const [srtDraft, setSrtDraft] = useState('1\n00:00:00,000 --> 00:00:03,500\nEnter your caption line here.\n');

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopStemPreview = () => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
      } catch {
        // ignore
      }
      previewSourceRef.current = null;
    }
    setPlayingStemIdx(null);
  };

  useEffect(() => () => stopStemPreview(), []);

  const loadAudioBuffer = async (name: string, buf: AudioBuffer) => {
    stopStemPreview();
    setAudioFileName(name);
    setAudioBuffer(buf);
    setPeaks(extractWaveformPeaks(buf, 540));
    setStems([]);
    setProcessingLabel('Analyzing BPM, beat positions, musical key, and loudness...');
    try {
      const res = await analyzeAudioBuffer(buf);
      setAnalysis(res);
      trackAnonymousEvent({ eventType: 'ai_feature_used', feature: 'ai_lab', effect: 'bpm_detect' });
      trackAnonymousEvent({ eventType: 'ai_feature_used', feature: 'ai_lab', effect: 'key_detect' });
    } finally {
      setProcessingLabel(null);
    }
  };

  const handleAudioUpload = async (file?: File) => {
    if (!file) return;
    try {
      const buf = await decodeAudioFile(file);
      await loadAudioBuffer(file.name, buf);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Audio load error',
        detail: err instanceof Error ? err.message : 'Unable to decode audio.',
      });
    }
  };

  const runVocalSeparation = async () => {
    if (!audioBuffer) return;
    setProcessingLabel('Running local Mid/Side stereo vocal & instrumental separation...');
    trackAnonymousEvent({ eventType: 'ai_feature_used', feature: 'ai_lab', effect: 'vocal_split' });
    try {
      const [vocals, instrumental] = await Promise.all([
        separateMidSideVocals(audioBuffer, 'vocals'),
        separateMidSideVocals(audioBuffer, 'instrumental'),
      ]);
      setStems([
        { label: 'Isolated Center / Vocals (DSP)', buffer: vocals },
        { label: 'Stereo Instrumental / Karaoke (DSP)', buffer: instrumental },
      ]);
      pushToast({ type: 'success', title: 'Vocal & instrumental stems ready' });
    } finally {
      setProcessingLabel(null);
    }
  };

  const runFourStemSplit = async () => {
    if (!audioBuffer) return;
    setProcessingLabel('Running 4-band Linkwitz-Riley & stereo crossover separation...');
    trackAnonymousEvent({ eventType: 'ai_feature_used', feature: 'ai_lab', effect: 'stem_split' });
    try {
      const res = await splitFourBandStems(audioBuffer);
      setStems([
        { label: 'Bass / Sub (<240 Hz)', buffer: res.bass },
        { label: 'Mid / Center Vocals', buffer: res.vocalsMid },
        { label: 'Highs / Percussion (>4.2 kHz)', buffer: res.highsPercussion },
        { label: 'Stereo Side / Ambience', buffer: res.ambienceSide },
      ]);
      pushToast({ type: 'success', title: '4-band frequency stems ready' });
    } finally {
      setProcessingLabel(null);
    }
  };

  const runEnhanceAndDenoise = async (denoise: boolean) => {
    if (!audioBuffer) return;
    setProcessingLabel(
      denoise ? 'Applying noise gate & spectral rumble cleanup...' : 'Enhancing clarity, dynamics & peak loudness...'
    );
    trackAnonymousEvent({ eventType: 'ai_feature_used', feature: 'ai_lab', effect: 'audio_enhance' });
    try {
      const out = await enhanceAndNormalizeAudio(audioBuffer, {
        targetPeakDb: -1.0,
        noiseGateThresholdDb: denoise ? -38 : undefined,
        clarityBoost: !denoise,
      });
      setStems([
        { label: denoise ? 'Noise-Reduced Output' : 'Enhanced & Normalized Master', buffer: out },
      ]);
      pushToast({ type: 'success', title: denoise ? 'Noise reduction complete' : 'Audio enhancement complete' });
    } finally {
      setProcessingLabel(null);
    }
  };

  const togglePlayStem = (idx: number, buffer: AudioBuffer) => {
    if (playingStemIdx === idx) {
      stopStemPreview();
      return;
    }
    stopStemPreview();
    const ctx = getAudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => setPlayingStemIdx(null);
    src.start(0);
    previewSourceRef.current = src;
    setPlayingStemIdx(idx);
  };

  const handleVideoUpload = async (file?: File) => {
    if (!file) return;
    setProcessingLabel('Inspecting video metadata...');
    try {
      const meta = await probeVideoFile(file);
      URL.revokeObjectURL(meta.objectUrl);
      setVideoFile(file);
      setVideoMeta({ duration: meta.duration, width: meta.width, height: meta.height, size: file.size });
      setFrames([]);
      pushToast({ type: 'success', title: `Loaded "${file.name}"` });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Video analysis error',
        detail: err instanceof Error ? err.message : 'Unable to probe video.',
      });
    } finally {
      setProcessingLabel(null);
    }
  };

  const runExtractFrames = async (count: number) => {
    if (!videoFile) return;
    setProcessingLabel(`Extracting ${count} high-resolution frames locally...`);
    trackAnonymousEvent({ eventType: 'ai_feature_used', feature: 'ai_lab', effect: 'frame_extract' });
    try {
      const extracted = await extractVideoFrames(videoFile, count);
      setFrames(extracted);
      pushToast({ type: 'success', title: `Extracted ${extracted.length} frames` });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Frame extraction failed',
        detail: err instanceof Error ? err.message : 'Decode error.',
      });
    } finally {
      setProcessingLabel(null);
    }
  };

  const runExtractVideoAudio = async () => {
    if (!videoFile) return;
    setProcessingLabel('Decoding audio track from video locally...');
    try {
      const ab = await videoFile.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(ab.slice(0));
      const wav = encodeAudioBufferToWav(decoded, 16);
      triggerBlobDownload(wav, `${videoFile.name.replace(/\.[^.]+$/, '')}-audio.wav`);
      pushToast({ type: 'success', title: 'Extracted audio track as WAV' });
    } catch {
      pushToast({
        type: 'error',
        title: 'Audio extraction unavailable for this video codec',
        detail: 'Try an MP4 (AAC) or WebM (Opus/Vorbis) file with an audio track.',
      });
    } finally {
      setProcessingLabel(null);
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#292938] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]">
            Local AI & DSP Lab
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Client-side signal analysis, stem splitting, enhancement, and video frame tools with zero
            cloud uploads.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#14141D] p-1 rounded-md border border-[#292938] self-start">
          {[
            { id: 'audio' as const, label: 'Audio Lab', icon: AudioWaveform },
            { id: 'video' as const, label: 'Video Lab', icon: Film },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  active ? 'text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="ai-lab-tab-bg"
                    transition={{ duration: 0.22, ease: STUDIO_EASE }}
                    className="absolute inset-0 rounded bg-[#8B5CF6]"
                  />
                )}
                <Icon className="relative z-10 w-3.5 h-3.5" />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Device Capability Bar */}
      <div className="bg-[#14141D] border border-[#292938] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#94A3B8]">
        <div className="flex items-center gap-2 text-[#F8FAFC]">
          <Cpu className="w-4 h-4 text-[#22D3EE]" />
          <span>Local Compute Profile</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
          <span>CPU Cores: {capabilities?.hardwareConcurrency ?? 4}</span>
          <span>
            RAM Hint: {capabilities?.deviceMemoryGB ? `${capabilities.deviceMemoryGB} GB` : 'Standard'}
          </span>
          <span>Model Download Required: 0 MB (Pure Web Audio DSP)</span>
        </div>
      </div>

      {processingLabel && (
        <div className="bg-[#14141D] border border-[#8B5CF6]/50 rounded-lg px-4 py-3 flex items-center gap-3 text-xs text-[#F8FAFC]">
          <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6] shrink-0" />
          <span>{processingLabel}</span>
        </div>
      )}

      <TabContentTransition tabKey={tab}>
      {tab === 'audio' ? (
        <div className="space-y-6">
          {/* Audio Input */}
          <div className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F8FAFC]">
                  Source Audio {audioFileName ? `— ${audioFileName}` : ''}
                </h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Upload any local audio file to run BPM, key, beat, stem, and enhancement tools.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={audioInputRef}
                  type="file"
                  accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*"
                  onChange={(e) => void handleAudioUpload(e.target.files?.[0])}
                  className="hidden"
                />
                <StudioButton
                  variant="primary"
                  size="sm"
                  onClick={() => audioInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload Audio
                </StudioButton>
                <button
                  type="button"
                  onClick={async () => {
                    const demo = await generateProceduralDemoTrack('electronic_124');
                    await loadAudioBuffer(demo.name, demo.buffer);
                  }}
                  className="px-3.5 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#22D3EE]"
                >
                  Analyze Demo Track
                </button>
              </div>
            </div>

            {audioBuffer && (
              <WaveformCanvas
                peaks={peaks}
                duration={audioBuffer.duration}
                beatPositions={analysis?.beatPositions ?? []}
                color="#22D3EE"
                height={80}
              />
            )}

            {analysis && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">BPM</p>
                  <p className="font-mono tabular-nums text-lg font-bold text-[#F8FAFC]">{analysis.bpm}</p>
                  <p className="text-[10px] text-[#94A3B8] font-mono">
                    Conf {Math.round(analysis.bpmConfidence * 100)}%
                  </p>
                </div>
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">Musical Key</p>
                  <p className="font-mono text-sm font-bold text-[#22D3EE] mt-0.5">{analysis.key}</p>
                  <p className="text-[10px] text-[#94A3B8] font-mono">Camelot {analysis.camelot}</p>
                </div>
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">Beats Detected</p>
                  <p className="font-mono tabular-nums text-lg font-bold text-[#F8FAFC]">
                    {analysis.beatPositions.length}
                  </p>
                </div>
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">RMS Loudness</p>
                  <p className="font-mono tabular-nums text-lg font-bold text-[#F8FAFC]">
                    {analysis.rmsDb} dB
                  </p>
                </div>
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">Peak Level</p>
                  <p className="font-mono tabular-nums text-lg font-bold text-[#F8FAFC]">
                    {analysis.peakDb} dB
                  </p>
                </div>
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">Dynamic Range</p>
                  <p className="font-mono tabular-nums text-lg font-bold text-[#A3E635]">
                    {analysis.dynamicRangeDb} dB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* DSP Processing Tools */}
          <StaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StaggerItem className="bg-[#14141D] border border-[#292938] rounded-lg p-5 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#F8FAFC]">Vocal / Instrumental Split</h3>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Local Mid/Side stereo phase cancellation to extract center vocals and karaoke backing.
                </p>
              </div>
              <button
                type="button"
                disabled={!audioBuffer || processingLabel != null}
                onClick={() => void runVocalSeparation()}
                className="w-full py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] disabled:opacity-40 transition-colors"
              >
                Split Vocals & Backing
              </button>
            </StaggerItem>

            <StaggerItem className="bg-[#14141D] border border-[#292938] rounded-lg p-5 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#F8FAFC]">4-Band Stem Separation</h3>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Cascaded crossover filters separating Bass, Center Vocals, High Percussion, and Side Ambience.
                </p>
              </div>
              <button
                type="button"
                disabled={!audioBuffer || processingLabel != null}
                onClick={() => void runFourStemSplit()}
                className="w-full py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] disabled:opacity-40 transition-colors"
              >
                Extract 4 Band Stems
              </button>
            </StaggerItem>

            <StaggerItem className="bg-[#14141D] border border-[#292938] rounded-lg p-5 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#F8FAFC]">Noise Reduction</h3>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Dynamic noise gate + sub-55Hz rumble high-pass filter for cleaner voice & acoustic takes.
                </p>
              </div>
              <button
                type="button"
                disabled={!audioBuffer || processingLabel != null}
                onClick={() => void runEnhanceAndDenoise(true)}
                className="w-full py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] disabled:opacity-40 transition-colors"
              >
                Reduce Background Noise
              </button>
            </StaggerItem>

            <StaggerItem className="bg-[#14141D] border border-[#292938] rounded-lg p-5 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#F8FAFC]">Audio Enhancement</h3>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Presence EQ, smooth dynamics compression, and -1.0 dBFS peak loudness normalization.
                </p>
              </div>
              <StudioButton
                variant="primary"
                size="sm"
                disabled={!audioBuffer || processingLabel != null}
                onClick={() => void runEnhanceAndDenoise(false)}
                className="w-full"
              >
                Enhance & Master
              </StudioButton>
            </StaggerItem>
          </StaggerGroup>

          {/* Processed Stems Output */}
          {stems.length > 0 && (
            <div className="bg-[#14141D] border border-[#292938] rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#A3E635]" />
                <h3 className="font-display text-base font-semibold text-[#F8FAFC]">
                  Processed Outputs (Ready to Preview & Download)
                </h3>
              </div>
              <div className="divide-y divide-[#292938]">
                {stems.map((st, idx) => (
                  <div key={st.label} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[#F8FAFC]">{st.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePlayStem(idx, st.buffer)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs text-[#F8FAFC]"
                      >
                        {playingStemIdx === idx ? (
                          <Square className="w-3 h-3 text-[#F43F5E]" />
                        ) : (
                          <Play className="w-3 h-3 text-[#22D3EE]" />
                        )}
                        {playingStemIdx === idx ? 'Stop' : 'Preview'}
                      </button>
                      <StudioButton
                        variant="audio"
                        size="xs"
                        onClick={() => {
                          const wav = encodeAudioBufferToWav(st.buffer, 16);
                          triggerBlobDownload(wav, `${st.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.wav`);
                        }}
                      >
                        <Download className="w-3 h-3" />
                        Download WAV
                      </StudioButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F8FAFC]">
                  Video Inspection & Extraction
                </h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Extract key frames, generate PNG thumbnails, inspect metadata, or strip audio.
                </p>
              </div>
              <input
                ref={videoInputRef}
                type="file"
                accept=".mp4,.webm,.mov,video/*"
                onChange={(e) => void handleVideoUpload(e.target.files?.[0])}
                className="hidden"
              />
              <StudioButton
                variant="primary"
                size="sm"
                onClick={() => videoInputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                Select Local Video
              </StudioButton>
            </div>

            {videoMeta && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">Resolution</p>
                  <p className="font-mono text-base font-semibold text-[#F8FAFC]">
                    {videoMeta.width} × {videoMeta.height}
                  </p>
                </div>
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">Duration</p>
                  <p className="font-mono tabular-nums text-base font-semibold text-[#22D3EE]">
                    {videoMeta.duration.toFixed(2)}s
                  </p>
                </div>
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">File Size</p>
                  <p className="font-mono tabular-nums text-base font-semibold text-[#F8FAFC]">
                    {formatBytes(videoMeta.size)}
                  </p>
                </div>
                <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3">
                  <p className="text-[11px] text-[#94A3B8]">Aspect Ratio</p>
                  <p className="font-mono text-base font-semibold text-[#F8FAFC]">
                    {(videoMeta.width / Math.max(1, videoMeta.height)).toFixed(2)}:1
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={!videoFile || processingLabel != null}
                onClick={() => void runExtractFrames(6)}
                className="px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] disabled:opacity-40"
              >
                Extract 6 Key Frames
              </button>
              <button
                type="button"
                disabled={!videoFile || processingLabel != null}
                onClick={() => void runExtractFrames(3)}
                className="px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#22D3EE] disabled:opacity-40"
              >
                Generate 3 Thumbnails
              </button>
              <button
                type="button"
                disabled={!videoFile || processingLabel != null}
                onClick={() => void runExtractVideoAudio()}
                className="px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] disabled:opacity-40"
              >
                Extract Audio Track (WAV)
              </button>
            </div>

            {frames.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-3">
                {frames.map((fr) => (
                  <div key={fr.time} className="bg-[#09090D] border border-[#292938] rounded-lg overflow-hidden">
                    <img
                      src={fr.dataUrl}
                      alt={`Extracted frame at ${fr.time}s`}
                      className="w-full aspect-video object-cover"
                    />
                    <div className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="font-mono text-[#94A3B8]">@{fr.time}s</span>
                      <button
                        type="button"
                        onClick={() => triggerBlobDownload(fr.blob, `frame_${fr.time}s.png`)}
                        className="text-[#22D3EE] hover:text-[#F8FAFC] font-medium"
                      >
                        Download PNG
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Honest Subtitle Generation Disclosure + Local SRT Editor */}
          <ScrollReveal className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-[#F8FAFC]">
                  Automatic Speech-to-Text Subtitles — Offline Model Unavailable
                </h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Automatic local transcription requires downloading a 75–150 MB Whisper WebAssembly
                  weight bundle and is not bundled in this lightweight deployment to protect privacy
                  and bandwidth. Rather than faking transcription, you can author and download a real
                  SRT subtitle file directly below.
                </p>
              </div>
            </div>

            <textarea
              rows={5}
              value={srtDraft}
              onChange={(e) => setSrtDraft(e.target.value)}
              className="w-full bg-[#09090D] border border-[#292938] rounded-lg p-3 font-mono text-xs text-[#F8FAFC]"
            />
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([srtDraft], { type: 'text/plain;charset=utf-8' });
                triggerBlobDownload(blob, 'mixora-subtitles.srt');
                pushToast({ type: 'success', title: 'Downloaded .srt subtitle file' });
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
            >
              <Download className="w-3.5 h-3.5 text-[#22D3EE]" />
              Export .SRT File
            </button>
          </ScrollReveal>
        </div>
      )}
      </TabContentTransition>
    </div>
  );
}
