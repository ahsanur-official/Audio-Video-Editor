import { AudioWaveform, Download, Film, Image as ImageIcon, Loader2, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { STUDIO_EASE, TabContentTransition } from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import { enhanceAndNormalizeAudio } from '../engines/audioAnalysis';
import {
  concatAudioBuffers,
  decodeAudioFile,
  encodeAudioBufferToMp3,
  encodeAudioBufferToWav,
  getAudioContext,
  resampleAudioBuffer,
  sliceAudioBuffer,
} from '../engines/audioEngine';
import { formatBytes, triggerBlobDownload } from '../engines/storageEngine';
import { extractVideoFrames, probeVideoFile } from '../engines/videoEngine';
import { useMixoraStore } from '../store/useMixoraStore';
import type { AudioBitDepth, AudioSampleRate, Mp3Bitrate } from '../types/mixora';

export function MediaToolsPage() {
  const pushToast = useMixoraStore((s) => s.pushToast);
  const capabilities = useMixoraStore((s) => s.capabilities);

  const [tab, setTab] = useState<'audio' | 'video' | 'image'>('audio');
  const [busy, setBusy] = useState(false);

  // Audio Utility State
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [audioBufs, setAudioBufs] = useState<AudioBuffer[]>([]);
  const [audioFormat, setAudioFormat] = useState<'wav' | 'mp3'>('mp3');
  const [audioBitrate, setAudioBitrate] = useState<Mp3Bitrate>(320);
  const [audioWavDepth, setAudioWavDepth] = useState<AudioBitDepth>(24);
  const [audioSampleRate, setAudioSampleRate] = useState<AudioSampleRate>(44100);
  const [audioChannels, setAudioChannels] = useState<1 | 2>(2);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [normalizeAudio, setNormalizeAudio] = useState(false);

  // Video Utility State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [videoWidth, setVideoWidth] = useState(1280);
  const [videoFps, setVideoFps] = useState(30);
  const [videoBitrateMbps, setVideoBitrateMbps] = useState(6);
  const [videoThumb, setVideoThumb] = useState<string | null>(null);

  // Image Utility State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [imgW, setImgW] = useState(1280);
  const [imgH, setImgH] = useState(720);
  const [imgCropPct, setImgCropPct] = useState(100);
  const [imgFormat, setImgFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/webp');
  const [imgQuality, setImgQuality] = useState(0.9);
  const [thumbHeadline, setThumbHeadline] = useState('');
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const handleLoadAudioUtilityFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const list = Array.from(files);
      const decoded: AudioBuffer[] = [];
      for (const f of list) {
        decoded.push(await decodeAudioFile(f));
      }
      setAudioFiles(list);
      setAudioBufs(decoded);
      setTrimStart(0);
      setTrimEnd(Number(decoded[0].duration.toFixed(2)));
      pushToast({ type: 'success', title: `Loaded ${list.length} audio file(s)` });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Audio load error',
        detail: err instanceof Error ? err.message : 'Unable to decode file.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleProcessAudioUtility = async () => {
    if (audioBufs.length === 0) return;
    setBusy(true);
    trackAnonymousEvent({ eventType: 'export_attempt', feature: 'media_tools', format: audioFormat });
    try {
      let working =
        audioBufs.length > 1
          ? concatAudioBuffers(audioBufs)
          : sliceAudioBuffer(audioBufs[0], trimStart, trimEnd || audioBufs[0].duration);

      if (normalizeAudio) {
        working = await enhanceAndNormalizeAudio(working, { targetPeakDb: -1.0, clarityBoost: false });
      }

      const targetRate = audioFormat === 'mp3' ? Math.min(48000, audioSampleRate) : audioSampleRate;
      working = await resampleAudioBuffer(working, targetRate, audioChannels);

      const blob =
        audioFormat === 'wav'
          ? encodeAudioBufferToWav(working, audioWavDepth)
          : await encodeAudioBufferToMp3(working, audioBitrate);

      const base = audioFiles[0].name.replace(/\.[^.]+$/, '');
      const qualityTag =
        audioFormat === 'wav'
          ? `${audioWavDepth}bit_${targetRate / 1000}kHz`
          : `${audioBitrate}kbps`;
      const suffix = audioBufs.length > 1 ? '_merged' : normalizeAudio ? '_normalized' : '';
      triggerBlobDownload(blob, `${base}${suffix}_${qualityTag}.${audioFormat}`);
      trackAnonymousEvent({
        eventType: 'export_success',
        feature: 'media_tools',
        status: 'success',
        format: audioFormat,
      });
      pushToast({
        type: 'success',
        title: `Downloaded ${base}${suffix}_${qualityTag}.${audioFormat}`,
      });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Processing failed',
        detail: err instanceof Error ? err.message : 'Audio encoding error.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleLoadVideoUtility = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const meta = await probeVideoFile(file);
      URL.revokeObjectURL(meta.objectUrl);
      setVideoFile(file);
      setVideoMeta({ duration: meta.duration, width: meta.width, height: meta.height });
      setVideoWidth(Math.min(1280, meta.width));
      const frames = await extractVideoFrames(file, 1);
      setVideoThumb(frames[0]?.dataUrl ?? null);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Video load error',
        detail: err instanceof Error ? err.message : 'Unsupported video.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleVideoToAudio = async (fmt: 'wav' | 'mp3') => {
    if (!videoFile) return;
    setBusy(true);
    try {
      const ab = await videoFile.arrayBuffer();
      const decoded = await getAudioContext().decodeAudioData(ab.slice(0));
      const blob = fmt === 'wav' ? encodeAudioBufferToWav(decoded, 16) : await encodeAudioBufferToMp3(decoded, 192);
      triggerBlobDownload(blob, `${videoFile.name.replace(/\.[^.]+$/, '')}.${fmt}`);
      pushToast({ type: 'success', title: `Converted video to .${fmt}` });
    } catch {
      pushToast({
        type: 'error',
        title: 'Could not extract audio',
        detail: 'Video may lack an audio track or use a codec unsupported by Web Audio.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTranscodeResizeVideo = async () => {
    if (!videoFile || !videoMeta) return;
    const supported = capabilities?.supportedVideoExports[0];
    if (!supported) {
      pushToast({ type: 'error', title: 'Browser MediaRecorder video export unavailable' });
      return;
    }
    setBusy(true);
    try {
      const url = URL.createObjectURL(videoFile);
      const vid = document.createElement('video');
      vid.src = url;
      vid.muted = true;
      await new Promise<void>((res) => {
        vid.onloadeddata = () => res();
      });

      const outW = Math.max(320, Math.round(videoWidth / 2) * 2);
      const outH = Math.max(240, Math.round(((outW / videoMeta.width) * videoMeta.height) / 2) * 2);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d')!;

      const stream = canvas.captureStream(videoFps);
      const rec = new MediaRecorder(stream, {
        mimeType: supported.mimeType,
        videoBitsPerSecond: videoBitrateMbps * 1_000_000,
      });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      const done = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: supported.mimeType }));
      });

      rec.start();
      await vid.play();
      const frameDelay = Math.max(15, Math.round(1000 / videoFps));
      while (!vid.ended && vid.currentTime < Math.min(videoMeta.duration, 25)) {
        ctx.drawImage(vid, 0, 0, outW, outH);
        await new Promise((r) => setTimeout(r, frameDelay));
      }
      vid.pause();
      rec.stop();
      const blob = await done;
      URL.revokeObjectURL(url);
      triggerBlobDownload(
        blob,
        `${videoFile.name.replace(/\.[^.]+$/, '')}_${outW}x${outH}_${videoFps}fps_${videoBitrateMbps}M.${supported.ext}`
      );
      pushToast({
        type: 'success',
        title: `Exported ${outW}×${outH} · ${videoFps}fps · ${videoBitrateMbps} Mbps video`,
      });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Video conversion failed',
        detail: err instanceof Error ? err.message : 'Encoding error.',
      });
    } finally {
      setBusy(false);
    }
  };

  const renderImagePreview = (
    img: HTMLImageElement,
    w: number,
    h: number,
    cropPct: number,
    headline: string
  ) => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(64, Math.min(3840, w));
    canvas.height = Math.max(64, Math.min(2160, h));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#09090D';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const frac = cropPct / 100;
    const sw = img.naturalWidth * frac;
    const sh = img.naturalHeight * frac;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    if (headline.trim()) {
      ctx.fillStyle = 'rgba(9, 9, 13, 0.58)';
      ctx.fillRect(0, canvas.height - 96, canvas.width, 96);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = `700 ${Math.round(canvas.height * 0.065)}px "Outfit", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(headline, canvas.width / 2, canvas.height - 48);
    }
  };

  const handleLoadImage = (file?: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageFile(file);
      setImageEl(img);
      setImgW(img.naturalWidth);
      setImgH(img.naturalHeight);
      setImgCropPct(100);
      setTimeout(() => renderImagePreview(img, img.naturalWidth, img.naturalHeight, 100, thumbHeadline), 10);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      pushToast({ type: 'error', title: 'Unsupported or corrupted image file' });
    };
    img.src = url;
  };

  const handleDownloadImage = () => {
    const canvas = imageCanvasRef.current;
    if (!canvas || !imageEl) return;
    renderImagePreview(imageEl, imgW, imgH, imgCropPct, thumbHeadline);
    const ext = imgFormat === 'image/png' ? 'png' : imgFormat === 'image/jpeg' ? 'jpg' : 'webp';
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const base = imageFile?.name.replace(/\.[^.]+$/, '') || 'mixora_image';
          triggerBlobDownload(blob, `${base}_${imgW}x${imgH}.${ext}`);
          trackAnonymousEvent({ eventType: 'export_success', feature: 'media_tools', status: 'success', format: ext === 'jpg' ? 'jpeg' : ext });
          pushToast({ type: 'success', title: `Exported ${base}_${imgW}x${imgH}.${ext}` });
        }
      },
      imgFormat,
      imgQuality
    );
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#292938] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]">
            Media Utilities
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Fast local converters, trimmers, mergers, normalizers, and image thumbnail creators.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#14141D] p-1 rounded-md border border-[#292938] self-start">
          {[
            { id: 'audio' as const, label: 'Audio', icon: AudioWaveform },
            { id: 'video' as const, label: 'Video', icon: Film },
            { id: 'image' as const, label: 'Image', icon: ImageIcon },
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
                    layoutId="media-tools-tab-bg"
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

      <TabContentTransition tabKey={tab}>
      {tab === 'audio' && (
        <div className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
                Audio Converter, Trimmer, Merger & Normalizer
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Select 1 file to trim/convert/normalize, or select multiple files to merge them sequentially.
              </p>
            </div>
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*"
              multiple
              onChange={(e) => void handleLoadAudioUtilityFiles(e.target.files)}
              className="hidden"
            />
            <StudioButton
              variant="primary"
              size="sm"
              onClick={() => audioInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              Select Audio File(s)
            </StudioButton>
          </div>

          {audioFiles.length > 0 && audioBufs.length > 0 && (
            <div className="space-y-5">
              {/* Metadata table */}
              <div className="bg-[#09090D] border border-[#292938] rounded-lg divide-y divide-[#292938] text-xs">
                {audioFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="px-4 py-2.5 flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-[#F8FAFC]">{f.name}</span>
                    <span className="font-mono tabular-nums text-[#94A3B8]">
                      {audioBufs[idx]?.duration.toFixed(2)}s · {(audioBufs[idx]?.sampleRate ?? 44100) / 1000} kHz ·{' '}
                      {audioBufs[idx]?.numberOfChannels}ch · {formatBytes(f.size)}
                    </span>
                  </div>
                ))}
              </div>

              {audioBufs.length === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Trim Start</span>
                      <span className="font-mono">{trimStart.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.1, trimEnd - 0.1)}
                      step={0.1}
                      value={trimStart}
                      onChange={(e) => setTrimStart(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Trim End</span>
                      <span className="font-mono">{trimEnd.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={trimStart + 0.1}
                      max={audioBufs[0].duration}
                      step={0.1}
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end text-xs">
                <div className="space-y-1">
                  <label className="text-[#94A3B8]">Output Format</label>
                  <select
                    value={audioFormat}
                    onChange={(e) => setAudioFormat(e.target.value as 'wav' | 'mp3')}
                    className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-[#F8FAFC]"
                  >
                    <option value="mp3">MP3 (64–320 kbps)</option>
                    <option value="wav">WAV (Lossless PCM/Float)</option>
                  </select>
                </div>

                {audioFormat === 'mp3' ? (
                  <div className="space-y-1">
                    <label className="text-[#94A3B8]">MP3 Bitrate</label>
                    <select
                      value={audioBitrate}
                      onChange={(e) => setAudioBitrate(Number(e.target.value) as Mp3Bitrate)}
                      className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-[#F8FAFC]"
                    >
                      <option value={64}>64 kbps (Voice Light)</option>
                      <option value={96}>96 kbps (Compact)</option>
                      <option value={128}>128 kbps (Standard)</option>
                      <option value={192}>192 kbps (Good)</option>
                      <option value={256}>256 kbps (High)</option>
                      <option value={320}>320 kbps (Studio Max)</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[#94A3B8]">WAV Bit Depth</label>
                    <select
                      value={audioWavDepth}
                      onChange={(e) => setAudioWavDepth(Number(e.target.value) as AudioBitDepth)}
                      className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-[#F8FAFC]"
                    >
                      <option value={16}>16-bit PCM (CD)</option>
                      <option value={24}>24-bit PCM (Studio)</option>
                      <option value={32}>32-bit IEEE Float</option>
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[#94A3B8]">Sample Rate</label>
                  <select
                    value={audioSampleRate}
                    onChange={(e) => setAudioSampleRate(Number(e.target.value) as AudioSampleRate)}
                    className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-[#F8FAFC]"
                  >
                    <option value={22050}>22.05 kHz</option>
                    <option value={44100}>44.1 kHz (CD)</option>
                    <option value={48000}>48 kHz (Broadcast)</option>
                    {audioFormat === 'wav' && <option value={96000}>96 kHz (Hi-Res)</option>}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[#94A3B8]">Channels</label>
                  <select
                    value={audioChannels}
                    onChange={(e) => setAudioChannels(Number(e.target.value) as 1 | 2)}
                    className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-[#F8FAFC]"
                  >
                    <option value={2}>Stereo (2 ch)</option>
                    <option value={1}>Mono (1 ch)</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#F8FAFC] cursor-pointer">
                <input
                  type="checkbox"
                  checked={normalizeAudio}
                  onChange={(e) => setNormalizeAudio(e.target.checked)}
                  className="accent-[#8B5CF6] w-4 h-4"
                />
                Normalize volume (-1 dBFS)
              </label>

              <StudioButton
                variant="audio"
                size="sm"
                disabled={busy}
                onClick={() => void handleProcessAudioUtility()}
                className="px-5 py-2.5"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {audioBufs.length > 1 ? 'Merge & Download' : 'Convert & Download'}
              </StudioButton>
            </div>
          )}
        </div>
      )}

      {tab === 'video' && (
        <div className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
                Video Resizer, Converter, Audio Extractor & Thumbnail Tool
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                All transcoding runs locally using browser-native codecs.
              </p>
            </div>
            <input
              ref={videoInputRef}
              type="file"
              accept=".mp4,.webm,.mov,video/*"
              onChange={(e) => void handleLoadVideoUtility(e.target.files?.[0])}
              className="hidden"
            />
            <StudioButton
              variant="primary"
              size="sm"
              onClick={() => videoInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              Select Video File
            </StudioButton>
          </div>

          {videoFile && videoMeta && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-3">
                {videoThumb && (
                  <img
                    src={videoThumb}
                    alt="Video thumbnail preview"
                    className="w-full aspect-video object-cover rounded-lg border border-[#292938]"
                  />
                )}
                <p className="text-xs font-mono text-[#94A3B8]">
                  {videoFile.name} · {videoMeta.width}×{videoMeta.height} · {videoMeta.duration.toFixed(1)}s ·{' '}
                  {formatBytes(videoFile.size)}
                </p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="space-y-2">
                  <span className="text-[#94A3B8]">Quick Resolution Presets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '360p', w: 640 },
                      { label: '480p', w: 854 },
                      { label: '720p HD', w: 1280 },
                      { label: '1080p FHD', w: 1920 },
                      { label: 'Source', w: videoMeta.width },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setVideoWidth(Math.min(2560, preset.w))}
                        className={`px-2.5 py-1 rounded border text-[11px] font-medium ${
                          videoWidth === Math.min(2560, preset.w)
                            ? 'studio-nav-bar-glow border-[#8B5CF6] text-[#F8FAFC]'
                            : 'bg-[#09090D] border-[#292938] text-[#94A3B8]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Custom Output Width</span>
                    <span className="font-mono text-[#F8FAFC]">{videoWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={320}
                    max={Math.min(2560, Math.max(1920, videoMeta.width))}
                    step={20}
                    value={videoWidth}
                    onChange={(e) => setVideoWidth(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[#94A3B8]">Frame Rate</label>
                    <select
                      value={videoFps}
                      onChange={(e) => setVideoFps(Number(e.target.value))}
                      className="w-full bg-[#09090D] border border-[#292938] rounded-md px-2.5 py-2 text-[#F8FAFC]"
                    >
                      <option value={24}>24 fps</option>
                      <option value={30}>30 fps</option>
                      <option value={60}>60 fps</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[#94A3B8]">Bitrate Quality</label>
                    <select
                      value={videoBitrateMbps}
                      onChange={(e) => setVideoBitrateMbps(Number(e.target.value))}
                      className="w-full bg-[#09090D] border border-[#292938] rounded-md px-2.5 py-2 text-[#F8FAFC]"
                    >
                      <option value={1.5}>Light (1.5 Mbps)</option>
                      <option value={4}>Standard (4 Mbps)</option>
                      <option value={6}>High (6 Mbps)</option>
                      <option value={12}>Studio (12 Mbps)</option>
                      <option value={20}>Master (20 Mbps)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StudioButton
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleTranscodeResizeVideo()}
                  >
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Resize & Convert Video
                  </StudioButton>
                  <StudioButton
                    variant="audio"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleVideoToAudio('mp3')}
                  >
                    Video → MP3
                  </StudioButton>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleVideoToAudio('wav')}
                    className="px-4 py-2 rounded-md bg-[#1B1B27] border border-[#292938] text-[#F8FAFC] disabled:opacity-40"
                  >
                    Video → WAV
                  </button>
                  {videoThumb && (
                    <a
                      href={videoThumb}
                      download={`${videoFile.name.replace(/\.[^.]+$/, '')}_thumb.png`}
                      className="px-4 py-2 rounded-md bg-[#1B1B27] border border-[#292938] text-[#F8FAFC]"
                    >
                      Save Thumbnail PNG
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'image' && (
        <div className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
                Image Resizer, Cropper, Format Converter & Thumbnail Creator
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Resize, crop, add a thumbnail headline banner, and convert between PNG, JPEG, and WebP.
              </p>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleLoadImage(e.target.files?.[0])}
              className="hidden"
            />
            <StudioButton
              variant="primary"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              Select Image
            </StudioButton>
          </div>

          {imageEl && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-[#09090D] border border-[#292938] rounded-lg p-3 flex items-center justify-center">
                <canvas ref={imageCanvasRef} className="max-w-full max-h-[360px] object-contain rounded" />
              </div>

              <div className="lg:col-span-5 space-y-4 text-xs">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImgW(1280);
                      setImgH(720);
                      renderImagePreview(imageEl, 1280, 720, imgCropPct, thumbHeadline);
                    }}
                    className="px-2.5 py-1 rounded bg-[#1B1B27] border border-[#292938] text-[#F8FAFC]"
                  >
                    1280×720 Thumbnail
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImgW(1080);
                      setImgH(1080);
                      renderImagePreview(imageEl, 1080, 1080, imgCropPct, thumbHeadline);
                    }}
                    className="px-2.5 py-1 rounded bg-[#1B1B27] border border-[#292938] text-[#F8FAFC]"
                  >
                    1080×1080 Square
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[#94A3B8]">Width (px)</span>
                    <input
                      type="number"
                      min={64}
                      max={3840}
                      value={imgW}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setImgW(v);
                        renderImagePreview(imageEl, v, imgH, imgCropPct, thumbHeadline);
                      }}
                      className="w-full bg-[#09090D] border border-[#292938] rounded px-2.5 py-1.5 font-mono text-[#F8FAFC]"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#94A3B8]">Height (px)</span>
                    <input
                      type="number"
                      min={64}
                      max={2160}
                      value={imgH}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setImgH(v);
                        renderImagePreview(imageEl, imgW, v, imgCropPct, thumbHeadline);
                      }}
                      className="w-full bg-[#09090D] border border-[#292938] rounded px-2.5 py-1.5 font-mono text-[#F8FAFC]"
                    />
                  </label>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Center Crop Zoom</span>
                    <span className="font-mono">{imgCropPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    value={imgCropPct}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setImgCropPct(v);
                      renderImagePreview(imageEl, imgW, imgH, v, thumbHeadline);
                    }}
                    className="w-full"
                  />
                </div>

                <label className="block space-y-1">
                  <span className="text-[#94A3B8]">Optional Thumbnail Headline Banner</span>
                  <input
                    type="text"
                    value={thumbHeadline}
                    placeholder="e.g. Episode 04 — Studio Mix"
                    onChange={(e) => {
                      setThumbHeadline(e.target.value);
                      renderImagePreview(imageEl, imgW, imgH, imgCropPct, e.target.value);
                    }}
                    className="w-full bg-[#09090D] border border-[#292938] rounded px-2.5 py-1.5 text-[#F8FAFC]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[#94A3B8]">Format</span>
                    <select
                      value={imgFormat}
                      onChange={(e) => setImgFormat(e.target.value as 'image/png' | 'image/jpeg' | 'image/webp')}
                      className="w-full bg-[#09090D] border border-[#292938] rounded px-2.5 py-1.5 text-[#F8FAFC]"
                    >
                      <option value="image/webp">WebP</option>
                      <option value="image/png">PNG</option>
                      <option value="image/jpeg">JPEG</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#94A3B8]">Quality ({Math.round(imgQuality * 100)}%)</span>
                    <input
                      type="range"
                      min={0.3}
                      max={1}
                      step={0.05}
                      value={imgQuality}
                      onChange={(e) => setImgQuality(Number(e.target.value))}
                      className="w-full mt-2"
                    />
                  </label>
                </div>

                <StudioButton
                  variant="audio"
                  size="sm"
                  onClick={handleDownloadImage}
                  className="w-full py-2.5"
                >
                  <Download className="w-4 h-4" />
                  Export Image
                </StudioButton>
              </div>
            </div>
          )}
        </div>
      )}
      </TabContentTransition>
    </div>
  );
}
