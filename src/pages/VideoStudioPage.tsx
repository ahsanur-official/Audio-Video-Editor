import {
  AudioLines,
  Camera,
  Copy,
  Download,
  Film,
  Flag,
  FlipHorizontal,
  FlipVertical,
  FolderSync,
  Loader2,
  Maximize2,
  Palette,
  Pause,
  Play,
  Plus,
  RotateCw,
  Scissors,
  Sliders,
  Square,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ColorGradingPanel } from '../components/ColorGradingPanel';
import { ModalTransition, STUDIO_EASE, TabContentTransition } from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import {
  decodeAudioFile,
  encodeAudioBufferToWav,
  getAudioContext,
} from '../engines/audioEngine';
import { triggerBlobDownload } from '../engines/storageEngine';
import {
  applyColorGradingToCanvas,
  drawOverlaysAtTime,
  drawVideoClipFrame,
  generateSampleVideoFile,
  probeVideoFile,
} from '../engines/videoEngine';
import { useMixoraStore } from '../store/useMixoraStore';
import type { TransitionType, VideoClipModel, VideoOverlayModel } from '../types/mixora';

function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  const d = Math.floor((s * 10) % 10);
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}.${d}`;
}

export function VideoStudioPage() {
  const videoClips = useMixoraStore((s) => s.videoClips);
  const videoOverlays = useMixoraStore((s) => s.videoOverlays);
  const videoMarkers = useMixoraStore((s) => s.videoMarkers);
  const selectedClipId = useMixoraStore((s) => s.selectedVideoClipId);
  const colorGrading = useMixoraStore((s) => s.colorGrading);
  const capabilities = useMixoraStore((s) => s.capabilities);
  const projectName = useMixoraStore((s) => s.projectName);

  const addVideoClip = useMixoraStore((s) => s.addVideoClip);
  const updateVideoClip = useMixoraStore((s) => s.updateVideoClip);
  const removeVideoClip = useMixoraStore((s) => s.removeVideoClip);
  const setSelectedVideoClipId = useMixoraStore((s) => s.setSelectedVideoClipId);
  const addVideoOverlay = useMixoraStore((s) => s.addVideoOverlay);
  const updateVideoOverlay = useMixoraStore((s) => s.updateVideoOverlay);
  const removeVideoOverlay = useMixoraStore((s) => s.removeVideoOverlay);
  const addVideoMarker = useMixoraStore((s) => s.addVideoMarker);
  const removeVideoMarker = useMixoraStore((s) => s.removeVideoMarker);
  const pushToast = useMixoraStore((s) => s.pushToast);

  const [inspectorTab, setInspectorTab] = useState<'color' | 'clip' | 'overlay' | 'audio'>('color');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [compareSplit, setCompareSplit] = useState(false);
  const [snapGrid, setSnapGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);

  // Optional background music layer for video timeline & export
  const [bgAudio, setBgAudio] = useState<{ name: string; buffer: AudioBuffer; volume: number } | null>(null);

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMime, setExportMime] = useState('');
  const [exportRes, setExportRes] = useState<'480p' | '720p' | '1080p' | 'source'>('720p');
  const [exportFps, setExportFps] = useState(30);
  const [exportBitrateMbps, setExportBitrateMbps] = useState(5);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const relinkInputRef = useRef<HTMLInputElement | null>(null);
  const relinkClipIdRef = useRef<string | null>(null);
  const bgAudioInputRef = useRef<HTMLInputElement | null>(null);
  const bgAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const cancelExportRef = useRef(false);

  const selectedClip = videoClips.find((c) => c.id === selectedClipId) ?? videoClips[0] ?? null;

  useEffect(() => {
    if (!exportMime && capabilities?.supportedVideoExports.length) {
      setExportMime(capabilities.supportedVideoExports[0].mimeType);
    }
  }, [capabilities, exportMime]);

  // Synchronize hidden HTMLVideoElements with store clips
  useEffect(() => {
    const map = hiddenVideosRef.current;
    const validIds = new Set(videoClips.map((c) => c.id));
    for (const [id, vid] of map.entries()) {
      if (!validIds.has(id)) {
        vid.pause();
        vid.src = '';
        map.delete(id);
      }
    }
    for (const clip of videoClips) {
      if (!clip.objectUrl) continue;
      let vid = map.get(clip.id);
      if (!vid) {
        vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.src = clip.objectUrl;
        map.set(clip.id, vid);
      } else if (vid.src !== clip.objectUrl) {
        vid.src = clip.objectUrl;
      }
    }
  }, [videoClips]);

  const totalDuration = Math.max(
    4,
    ...videoClips.map((c) => c.startOffset + Math.max(0.2, (c.trimEnd - c.trimStart) / Math.max(0.25, c.speed)))
  );

  const findActiveClipAt = (timeSec: number): { clip: VideoClipModel; localTime: number } | null => {
    // Prefer higher track index if overlapping
    const sorted = [...videoClips].sort((a, b) => b.trackIndex - a.trackIndex);
    for (const clip of sorted) {
      const dur = Math.max(0.1, (clip.trimEnd - clip.trimStart) / Math.max(0.25, clip.speed));
      if (timeSec >= clip.startOffset && timeSec <= clip.startOffset + dur) {
        return { clip, localTime: timeSec - clip.startOffset };
      }
    }
    return null;
  };

  // Render a single preview frame to the Canvas2D
  const renderFrameAt = (timeSec: number, targetCanvas?: HTMLCanvasElement | null, splitCompare = compareSplit) => {
    const canvas = targetCanvas ?? previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#09090D';
    ctx.fillRect(0, 0, w, h);

    const active = findActiveClipAt(timeSec);
    if (active) {
      const vid = hiddenVideosRef.current.get(active.clip.id);
      if (vid && vid.readyState >= 2) {
        drawVideoClipFrame(ctx, vid, active.clip, active.localTime, w, h);
        applyColorGradingToCanvas(ctx, w, h, colorGrading, splitCompare ? 0.5 : undefined);
      }
    }

    drawOverlaysAtTime(ctx, videoOverlays, timeSec, w, h);

    // Draw Before/After split line in preview mode only
    if (splitCompare && !targetCanvas) {
      ctx.save();
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.fillStyle = 'rgba(9, 9, 13, 0.78)';
      ctx.fillRect(w / 2 - 68, 12, 58, 22);
      ctx.fillRect(w / 2 + 10, 12, 54, 22);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('BEFORE', w / 2 - 60, 27);
      ctx.fillText('AFTER', w / 2 + 18, 27);
      ctx.restore();
    }
  };

  // Seek videos & redraw whenever playhead or grading changes while paused
  useEffect(() => {
    if (isPlaying) return;
    const active = findActiveClipAt(playhead);
    if (active) {
      const vid = hiddenVideosRef.current.get(active.clip.id);
      if (vid) {
        const targetVidTime =
          active.clip.freezeFrameTime != null
            ? active.clip.freezeFrameTime
            : Math.min(
                active.clip.trimEnd,
                active.clip.trimStart + active.localTime * active.clip.speed
              );
        if (Math.abs(vid.currentTime - targetVidTime) > 0.04) {
          vid.onseeked = () => renderFrameAt(playhead);
          vid.currentTime = Math.max(0, targetVidTime);
        } else {
          renderFrameAt(playhead);
        }
        return;
      }
    }
    renderFrameAt(playhead);
  }, [playhead, videoClips, videoOverlays, colorGrading, compareSplit, isPlaying]);

  const stopBgAudio = () => {
    if (bgAudioSourceRef.current) {
      try {
        bgAudioSourceRef.current.stop();
      } catch {
        // ignore
      }
      bgAudioSourceRef.current = null;
    }
  };

  const pauseAllVideos = () => {
    for (const vid of hiddenVideosRef.current.values()) {
      vid.pause();
    }
    stopBgAudio();
    setIsPlaying(false);
  };

  useEffect(() => () => pauseAllVideos(), []);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;

    let raf = 0;
    let lastTs = performance.now();
    let currentT = playhead;

    // Start background music if loaded
    if (bgAudio) {
      const ctx = getAudioContext();
      const src = ctx.createBufferSource();
      src.buffer = bgAudio.buffer;
      const g = ctx.createGain();
      g.gain.value = bgAudio.volume;
      src.connect(g);
      g.connect(ctx.destination);
      src.start(0, Math.min(bgAudio.buffer.duration - 0.05, currentT % bgAudio.buffer.duration));
      bgAudioSourceRef.current = src;
    }

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      currentT += dt;

      if (currentT >= totalDuration) {
        pauseAllVideos();
        setPlayhead(0);
        return;
      }

      const active = findActiveClipAt(currentT);
      for (const [id, vid] of hiddenVideosRef.current.entries()) {
        if (active && active.clip.id === id) {
          vid.muted = active.clip.mute;
          vid.volume = Math.min(1, active.clip.volume);
          vid.playbackRate = Math.max(0.25, Math.min(3, active.clip.speed));

          const desired =
            active.clip.freezeFrameTime != null
              ? active.clip.freezeFrameTime
              : active.clip.trimStart + active.localTime * active.clip.speed;

          if (active.clip.freezeFrameTime != null) {
            vid.pause();
            if (Math.abs(vid.currentTime - desired) > 0.05) vid.currentTime = desired;
          } else {
            if (Math.abs(vid.currentTime - desired) > 0.22) {
              vid.currentTime = Math.max(0, Math.min(vid.duration || desired, desired));
            }
            if (vid.paused) void vid.play().catch(() => {});
          }
        } else if (!vid.paused) {
          vid.pause();
        }
      }

      renderFrameAt(currentT);
      setPlayhead(currentT);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      stopBgAudio();
    };
  }, [isPlaying]);

  const handleVideoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let nextOffset =
      videoClips.length > 0
        ? Math.max(...videoClips.map((c) => c.startOffset + (c.trimEnd - c.trimStart) / c.speed))
        : 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const meta = await probeVideoFile(file);
        const clip: VideoClipModel = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          startOffset: Number(nextOffset.toFixed(2)),
          trimStart: 0,
          trimEnd: meta.duration,
          trackIndex: 0,
          speed: 1,
          rotation: 0,
          flipH: false,
          flipV: false,
          cropX: 0,
          cropY: 0,
          cropW: 1,
          cropH: 1,
          volume: 1,
          mute: false,
          transitionIn: videoClips.length + i > 0 ? 'crossfade' : 'none',
          transitionDuration: 0.6,
          freezeFrameTime: null,
          objectUrl: meta.objectUrl,
          missingMedia: false,
        };
        addVideoClip(clip);
        nextOffset += meta.duration;
      } catch (err) {
        trackAnonymousEvent({
          eventType: 'processing_error',
          feature: 'video_studio',
          status: 'error',
          errorCategory: 'unsupported_format',
        });
        pushToast({
          type: 'error',
          title: 'Video import failed',
          detail: err instanceof Error ? err.message : 'Unable to decode video.',
        });
      }
    }
  };

  const handleGenerateSample = async () => {
    setIsGeneratingSample(true);
    try {
      const file = await generateSampleVideoFile();
      const dt = new DataTransfer();
      dt.items.add(file);
      await handleVideoFiles(dt.files);
      pushToast({ type: 'success', title: 'Generated 720p twilight test clip for editing & color grading' });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Sample clip creation failed',
        detail: err instanceof Error ? err.message : 'MediaRecorder unavailable.',
      });
    } finally {
      setIsGeneratingSample(false);
    }
  };

  const handleRelinkVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = relinkClipIdRef.current;
    if (!file || !id) return;
    try {
      const meta = await probeVideoFile(file);
      updateVideoClip(id, {
        objectUrl: meta.objectUrl,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        fileName: file.name,
        missingMedia: false,
      });
      pushToast({ type: 'success', title: `Relinked "${file.name}"` });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Relink failed',
        detail: err instanceof Error ? err.message : 'Decode error.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadBgAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await decodeAudioFile(file);
      setBgAudio({ name: file.name, buffer, volume: 0.75 });
      pushToast({ type: 'success', title: `Added music track "${file.name}"` });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Audio track load failed',
        detail: err instanceof Error ? err.message : 'Invalid audio.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleSplitClip = () => {
    if (!selectedClip) return;
    const localTime = (playhead - selectedClip.startOffset) * selectedClip.speed + selectedClip.trimStart;
    if (localTime <= selectedClip.trimStart + 0.15 || localTime >= selectedClip.trimEnd - 0.15) {
      pushToast({ type: 'warning', title: 'Move the playhead inside the selected clip to split it' });
      return;
    }
    const rightClip: VideoClipModel = {
      ...selectedClip,
      id: crypto.randomUUID(),
      name: `${selectedClip.name} (Part 2)`,
      startOffset: Number(playhead.toFixed(2)),
      trimStart: Number(localTime.toFixed(2)),
      trimEnd: selectedClip.trimEnd,
    };
    updateVideoClip(selectedClip.id, { trimEnd: Number(localTime.toFixed(2)) });
    addVideoClip(rightClip);
    pushToast({ type: 'success', title: `Split video clip at ${fmtTime(playhead)}` });
  };

  const handleDuplicateClip = () => {
    if (!selectedClip) return;
    const dur = (selectedClip.trimEnd - selectedClip.trimStart) / selectedClip.speed;
    addVideoClip({
      ...selectedClip,
      id: crypto.randomUUID(),
      name: `${selectedClip.name} Copy`,
      startOffset: Number((selectedClip.startOffset + dur).toFixed(2)),
    });
    pushToast({ type: 'success', title: 'Duplicated video clip' });
  };

  const handleExtractAudioFromClip = async () => {
    if (!selectedClip?.objectUrl) return;
    try {
      const resp = await fetch(selectedClip.objectUrl);
      const ab = await resp.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(ab.slice(0));
      const wav = encodeAudioBufferToWav(decoded, 16);
      triggerBlobDownload(wav, `${selectedClip.name}-audio.wav`);
      pushToast({ type: 'success', title: 'Extracted audio track as WAV' });
    } catch {
      pushToast({
        type: 'warning',
        title: 'No decodable audio stream found',
        detail: 'This video clip may be silent or use an audio codec not supported by Web Audio.',
      });
    }
  };

  const handleCaptureStillFrame = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    renderFrameAt(playhead, null, false);
    canvas.toBlob((blob) => {
      if (blob) {
        triggerBlobDownload(blob, `${projectName.replace(/\s+/g, '_')}_frame_${playhead.toFixed(1)}s.png`);
        pushToast({ type: 'success', title: 'Saved graded frame as PNG' });
      }
    }, 'image/png');
  };

  const addOverlayPreset = (kind: VideoOverlayModel['kind']) => {
    const ov: VideoOverlayModel = {
      id: crypto.randomUUID(),
      kind,
      text:
        kind === 'title'
          ? 'MIXORA STUDIO'
          : kind === 'subtitle'
            ? 'Subtitle caption text'
            : kind === 'lower-third'
              ? 'Creator Name · Director'
              : 'Text Overlay',
      startTime: Number(playhead.toFixed(1)),
      endTime: Number(Math.min(totalDuration, playhead + 4).toFixed(1)),
      x: 50,
      y: kind === 'subtitle' ? 86 : kind === 'lower-third' ? 82 : 50,
      width: 22,
      height: 14,
      fontFamily: 'Outfit',
      fontSize: kind === 'title' ? 52 : kind === 'subtitle' ? 24 : 32,
      color: '#F8FAFC',
      backgroundColor: kind === 'rect' || kind === 'circle' ? 'rgba(139, 92, 246, 0.7)' : 'rgba(9, 9, 13, 0.55)',
      shadow: true,
      animation: 'fade',
    };
    addVideoOverlay(ov);
    pushToast({ type: 'success', title: `Added ${kind} overlay` });
  };

  // Real Video Export Pipeline (Canvas + Pixel Color Grading + Overlays + Synced Audio -> MediaRecorder)
  const handleExportVideo = async () => {
    if (videoClips.length === 0) {
      pushToast({ type: 'error', title: 'Add at least one video clip before exporting' });
      return;
    }
    if (!exportMime || !MediaRecorder.isTypeSupported(exportMime)) {
      pushToast({
        type: 'error',
        title: 'Selected codec unavailable in this browser',
        detail: 'Pick a supported WebM or MP4 format from the export menu.',
      });
      return;
    }

    pauseAllVideos();
    cancelExportRef.current = false;
    setExportProgress(1);

    const ext = exportMime.includes('mp4') ? 'mp4' : 'webm';
    trackAnonymousEvent({
      eventType: 'export_attempt',
      feature: 'video_studio',
      format: ext,
      resolution: exportRes,
    });

    try {
      const firstClip = videoClips[0];
      const outW =
        exportRes === '480p'
          ? 854
          : exportRes === '720p'
            ? 1280
            : exportRes === '1080p'
              ? 1920
              : Math.min(1920, firstClip.width || 1280);
      const outH =
        exportRes === '480p'
          ? 480
          : exportRes === '720p'
            ? 720
            : exportRes === '1080p'
              ? 1080
              : Math.min(1080, firstClip.height || 720);

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = outW;
      exportCanvas.height = outH;

      const stream = exportCanvas.captureStream(exportFps);

      // Attach synced background audio if loaded
      let exportAudioSrc: AudioBufferSourceNode | null = null;
      if (bgAudio) {
        const ctx = getAudioContext();
        const dest = ctx.createMediaStreamDestination();
        exportAudioSrc = ctx.createBufferSource();
        exportAudioSrc.buffer = bgAudio.buffer;
        const g = ctx.createGain();
        g.gain.value = bgAudio.volume;
        exportAudioSrc.connect(g);
        g.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: exportMime,
        videoBitsPerSecond: exportBitrateMbps * 1_000_000,
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const recordingDone = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: exportMime }));
        recorder.onerror = () => reject(new Error('MediaRecorder encoding failed.'));
      });

      recorder.start(250);
      if (exportAudioSrc) exportAudioSrc.start(0);

      const startWall = performance.now();
      const totalMs = totalDuration * 1000;

      while (!cancelExportRef.current) {
        const elapsedMs = performance.now() - startWall;
        const t = elapsedMs / 1000;
        if (t >= totalDuration) break;

        const active = findActiveClipAt(t);
        for (const [id, vid] of hiddenVideosRef.current.entries()) {
          if (active && active.clip.id === id) {
            vid.muted = true; // Avoid echo during export
            vid.playbackRate = Math.max(0.25, Math.min(3, active.clip.speed));
            const desired =
              active.clip.freezeFrameTime != null
                ? active.clip.freezeFrameTime
                : active.clip.trimStart + active.localTime * active.clip.speed;
            if (active.clip.freezeFrameTime != null) {
              vid.pause();
              if (Math.abs(vid.currentTime - desired) > 0.06) vid.currentTime = desired;
            } else {
              if (Math.abs(vid.currentTime - desired) > 0.25) {
                vid.currentTime = Math.max(0, Math.min(vid.duration || desired, desired));
              }
              if (vid.paused) void vid.play().catch(() => {});
            }
          } else if (!vid.paused) {
            vid.pause();
          }
        }

        renderFrameAt(t, exportCanvas, false);
        setExportProgress(Math.min(98, Math.round((elapsedMs / Math.max(100, totalMs)) * 98)));
        await new Promise((r) => setTimeout(r, Math.round(1000 / exportFps)));
      }

      if (exportAudioSrc) {
        try {
          exportAudioSrc.stop();
        } catch {
          // ignore
        }
      }
      pauseAllVideos();
      recorder.stop();

      if (cancelExportRef.current) {
        pushToast({ type: 'info', title: 'Video export cancelled' });
        setExportProgress(null);
        return;
      }

      const blob = await recordingDone;
      setExportProgress(100);
      const safeName = projectName.replace(/[^a-z0-9\-_\s]/gi, '').trim().replace(/\s+/g, '_') || 'mixora_video';
      triggerBlobDownload(blob, `${safeName}.${ext}`);
      trackAnonymousEvent({
        eventType: 'export_success',
        feature: 'video_studio',
        status: 'success',
        format: ext,
        resolution: exportRes,
      });
      pushToast({ type: 'success', title: `Exported ${safeName}.${ext}` });
      setExportOpen(false);
    } catch (err) {
      trackAnonymousEvent({
        eventType: 'export_fail',
        feature: 'video_studio',
        status: 'error',
        format: ext,
        resolution: exportRes,
        errorCategory: 'export_failed',
      });
      pushToast({
        type: 'error',
        title: 'Video export failed',
        detail: err instanceof Error ? err.message : 'Browser encoder error.',
      });
    } finally {
      setExportProgress(null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Top Toolbar */}
      <div className="bg-[#14141D] border-b border-[#292938] px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StudioButton
            variant="primary"
            size="xs"
            onClick={() => (isPlaying ? pauseAllVideos() : setIsPlaying(true))}
            disabled={videoClips.length === 0}
            className="px-3.5"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause' : 'Play'}
          </StudioButton>
          <button
            type="button"
            onClick={() => {
              pauseAllVideos();
              setPlayhead(0);
            }}
            aria-label="Stop video"
            className="p-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <span className="px-2.5 py-1 rounded bg-[#09090D] border border-[#292938] font-mono tabular-nums text-xs text-[#22D3EE]">
            {fmtTime(playhead)} / {fmtTime(totalDuration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.webm,.mov,video/*"
            multiple
            onChange={(e) => void handleVideoFiles(e.target.files)}
            className="hidden"
          />
          <input
            ref={relinkInputRef}
            type="file"
            accept=".mp4,.webm,.mov,video/*"
            onChange={(e) => void handleRelinkVideo(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
          >
            <Upload className="w-3.5 h-3.5 text-[#8B5CF6]" />
            Import Video
          </button>
          <button
            type="button"
            onClick={handleSplitClip}
            disabled={!selectedClip}
            title="Split clip at playhead"
            className="p-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
          >
            <Scissors className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDuplicateClip}
            disabled={!selectedClip}
            title="Duplicate clip"
            className="p-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCaptureStillFrame}
            disabled={videoClips.length === 0}
            title="Capture graded PNG frame"
            className="p-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#22D3EE] disabled:opacity-40"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              addVideoMarker({
                id: crypto.randomUUID(),
                time: Number(playhead.toFixed(2)),
                label: `V${videoMarkers.length + 1}`,
                color: '#F59E0B',
              })
            }
            title="Add timeline marker"
            className="p-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F59E0B]"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setFullscreenPreview((f) => !f)}
            title="Toggle Fullscreen Preview"
            className="p-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <StudioButton
            variant="audio"
            size="xs"
            onClick={() => setExportOpen(true)}
            disabled={videoClips.length === 0}
            className="px-3.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Video
          </StudioButton>
        </div>
      </div>

      {/* Main Split: Preview + Timeline on Left, Inspector on Right */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <div
          className="flex-1 min-w-0 flex flex-col overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleVideoFiles(e.dataTransfer.files);
          }}
        >
          {/* Preview Canvas Stage */}
          <div
            className={`${
              fullscreenPreview ? 'fixed inset-0 z-50 bg-[#09090D] p-6' : 'flex-1 min-h-[220px] p-4'
            } flex flex-col items-center justify-center bg-[#0B0B10] relative`}
          >
            {fullscreenPreview && (
              <button
                type="button"
                onClick={() => setFullscreenPreview(false)}
                className="absolute top-4 right-4 p-2 rounded-md bg-[#14141D] border border-[#292938] text-[#F8FAFC]"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {videoClips.length === 0 ? (
              <div className="max-w-md w-full bg-[#14141D] border border-dashed border-[#292938] rounded-xl p-8 text-center space-y-4">
                <Film className="w-8 h-8 text-[#8B5CF6] mx-auto" />
                <div className="space-y-1">
                  <p className="font-display text-base font-semibold text-[#F8FAFC]">
                    Drop MP4, WebM, or MOV clips to begin editing
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    Files stay local on your device. Generate a procedural 720p twilight test clip to
                    try color grading and titles instantly.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <StudioButton
                    variant="primary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose Video Files
                  </StudioButton>
                  <button
                    type="button"
                    onClick={() => void handleGenerateSample()}
                    disabled={isGeneratingSample}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#22D3EE]"
                  >
                    {isGeneratingSample && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isGeneratingSample ? 'Rendering Clip...' : 'Generate Sample Clip'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <canvas
                  ref={previewCanvasRef}
                  width={960}
                  height={540}
                  className="max-h-full max-w-full aspect-video bg-black rounded-lg border border-[#292938]"
                />
                {selectedClip && (
                  <p className="text-[11px] font-mono text-[#94A3B8]">
                    {selectedClip.name} · {selectedClip.width}×{selectedClip.height} · Look:{' '}
                    {colorGrading.filterPreset}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Multi-Track Timeline */}
          <div className="h-52 sm:h-56 shrink-0 bg-[#14141D] border-t border-[#292938] flex flex-col">
            <div className="px-4 py-2 border-b border-[#292938] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-medium text-[#F8FAFC]">Timeline</span>
                <label className="inline-flex items-center gap-1.5 text-[#94A3B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={snapGrid}
                    onChange={(e) => setSnapGrid(e.target.checked)}
                    className="accent-[#8B5CF6]"
                  />
                  Snap 0.5s
                </label>
                <label className="inline-flex items-center gap-1.5 text-[#94A3B8]">
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.5}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-16"
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[#94A3B8]">Scrub</span>
                <input
                  type="range"
                  min={0}
                  max={totalDuration}
                  step={0.05}
                  value={playhead}
                  onChange={(e) => setPlayhead(Number(e.target.value))}
                  className="w-36 sm:w-52"
                />
              </div>
            </div>

            {/* Track lanes */}
            <div className="flex-1 overflow-auto p-3 space-y-2">
              <div style={{ width: `${Math.round(zoom * 100)}%`, minWidth: '100%' }} className="space-y-2 relative">
                {/* Playhead line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#F8FAFC] z-20 pointer-events-none"
                  style={{ left: `${(playhead / totalDuration) * 100}%` }}
                />

                {/* Markers */}
                {videoMarkers.length > 0 && (
                  <div className="flex items-center gap-2 text-[11px] pb-1">
                    {videoMarkers.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1 bg-[#1B1B27] border border-[#292938] rounded px-1.5 py-0.5 font-mono text-[#F59E0B]"
                      >
                        <button type="button" onClick={() => setPlayhead(m.time)}>
                          {m.label} ({m.time}s)
                        </button>
                        <button type="button" onClick={() => removeVideoMarker(m.id)} className="text-[#94A3B8]">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Video Track */}
                <div className="h-12 bg-[#09090D] border border-[#292938] rounded relative overflow-hidden">
                  <span className="absolute left-2 top-1 text-[10px] font-mono text-[#64748B] z-10 pointer-events-none">
                    V1
                  </span>
                  {videoClips.map((clip) => {
                    const dur = Math.max(0.2, (clip.trimEnd - clip.trimStart) / Math.max(0.25, clip.speed));
                    const leftPct = (clip.startOffset / totalDuration) * 100;
                    const widthPct = Math.max(4, (dur / totalDuration) * 100);
                    const selected = selectedClip?.id === clip.id;

                    return (
                      <div
                        key={clip.id}
                        onClick={() => setSelectedVideoClipId(clip.id)}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        className={`absolute top-1 bottom-1 rounded px-2 flex items-center justify-between gap-1 cursor-pointer overflow-hidden border ${
                          selected
                            ? 'bg-[#8B5CF6]/30 border-[#8B5CF6] text-[#F8FAFC]'
                            : 'bg-[#1B1B27] border-[#3B3B52] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        <span className="text-[11px] font-medium truncate">{clip.name}</span>
                        {clip.missingMedia && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              relinkClipIdRef.current = clip.id;
                              relinkInputRef.current?.click();
                            }}
                            className="text-[10px] text-[#F59E0B] inline-flex items-center gap-0.5 shrink-0"
                          >
                            <FolderSync className="w-3 h-3" />
                            Relink
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Overlays Track */}
                <div className="h-9 bg-[#09090D] border border-[#292938] rounded relative overflow-hidden">
                  <span className="absolute left-2 top-1 text-[10px] font-mono text-[#64748B] z-10 pointer-events-none">
                    T1
                  </span>
                  {videoOverlays.map((ov) => {
                    const leftPct = (ov.startTime / totalDuration) * 100;
                    const widthPct = Math.max(4, ((ov.endTime - ov.startTime) / totalDuration) * 100);
                    return (
                      <div
                        key={ov.id}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        className="absolute top-1 bottom-1 rounded px-2 bg-[#3B82F6]/25 border border-[#3B82F6] flex items-center text-[10px] text-[#F8FAFC] truncate"
                      >
                        {ov.text}
                      </div>
                    );
                  })}
                </div>

                {/* Audio Soundtrack Track */}
                <div className="h-9 bg-[#09090D] border border-[#292938] rounded relative overflow-hidden flex items-center px-3">
                  <span className="text-[10px] font-mono text-[#64748B] mr-3">A1</span>
                  {bgAudio ? (
                    <span className="text-[11px] text-[#22D3EE] truncate">
                      {bgAudio.name} ({bgAudio.buffer.duration.toFixed(1)}s · {Math.round(bgAudio.volume * 100)}%)
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#64748B]">No music track attached (open Audio tab to add)</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Contextual Inspector */}
        <aside className="w-full lg:w-80 xl:w-96 shrink-0 bg-[#14141D] border-t lg:border-t-0 lg:border-l border-[#292938] flex flex-col max-h-[45vh] lg:max-h-none">
          <div className="p-2.5 border-b border-[#292938] grid grid-cols-4 gap-1 bg-[#0D0D14]">
            {[
              { id: 'color' as const, label: 'Color', icon: Palette },
              { id: 'clip' as const, label: 'Clip', icon: Sliders },
              { id: 'overlay' as const, label: 'Text', icon: Type },
              { id: 'audio' as const, label: 'Audio', icon: AudioLines },
            ].map((t) => {
              const Icon = t.icon;
              const active = inspectorTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setInspectorTab(t.id)}
                  className={`relative flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    active
                      ? 'text-[#F8FAFC]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="video-inspector-tab-bg"
                      transition={{ duration: 0.2, ease: STUDIO_EASE }}
                      className="absolute inset-0 rounded bg-[#8B5CF6]"
                    />
                  )}
                  <Icon className="relative z-10 w-3.5 h-3.5" />
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <TabContentTransition tabKey={inspectorTab}>
            {inspectorTab === 'color' && (
              <ColorGradingPanel
                compareSplit={compareSplit}
                onToggleCompareSplit={() => setCompareSplit((c) => !c)}
              />
            )}

            {inspectorTab === 'clip' && (
              !selectedClip ? (
                <p className="text-xs text-[#94A3B8]">Select a video clip on the timeline to edit its properties.</p>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#F8FAFC] truncate">{selectedClip.name}</span>
                    <button
                      type="button"
                      onClick={() => removeVideoClip(selectedClip.id)}
                      className="text-[#94A3B8] hover:text-[#F43F5E] p-1"
                      aria-label="Delete clip"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Position & Trim */}
                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">Timeline Position</span>
                        <span className="font-mono">{selectedClip.startOffset.toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(30, totalDuration)}
                        step={snapGrid ? 0.5 : 0.1}
                        value={selectedClip.startOffset}
                        onChange={(e) =>
                          updateVideoClip(selectedClip.id, { startOffset: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">Trim Start</span>
                        <span className="font-mono">{selectedClip.trimStart.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0.1, selectedClip.trimEnd - 0.2)}
                        step={0.1}
                        value={selectedClip.trimStart}
                        onChange={(e) =>
                          updateVideoClip(selectedClip.id, { trimStart: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">Trim End</span>
                        <span className="font-mono">{selectedClip.trimEnd.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min={selectedClip.trimStart + 0.2}
                        max={selectedClip.duration}
                        step={0.1}
                        value={selectedClip.trimEnd}
                        onChange={(e) =>
                          updateVideoClip(selectedClip.id, { trimEnd: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">Playback Speed (Slow-Mo / Fast)</span>
                        <span className="font-mono">{selectedClip.speed.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.25}
                        max={3.0}
                        step={0.05}
                        value={selectedClip.speed}
                        onChange={(e) =>
                          updateVideoClip(selectedClip.id, { speed: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Transform: Rotate, Flip, Crop */}
                  <div className="pt-3 border-t border-[#292938] space-y-2.5">
                    <p className="font-medium text-[#F8FAFC]">Transform & Crop</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateVideoClip(selectedClip.id, {
                            rotation: (((selectedClip.rotation + 90) % 360) as 0 | 90 | 180 | 270),
                          })
                        }
                        className="flex items-center justify-center gap-1 py-2 rounded bg-[#1B1B27] border border-[#292938] text-[#F8FAFC]"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        {selectedClip.rotation}°
                      </button>
                      <button
                        type="button"
                        onClick={() => updateVideoClip(selectedClip.id, { flipH: !selectedClip.flipH })}
                        className={`flex items-center justify-center gap-1 py-2 rounded border ${
                          selectedClip.flipH
                            ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                            : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                        }`}
                      >
                        <FlipHorizontal className="w-3.5 h-3.5" />
                        Flip H
                      </button>
                      <button
                        type="button"
                        onClick={() => updateVideoClip(selectedClip.id, { flipV: !selectedClip.flipV })}
                        className={`flex items-center justify-center gap-1 py-2 rounded border ${
                          selectedClip.flipV
                            ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                            : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8]'
                        }`}
                      >
                        <FlipVertical className="w-3.5 h-3.5" />
                        Flip V
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">Crop Zoom</span>
                        <span className="font-mono">{Math.round(selectedClip.cropW * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.4}
                        max={1}
                        step={0.02}
                        value={selectedClip.cropW}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          const inset = (1 - w) / 2;
                          updateVideoClip(selectedClip.id, {
                            cropW: w,
                            cropH: w,
                            cropX: inset,
                            cropY: inset,
                          });
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Transitions & Freeze Frame */}
                  <div className="pt-3 border-t border-[#292938] space-y-2.5">
                    <div className="space-y-1">
                      <label className="text-[#94A3B8]">Entry Transition</label>
                      <select
                        value={selectedClip.transitionIn}
                        onChange={(e) =>
                          updateVideoClip(selectedClip.id, {
                            transitionIn: e.target.value as TransitionType,
                          })
                        }
                        className="w-full bg-[#09090D] border border-[#292938] rounded px-2.5 py-1.5 text-[#F8FAFC]"
                      >
                        <option value="none">None</option>
                        <option value="fade">Fade In</option>
                        <option value="crossfade">Crossfade</option>
                        <option value="slide">Slide</option>
                        <option value="zoom">Zoom</option>
                        <option value="dissolve">Dissolve</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateVideoClip(selectedClip.id, {
                            freezeFrameTime:
                              selectedClip.freezeFrameTime != null
                                ? null
                                : Math.max(selectedClip.trimStart, playhead - selectedClip.startOffset),
                          })
                        }
                        className={`px-3 py-1.5 rounded border text-xs ${
                          selectedClip.freezeFrameTime != null
                            ? 'bg-[#22D3EE]/20 border-[#22D3EE] text-[#22D3EE]'
                            : 'bg-[#1B1B27] border-[#292938] text-[#F8FAFC]'
                        }`}
                      >
                        {selectedClip.freezeFrameTime != null ? 'Release Freeze Frame' : 'Freeze Current Frame'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExtractAudioFromClip()}
                        className="px-3 py-1.5 rounded bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs text-[#22D3EE]"
                      >
                        Extract Audio (WAV)
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}

            {inspectorTab === 'overlay' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['title', 'Add Title'],
                      ['subtitle', 'Add Subtitle'],
                      ['lower-third', 'Lower Third'],
                      ['rect', 'Rectangle'],
                      ['circle', 'Circle'],
                      ['text', 'Text Box'],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => addOverlayPreset(kind)}
                      className="inline-flex items-center justify-center gap-1 py-2 rounded bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#F8FAFC]"
                    >
                      <Plus className="w-3 h-3 text-[#8B5CF6]" />
                      {label}
                    </button>
                  ))}
                </div>

                {videoOverlays.length === 0 ? (
                  <p className="text-[#94A3B8]">No overlays added yet.</p>
                ) : (
                  <div className="space-y-3">
                    {videoOverlays.map((ov) => (
                      <div
                        key={ov.id}
                        className="bg-[#09090D] border border-[#292938] rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[#22D3EE] capitalize">{ov.kind}</span>
                          <button
                            type="button"
                            onClick={() => removeVideoOverlay(ov.id)}
                            className="text-[#94A3B8] hover:text-[#F43F5E]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {ov.kind !== 'rect' && ov.kind !== 'circle' && (
                          <input
                            type="text"
                            value={ov.text}
                            onChange={(e) => updateVideoOverlay(ov.id, { text: e.target.value })}
                            className="w-full bg-[#14141D] border border-[#292938] rounded px-2 py-1 text-[#F8FAFC]"
                          />
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-0.5">
                            <span className="text-[#94A3B8]">X ({ov.x}%)</span>
                            <input
                              type="range"
                              min={5}
                              max={95}
                              value={ov.x}
                              onChange={(e) => updateVideoOverlay(ov.id, { x: Number(e.target.value) })}
                              className="w-full"
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[#94A3B8]">Y ({ov.y}%)</span>
                            <input
                              type="range"
                              min={5}
                              max={95}
                              value={ov.y}
                              onChange={(e) => updateVideoOverlay(ov.id, { y: Number(e.target.value) })}
                              className="w-full"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={ov.animation}
                            onChange={(e) =>
                              updateVideoOverlay(ov.id, {
                                animation: e.target.value as VideoOverlayModel['animation'],
                              })
                            }
                            className="bg-[#14141D] border border-[#292938] rounded px-2 py-1 text-[#F8FAFC]"
                          >
                            <option value="none">No Anim</option>
                            <option value="fade">Fade</option>
                            <option value="slide-up">Slide Up</option>
                            <option value="zoom">Zoom</option>
                          </select>
                          <input
                            type="color"
                            value={ov.color}
                            onChange={(e) => updateVideoOverlay(ov.id, { color: e.target.value })}
                            aria-label="Text color"
                            className="w-full h-7 bg-[#14141D] border border-[#292938] rounded cursor-pointer"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {inspectorTab === 'audio' && (
              <div className="space-y-4 text-xs">
                <p className="text-[#94A3B8] leading-relaxed">
                  Attach a local music or voiceover file to play synchronized with your video and
                  mix directly into the exported video file.
                </p>
                <input
                  ref={bgAudioInputRef}
                  type="file"
                  accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*"
                  onChange={(e) => void handleLoadBgAudio(e)}
                  className="hidden"
                />
                <StudioButton
                  variant="primary"
                  size="sm"
                  onClick={() => bgAudioInputRef.current?.click()}
                  className="w-full py-2.5"
                >
                  {bgAudio ? 'Replace Background Music' : 'Attach Local Music / Audio'}
                </StudioButton>

                {bgAudio && (
                  <div className="bg-[#09090D] border border-[#292938] rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#22D3EE] truncate">{bgAudio.name}</span>
                      <button
                        type="button"
                        onClick={() => setBgAudio(null)}
                        className="text-[#94A3B8] hover:text-[#F43F5E]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">Music Volume</span>
                        <span className="font-mono">{Math.round(bgAudio.volume * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.4}
                        step={0.05}
                        value={bgAudio.volume}
                        onChange={(e) => setBgAudio({ ...bgAudio, volume: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            </TabContentTransition>
          </div>
        </aside>
      </div>

      {/* Video Export Modal */}
      <ModalTransition open={exportOpen} onBackdropClick={() => exportProgress == null && setExportOpen(false)}>
        <div className="bg-[#14141D] border border-[#292938] rounded-xl w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">Export Graded Video</h3>
            <p className="text-xs text-[#94A3B8]">
              Only codecs genuinely supported by your browser&apos;s MediaRecorder are shown below.
              All color grading, crops, and titles are baked into the exported frames.
            </p>

            {capabilities?.supportedVideoExports.length === 0 ? (
              <p className="text-xs text-[#F43F5E]">
                Your current browser does not expose MediaRecorder video encoding. Try Chrome, Edge,
                or Firefox desktop.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[#94A3B8]">Browser-Supported Format</label>
                  <select
                    value={exportMime}
                    onChange={(e) => setExportMime(e.target.value)}
                    className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-[#F8FAFC]"
                  >
                    {capabilities?.supportedVideoExports.map((opt) => (
                      <option key={opt.mimeType} value={opt.mimeType}>
                        {opt.label} (.{opt.ext})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[#94A3B8]">Resolution</label>
                    <select
                      value={exportRes}
                      onChange={(e) => setExportRes(e.target.value as '480p' | '720p' | '1080p' | 'source')}
                      className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-[#F8FAFC]"
                    >
                      <option value="480p">480p (Fast)</option>
                      <option value="720p">720p HD</option>
                      <option value="1080p">1080p Full HD</option>
                      <option value="source">Match Source</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[#94A3B8]">Frame Rate</label>
                    <select
                      value={exportFps}
                      onChange={(e) => setExportFps(Number(e.target.value))}
                      className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-[#F8FAFC]"
                    >
                      <option value={24}>24 fps (Cinema)</option>
                      <option value={30}>30 fps (Standard)</option>
                      <option value={60}>60 fps (Smooth)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Target Video Bitrate</span>
                    <span className="font-mono text-[#F8FAFC]">{exportBitrateMbps} Mbps</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={14}
                    step={1}
                    value={exportBitrateMbps}
                    onChange={(e) => setExportBitrateMbps(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {exportProgress != null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#94A3B8]">Rendering timeline in browser...</span>
                  <span className="font-mono tabular-nums text-[#F8FAFC]">{exportProgress}%</span>
                </div>
                <div className="h-2 bg-[#09090D] rounded overflow-hidden">
                  <div
                    className="h-full bg-[#22D3EE] transition-all"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              {exportProgress != null ? (
                <StudioButton
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    cancelExportRef.current = true;
                  }}
                >
                  Cancel Export
                </StudioButton>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setExportOpen(false)}
                    className="px-4 py-2 rounded-md bg-[#1B1B27] text-xs font-medium text-[#F8FAFC]"
                  >
                    Close
                  </button>
                  <StudioButton
                    variant="primary"
                    size="sm"
                    disabled={!exportMime}
                    onClick={() => void handleExportVideo()}
                  >
                    Render & Download
                  </StudioButton>
                </>
              )}
            </div>
        </div>
      </ModalTransition>
    </div>
  );
}
