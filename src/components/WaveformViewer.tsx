import { AnimatePresence, motion } from 'motion/react';
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { TimelineMarker } from '../types/mixora';

export interface WaveformViewerProps {
  /** Optional decoded Web Audio AudioBuffer (preferred in MIXORA to avoid redundant decoding) */
  audioBuffer?: AudioBuffer;
  /** Optional audio Blob or media URL if loading directly into WaveSurfer */
  audioUrl?: string;
  /** Optional precomputed normalized peaks (0..1) fallback when AudioBuffer is unloaded */
  peaks?: number[];
  /** Total track duration in seconds */
  duration: number;
  /** Synchronized playhead position in seconds */
  currentTime?: number;
  /** Zoom multiplier (1 = fit view, >1 zooms horizontally via WaveSurfer minPxPerSec) */
  zoom?: number;
  /** Configurable waveform track height in pixels */
  height?: number;
  /** Primary waveform bar color */
  waveColor?: string;
  /** Played/progress waveform color */
  progressColor?: string;
  /** Optional trim start/end in seconds */
  trimStart?: number;
  trimEnd?: number;
  /** Optional selected region in seconds */
  selectionStart?: number | null;
  selectionEnd?: number | null;
  /** Optional timeline markers */
  markers?: TimelineMarker[];
  /** Show built-in compact zoom & height controls */
  showControls?: boolean;
  /** Seek callback when the user clicks or drags on the waveform */
  onSeek?: (timeSec: number) => void;
  /** Callback when internal zoom control changes */
  onZoomChange?: (zoom: number) => void;
  /** Callback when internal height control changes */
  onHeightChange?: (height: number) => void;
}

const HEIGHT_PRESETS = [
  { label: 'S', value: 52 },
  { label: 'M', value: 76 },
  { label: 'L', value: 116 },
];

