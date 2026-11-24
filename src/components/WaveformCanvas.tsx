import { useEffect, useRef } from 'react';
import type { TimelineMarker } from '../types/mixora';

interface WaveformCanvasProps {
  peaks: number[];
  duration: number;
  currentTime?: number;
  trimStart?: number;
  trimEnd?: number;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  beatPositions?: number[];
  markers?: TimelineMarker[];
  color?: string;
  height?: number;
  onSeek?: (timeSec: number) => void;
}

export function WaveformCanvas({
  peaks,
  duration,
  currentTime = 0,
  trimStart = 0,
  trimEnd,
  selectionStart = null,
  selectionEnd = null,
  beatPositions = [],
  markers = [],
  color = '#22D3EE',
  height = 72,
  onSeek,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(100, Math.floor(rect.width));
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0D0D14';
    ctx.fillRect(0, 0, width, height);

    // Center zero line
    ctx.strokeStyle = '#292938';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const safeDur = Math.max(0.01, duration);
    const effTrimEnd = trimEnd ?? safeDur;

    // Beat grid lines
    if (beatPositions.length > 0) {
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.22)';
      ctx.lineWidth = 1;
      for (const b of beatPositions) {
        const bx = (b / safeDur) * width;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx, height);
        ctx.stroke();
      }
    }

    // Waveform bars
    if (peaks.length > 0) {
      const barCount = Math.min(width, peaks.length);
      const step = peaks.length / barCount;
      const barWidth = Math.max(1, width / barCount);

      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor(i * step);
        const amp = Math.min(1, peaks[idx] ?? 0);
        const barH = Math.max(2, amp * (height - 10));
        const x = i * barWidth;
        const t = (x / width) * safeDur;
        const inActiveTrim = t >= trimStart && t <= effTrimEnd;

        ctx.fillStyle = inActiveTrim ? color : 'rgba(148, 163, 184, 0.22)';
        ctx.fillRect(x, (height - barH) / 2, Math.max(1, barWidth - 0.5), barH);
      }
    }

    // Dimmed trimmed out regions
    if (trimStart > 0) {
      ctx.fillStyle = 'rgba(9, 9, 13, 0.62)';
      ctx.fillRect(0, 0, (trimStart / safeDur) * width, height);
    }
    if (effTrimEnd < safeDur) {
      const ex = (effTrimEnd / safeDur) * width;
      ctx.fillStyle = 'rgba(9, 9, 13, 0.62)';
      ctx.fillRect(ex, 0, width - ex, height);
    }

    // Selection overlay
    if (selectionStart != null && selectionEnd != null && selectionEnd > selectionStart) {
      const sx = (selectionStart / safeDur) * width;
      const ex = (selectionEnd / safeDur) * width;
      ctx.fillStyle = 'rgba(139, 92, 246, 0.22)';
      ctx.fillRect(sx, 0, ex - sx, height);
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, 0.5, ex - sx, height - 1);
    }

    // Markers
    for (const m of markers) {
      const mx = (m.time / safeDur) * width;
      ctx.strokeStyle = m.color || '#F59E0B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, height);
      ctx.stroke();
    }

    // Playhead
    const playX = Math.max(0, Math.min(width, (currentTime / safeDur) * width));
    ctx.strokeStyle = '#F8FAFC';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
  }, [peaks, duration, currentTime, trimStart, trimEnd, selectionStart, selectionEnd, beatPositions, markers, color, height]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{ height }}
      className={`w-full rounded border border-[#292938] block ${onSeek ? 'cursor-pointer' : ''}`}
    />
  );
}
