import { Pause, Play, Sliders, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getAudioContext } from '../engines/audioEngine';

/**
 * Interactive real-time audio/video waveform & timeline showcase for the Home Hero.
 * Synthesizes an actual subtle Web Audio chord/pulse preview when clicked so the
 * hero waveform responds live to real FFT frequency data.
 */
export function HeroWaveformPreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [filterHz, setFilterHz] = useState(2400);
  const [playhead, setPlayhead] = useState(0.28);

  const audioNodesRef = useRef<{
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    filter: BiquadFilterNode;
    analyser: AnalyserNode;
    gain: GainNode;
    interval: number;
  } | null>(null);

  const stopPreviewAudio = () => {
    const nodes = audioNodesRef.current;
    if (!nodes) return;
    window.clearInterval(nodes.interval);
    try {
      nodes.gain.gain.setTargetAtTime(0.0001, nodes.gain.context.currentTime, 0.04);
      setTimeout(() => {
        try {
          nodes.osc1.stop();
          nodes.osc2.stop();
        } catch {
          // already stopped
        }
      }, 120);
    } catch {
      // ignore
    }
    audioNodesRef.current = null;
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopPreviewAudio();
      return;
    }

    const ctx = getAudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    const notes = [220, 261.63, 329.63, 196];
    let step = 0;
    osc1.frequency.value = notes[0];
    osc2.frequency.value = notes[0] * 0.5;

    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    filter.Q.value = 3;

    analyser.fftSize = 256;
    gain.gain.value = 0.09;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    const interval = window.setInterval(() => {
      step = (step + 1) % notes.length;
      const now = ctx.currentTime;
      osc1.frequency.setTargetAtTime(notes[step], now, 0.05);
      osc2.frequency.setTargetAtTime(notes[step] * 0.5, now, 0.05);
    }, 950);

    audioNodesRef.current = { osc1, osc2, filter, analyser, gain, interval };
    setIsPlaying(true);
  };

  useEffect(() => {
    if (audioNodesRef.current) {
      audioNodesRef.current.filter.frequency.setTargetAtTime(
        filterHz,
        audioNodesRef.current.filter.context.currentTime,
        0.04
      );
    }
  }, [filterHz]);

  useEffect(() => {
    return () => stopPreviewAudio();
  }, []);

  useEffect(() => {
    let raf = 0;
    let phase = 0;
    const freqBins = new Uint8Array(128);

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = 230;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);

      // Studio timeline background
      ctx.fillStyle = '#0D0D14';
      ctx.fillRect(0, 0, w, h);

      // Subtle time grid
      ctx.strokeStyle = '#1E1E2D';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Ruler top bar
      ctx.fillStyle = '#14141D';
      ctx.fillRect(0, 0, w, 24);
      ctx.fillStyle = '#64748B';
      ctx.font = '10px "JetBrains Mono", monospace';
      for (let i = 0; i < 8; i++) {
        const tx = (i / 8) * w + 8;
        ctx.fillText(`00:${String(i * 4).padStart(2, '0')}`, tx, 15);
      }

      if (audioNodesRef.current) {
        audioNodesRef.current.analyser.getByteFrequencyData(freqBins);
      }

      if (isPlaying) {
        phase += 0.045;
        setPlayhead((p) => (p + 0.0018) % 1);
      } else {
        phase += 0.012;
      }

      // Track 1: Video Clip Track (Violet)
      const vTop = 34;
      const vH = 44;
      ctx.fillStyle = '#1B1B27';
      ctx.fillRect(16, vTop, w * 0.56, vH);
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 1;
      ctx.strokeRect(16.5, vTop + 0.5, w * 0.56, vH - 1);

      ctx.fillStyle = '#1B1B27';
      ctx.fillRect(16 + w * 0.58, vTop, w * 0.36, vH);
      ctx.strokeStyle = '#3B82F6';
      ctx.strokeRect(16 + w * 0.58 + 0.5, vTop + 0.5, w * 0.36, vH - 1);

      // Color grade histogram bars inside Video track
      for (let i = 0; i < 28; i++) {
        const bx = 26 + i * 10;
        if (bx > 16 + w * 0.54) break;
        const bh = 10 + Math.abs(Math.sin(i * 0.5 + phase * 0.6)) * 22;
        ctx.fillStyle = 'rgba(139, 92, 246, 0.45)';
        ctx.fillRect(bx, vTop + vH - bh - 4, 6, bh);
      }

      ctx.fillStyle = '#F8FAFC';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('V1 · Cinema Grade (1080p)', 24, vTop + 16);
      ctx.fillText('V2 · Crossfade', 24 + w * 0.58, vTop + 16);

      // Track 2: Lead Audio Waveform (Cyan)
      const a1Top = 90;
      const a1H = 58;
      ctx.fillStyle = '#14141D';
      ctx.fillRect(16, a1Top, w - 32, a1H);
      ctx.strokeStyle = '#292938';
      ctx.strokeRect(16.5, a1Top + 0.5, w - 33, a1H - 1);

      const bars = Math.floor((w - 48) / 4);
      for (let i = 0; i < bars; i++) {
        const normX = i / bars;
        const liveBoost = isPlaying ? (freqBins[i % 64] / 255) * 0.85 : 0;
        const env =
          0.25 +
          Math.abs(Math.sin(i * 0.22 + phase) * Math.cos(i * 0.08 - phase * 0.5)) * 0.65 +
          liveBoost * 0.5;
        const bh = Math.min(a1H - 10, Math.max(4, env * (a1H - 14)));
        ctx.fillStyle = normX < playhead ? '#22D3EE' : 'rgba(34, 211, 238, 0.42)';
        ctx.fillRect(24 + i * 4, a1Top + (a1H - bh) / 2, 2.5, bh);
      }

      // Track 3: Stem / Bass Track (Violet / Lime accents)
      const a2Top = 160;
      const a2H = 54;
      ctx.fillStyle = '#14141D';
      ctx.fillRect(16, a2Top, w - 32, a2H);
      ctx.strokeStyle = '#292938';
      ctx.strokeRect(16.5, a2Top + 0.5, w - 33, a2H - 1);

      for (let i = 0; i < bars; i++) {
        const normX = i / bars;
        const liveBoost = isPlaying ? (freqBins[(i * 2) % 48] / 255) * 0.7 : 0;
        const beatPulse = i % 8 === 0 ? 0.85 : 0.35;
        const env = beatPulse * (0.45 + Math.abs(Math.sin(i * 0.14 - phase * 0.8)) * 0.55) + liveBoost * 0.4;
        const bh = Math.min(a2H - 10, Math.max(3, env * (a2H - 16)));
        ctx.fillStyle = normX < playhead ? '#8B5CF6' : 'rgba(139, 92, 246, 0.38)';
        ctx.fillRect(24 + i * 4, a2Top + (a2H - bh) / 2, 2.5, bh);
      }

      // Playhead needle
      const px = 16 + playhead * (w - 32);
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 24);
      ctx.lineTo(px, h);
      ctx.stroke();

      ctx.fillStyle = '#8B5CF6';
      ctx.beginPath();
      ctx.moveTo(px - 5, 24);
      ctx.lineTo(px + 5, 24);
      ctx.lineTo(px, 31);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, playhead]);

  const handleScrub = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - 16) / (rect.width - 32)));
    setPlayhead(ratio);
  };

  return (
    <div className="bg-[#14141D] border border-[#292938] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#292938] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-medium text-[#F8FAFC] transition-colors whitespace-nowrap"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Stop Synth Preview' : 'Preview Live Audio'}
          </button>
          <span className="text-xs text-[#94A3B8] font-mono tabular-nums">
            00:{String(Math.floor(playhead * 32)).padStart(2, '0')}.{String(Math.floor((playhead * 320) % 10))}
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-xs text-[#94A3B8]">
          <Sliders className="w-3.5 h-3.5 text-[#22D3EE]" />
          <label htmlFor="hero-filter" className="whitespace-nowrap">
            Low-Pass Filter
          </label>
          <input
            id="hero-filter"
            type="range"
            min={260}
            max={6000}
            step={20}
            value={filterHz}
            onChange={(e) => setFilterHz(Number(e.target.value))}
            className="w-24 sm:w-28"
          />
          <span className="font-mono tabular-nums text-[#F8FAFC] w-14 text-right">{filterHz} Hz</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onClick={handleScrub}
        className="w-full h-[230px] block cursor-pointer"
        aria-label="Interactive audio and video timeline preview"
      />

      <div className="px-4 py-2.5 bg-[#0D0D14] border-t border-[#292938] flex items-center justify-between text-xs text-[#94A3B8]">
        <span>Click timeline to scrub playhead</span>
        <span className="inline-flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-[#22D3EE]" />
          Real Web Audio API DSP
        </span>
      </div>
    </div>
  );
}