export function WaveformViewer({
  audioBuffer,
  audioUrl,
  peaks,
  duration,
  currentTime = 0,
  zoom: controlledZoom,
  height: controlledHeight,
  waveColor = '#22D3EE',
  progressColor = '#8B5CF6',
  trimStart = 0,
  trimEnd,
  selectionStart = null,
  selectionEnd = null,
  markers = [],
  showControls = false,
  onSeek,
  onZoomChange,
  onHeightChange,
}: WaveformViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const [internalZoom, setInternalZoom] = useState(1);
  const [internalHeight, setInternalHeight] = useState(76);
  const [isReady, setIsReady] = useState(false);

  const activeZoom = controlledZoom ?? internalZoom;
  const activeHeight = controlledHeight ?? internalHeight;
  const safeDuration = Math.max(0.01, duration);
  const effectiveTrimEnd = trimEnd ?? safeDuration;

  const updateZoom = (next: number) => {
    const clamped = Math.max(1, Math.min(8, Number(next.toFixed(1))));
    if (onZoomChange) onZoomChange(clamped);
    else setInternalZoom(clamped);
  };

  const updateHeight = (next: number) => {
    const clamped = Math.max(40, Math.min(200, Math.round(next)));
    if (onHeightChange) onHeightChange(clamped);
    else setInternalHeight(clamped);
  };

  // Downsample AudioBuffer or precomputed peaks into clean channel arrays for WaveSurfer
  const channelPeaks = useMemo<(Float32Array | number[])[] | undefined>(() => {
    if (audioBuffer) {
      const targetLen = Math.min(audioBuffer.length, 4000);
      const src = audioBuffer.getChannelData(0);
      if (src.length <= targetLen) {
        return [src];
      }
      const step = src.length / targetLen;
      const out = new Float32Array(targetLen);
      for (let i = 0; i < targetLen; i++) {
        const start = Math.floor(i * step);
        const end = Math.min(src.length, Math.floor((i + 1) * step));
        let peak = 0;
        for (let j = start; j < end; j++) {
          const val = Math.abs(src[j]);
          if (val > peak) peak = val;
        }
        out[i] = peak;
      }
      return [out];
    }
    if (peaks && peaks.length > 0) {
      return [peaks];
    }
    return undefined;
  }, [audioBuffer, peaks]);

  // Initialize WaveSurfer instance
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setIsReady(false);

    const ws = WaveSurfer.create({
      container,
      height: activeHeight,
      waveColor,
      progressColor,
      cursorColor: '#F8FAFC',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: true,
      autoScroll: true,
      autoCenter: false,
      hideScrollbar: false,
      fillParent: true,
      url: !channelPeaks && audioUrl ? audioUrl : undefined,
      peaks: channelPeaks,
      duration: safeDuration,
    });

    wsRef.current = ws;

    ws.on('ready', () => {
      setIsReady(true);
    });

    // When peaks + duration are supplied without a media URL, mark ready immediately
    if (channelPeaks) {
      setIsReady(true);
    }

    ws.on('interaction', (newTime: number) => {
      if (onSeekRef.current && Number.isFinite(newTime)) {
        onSeekRef.current(Math.max(0, Math.min(safeDuration, newTime)));
      }
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
    // Re-create only when media source or colors change
  }, [audioUrl, channelPeaks, safeDuration, waveColor, progressColor]);

  // Apply dynamic track height smoothly without tearing down WaveSurfer
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.setOptions({ height: activeHeight });
  }, [activeHeight]);

  // Apply dynamic WaveSurfer zoom (minPxPerSec)
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !isReady) return;
    const containerW = containerRef.current?.clientWidth || 640;
    const basePxPerSec = containerW / safeDuration;
    const minPxPerSec = activeZoom <= 1 ? 0 : Math.max(10, Math.round(basePxPerSec * activeZoom));
    try {
      ws.zoom(minPxPerSec);
    } catch {
      // Guard if called before media duration settles
    }
  }, [activeZoom, isReady, safeDuration]);

  // Synchronize external playhead time without re-triggering onSeek
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !isReady) return;
    const clamped = Math.max(0, Math.min(safeDuration, currentTime));
    if (Math.abs(ws.getCurrentTime() - clamped) > 0.03) {
      ws.setTime(clamped);
    }
  }, [currentTime, isReady, safeDuration]);

  const trimStartPct = (Math.max(0, trimStart) / safeDuration) * 100;
  const trimEndPct = (Math.min(safeDuration, effectiveTrimEnd) / safeDuration) * 100;
  const hasSelection = selectionStart != null && selectionEnd != null && selectionEnd > selectionStart;
  const selStartPct = hasSelection ? (Math.max(0, selectionStart!) / safeDuration) * 100 : 0;
  const selWidthPct = hasSelection
    ? ((Math.min(safeDuration, selectionEnd!) - Math.max(0, selectionStart!)) / safeDuration) * 100
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-2"
    >
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A3B8]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateZoom(activeZoom - 0.5)}
              disabled={activeZoom <= 1}
              aria-label="Zoom out waveform"
              className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono tabular-nums text-[#F8FAFC] min-w-[2.75rem] text-center">
              {activeZoom.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={() => updateZoom(activeZoom + 0.5)}
              disabled={activeZoom >= 8}
              aria-label="Zoom in waveform"
              className="p-1 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {activeHeight > 76 ? (
              <Maximize2 className="w-3 h-3 text-[#22D3EE]" />
            ) : (
              <Minimize2 className="w-3 h-3 text-[#94A3B8]" />
            )}
            <span className="text-[11px]">Height</span>
            <div className="flex items-center gap-0.5 bg-[#09090D] p-0.5 rounded border border-[#292938]">
              {HEIGHT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => updateHeight(preset.value)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    activeHeight === preset.value
                      ? 'bg-[#8B5CF6] text-[#F8FAFC]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WaveSurfer Viewport + Synchronized Trim/Selection/Marker Overlays */}
      <div
        className="relative rounded-md border border-[#292938] bg-[#0D0D14] overflow-hidden transition-[min-height] duration-200 ease-out"
        style={{ minHeight: activeHeight }}
      >
        <div ref={containerRef} className="w-full" />

        {/* Subtle loading shimmer while WaveSurfer renders */}
        <AnimatePresence>
          {!isReady && (
            <motion.div
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-[#0D0D14]/85 flex items-center justify-center pointer-events-none"
            >
              <span className="text-[11px] font-mono text-[#94A3B8]">Rendering waveform...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Non-blocking visual overlays for trim masks, region selection, and markers (visible at 1x fit view) */}
        {activeZoom <= 1 && (
          <div className="pointer-events-none absolute inset-0">
            {trimStartPct > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-[#09090D]/65 border-r border-[#94A3B8]/40"
                style={{ width: `${trimStartPct}%` }}
              />
            )}
            {trimEndPct < 100 && (
              <div
                className="absolute inset-y-0 right-0 bg-[#09090D]/65 border-l border-[#94A3B8]/40"
                style={{ width: `${Math.max(0, 100 - trimEndPct)}%` }}
              />
            )}
            {hasSelection && (
              <div
                className="absolute inset-y-0 bg-[#8B5CF6]/20 border-x border-[#8B5CF6]"
                style={{ left: `${selStartPct}%`, width: `${selWidthPct}%` }}
              />
            )}
            {markers.map((m) => {
              const leftPct = (Math.max(0, Math.min(safeDuration, m.time)) / safeDuration) * 100;
              return (
                <div
                  key={m.id}
                  className="absolute inset-y-0 w-0.5"
                  style={{ left: `${leftPct}%`, backgroundColor: m.color || '#F59E0B' }}
                />
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
