import { Disc3, Pause, Play, RefreshCw, Repeat, Upload, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ScrollReveal, StaggerGroup, StaggerItem } from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import { WaveformCanvas } from '../components/WaveformCanvas';
import { analyzeAudioBuffer } from '../engines/audioAnalysis';
import {
  decodeAudioFile,
  extractWaveformPeaks,
  generateProceduralDemoTrack,
  getAudioContext,
} from '../engines/audioEngine';
import { useMixoraStore } from '../store/useMixoraStore';

interface DeckState {
  name: string;
  buffer: AudioBuffer | null;
  peaks: number[];
  baseBpm: number;
  keyLabel: string;
  playing: boolean;
  position: number;
  cuePoint: number;
  pitchPct: number; // -16 to +16
  volume: number; // 0 to 1.2
  loopBeats: 0 | 4 | 8 | 16;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

interface DeckAudioNodes {
  source: AudioBufferSourceNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  deckGain: GainNode;
  crossGain: GainNode;
  startedAtCtx: number;
  startedAtPos: number;
}

const INITIAL_DECK: DeckState = {
  name: 'Empty Deck',
  buffer: null,
  peaks: [],
  baseBpm: 124,
  keyLabel: '—',
  playing: false,
  position: 0,
  cuePoint: 0,
  pitchPct: 0,
  volume: 1,
  loopBeats: 0,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
};

export function DJMixerPage() {
  const pushToast = useMixoraStore((s) => s.pushToast);

  const [deckA, setDeckA] = useState<DeckState>(INITIAL_DECK);
  const [deckB, setDeckB] = useState<DeckState>(INITIAL_DECK);
  const [crossfader, setCrossfader] = useState(0); // -1 (Full A) to +1 (Full B)
  const [masterVolume, setMasterVolume] = useState(0.9);
  const [vuLevel, setVuLevel] = useState(0);

  const inputARef = useRef<HTMLInputElement | null>(null);
  const inputBRef = useRef<HTMLInputElement | null>(null);
  const nodesARef = useRef<DeckAudioNodes | null>(null);
  const nodesBRef = useRef<DeckAudioNodes | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const ensureMasterBus = () => {
    const ctx = getAudioContext();
    if (!masterGainRef.current || masterGainRef.current.context !== ctx) {
      const mg = ctx.createGain();
      mg.gain.value = masterVolume;
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      mg.connect(an);
      an.connect(ctx.destination);
      masterGainRef.current = mg;
      analyserRef.current = an;
    }
    return { ctx, masterGain: masterGainRef.current, analyser: analyserRef.current! };
  };

  const stopDeckNode = (which: 'A' | 'B') => {
    const ref = which === 'A' ? nodesARef : nodesBRef;
    const node = ref.current;
    if (!node) return;
    try {
      node.source.stop();
      node.source.disconnect();
      node.crossGain.disconnect();
    } catch {
      // already stopped
    }
    ref.current = null;
  };

  useEffect(() => {
    return () => {
      stopDeckNode('A');
      stopDeckNode('B');
    };
  }, []);

  // Update crossfader, master gain, EQ, and playback rate live
  useEffect(() => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(masterVolume, now, 0.02);
    }

    // Equal-power crossfade gains
    const norm = (crossfader + 1) / 2; // 0 -> A, 1 -> B
    const gainA = Math.cos(norm * Math.PI * 0.5);
    const gainB = Math.sin(norm * Math.PI * 0.5);

    if (nodesARef.current) {
      const n = nodesARef.current;
      n.crossGain.gain.setTargetAtTime(gainA, now, 0.015);
      n.deckGain.gain.setTargetAtTime(deckA.volume, now, 0.015);
      n.eqLow.gain.setTargetAtTime(deckA.eqLow, now, 0.02);
      n.eqMid.gain.setTargetAtTime(deckA.eqMid, now, 0.02);
      n.eqHigh.gain.setTargetAtTime(deckA.eqHigh, now, 0.02);
      n.source.playbackRate.setTargetAtTime(1 + deckA.pitchPct / 100, now, 0.02);
    }

    if (nodesBRef.current) {
      const n = nodesBRef.current;
      n.crossGain.gain.setTargetAtTime(gainB, now, 0.015);
      n.deckGain.gain.setTargetAtTime(deckB.volume, now, 0.015);
      n.eqLow.gain.setTargetAtTime(deckB.eqLow, now, 0.02);
      n.eqMid.gain.setTargetAtTime(deckB.eqMid, now, 0.02);
      n.eqHigh.gain.setTargetAtTime(deckB.eqHigh, now, 0.02);
      n.source.playbackRate.setTargetAtTime(1 + deckB.pitchPct / 100, now, 0.02);
    }
  }, [crossfader, masterVolume, deckA.volume, deckA.eqLow, deckA.eqMid, deckA.eqHigh, deckA.pitchPct, deckB.volume, deckB.eqLow, deckB.eqMid, deckB.eqHigh, deckB.pitchPct]);

  // Animation loop for deck positions & master VU
  useEffect(() => {
    let raf = 0;
    const data = new Uint8Array(256);

    const tick = () => {
      if (analyserRef.current) {
        analyserRef.current.getByteTimeDomainData(data);
        let max = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128) / 128;
          if (v > max) max = v;
        }
        setVuLevel(Math.min(1, max * 1.4));
      }

      if (nodesARef.current) {
        const n = nodesARef.current;
        const rate = n.source.playbackRate.value;
        const pos = n.startedAtPos + (n.source.context.currentTime - n.startedAtCtx) * rate;
        setDeckA((d) => {
          if (!d.buffer) return d;
          if (pos >= d.buffer.duration && !n.source.loop) {
            stopDeckNode('A');
            return { ...d, playing: false, position: 0 };
          }
          return { ...d, position: pos % d.buffer.duration };
        });
      }

      if (nodesBRef.current) {
        const n = nodesBRef.current;
        const rate = n.source.playbackRate.value;
        const pos = n.startedAtPos + (n.source.context.currentTime - n.startedAtCtx) * rate;
        setDeckB((d) => {
          if (!d.buffer) return d;
          if (pos >= d.buffer.duration && !n.source.loop) {
            stopDeckNode('B');
            return { ...d, playing: false, position: 0 };
          }
          return { ...d, position: pos % d.buffer.duration };
        });
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const startDeck = (which: 'A' | 'B', startPos?: number) => {
    const deck = which === 'A' ? deckA : deckB;
    const setDeck = which === 'A' ? setDeckA : setDeckB;
    const ref = which === 'A' ? nodesARef : nodesBRef;
    if (!deck.buffer) return;

    stopDeckNode(which);
    const { ctx, masterGain } = ensureMasterBus();

    const source = ctx.createBufferSource();
    source.buffer = deck.buffer;
    const rate = 1 + deck.pitchPct / 100;
    source.playbackRate.value = rate;

    const pos = startPos != null ? Math.max(0, Math.min(deck.buffer.duration - 0.05, startPos)) : deck.position;

    if (deck.loopBeats > 0) {
      const beatSec = 60 / Math.max(60, deck.baseBpm);
      source.loop = true;
      source.loopStart = pos;
      source.loopEnd = Math.min(deck.buffer.duration, pos + deck.loopBeats * beatSec);
    }

    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 250;
    eqLow.gain.value = deck.eqLow;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1100;
    eqMid.gain.value = deck.eqMid;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 4500;
    eqHigh.gain.value = deck.eqHigh;

    const deckGain = ctx.createGain();
    deckGain.gain.value = deck.volume;

    const norm = (crossfader + 1) / 2;
    const crossGain = ctx.createGain();
    crossGain.gain.value = which === 'A' ? Math.cos(norm * Math.PI * 0.5) : Math.sin(norm * Math.PI * 0.5);

    source.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(deckGain);
    deckGain.connect(crossGain);
    crossGain.connect(masterGain);

    source.start(0, pos);
    ref.current = {
      source,
      eqLow,
      eqMid,
      eqHigh,
      deckGain,
      crossGain,
      startedAtCtx: ctx.currentTime,
      startedAtPos: pos,
    };
    setDeck((d) => ({ ...d, playing: true, position: pos }));
  };

  const toggleDeckPlay = (which: 'A' | 'B') => {
    const deck = which === 'A' ? deckA : deckB;
    const setDeck = which === 'A' ? setDeckA : setDeckB;
    if (!deck.buffer) {
      pushToast({ type: 'warning', title: `Load a track onto Deck ${which} first` });
      return;
    }
    if (deck.playing) {
      stopDeckNode(which);
      setDeck((d) => ({ ...d, playing: false }));
    } else {
      startDeck(which);
    }
  };

  const handleCue = (which: 'A' | 'B') => {
    const deck = which === 'A' ? deckA : deckB;
    const setDeck = which === 'A' ? setDeckA : setDeckB;
    if (!deck.buffer) return;
    if (!deck.playing) {
      setDeck((d) => ({ ...d, cuePoint: d.position }));
      pushToast({ type: 'info', title: `Deck ${which} Cue set at ${deck.position.toFixed(1)}s` });
    } else {
      startDeck(which, deck.cuePoint);
    }
  };

  const handleSync = (which: 'A' | 'B') => {
    const src = which === 'A' ? deckA : deckB;
    const other = which === 'A' ? deckB : deckA;
    const setSrc = which === 'A' ? setDeckA : setDeckB;
    if (!src.buffer || !other.buffer) return;
    const otherEffBpm = other.baseBpm * (1 + other.pitchPct / 100);
    const neededPct = ((otherEffBpm / src.baseBpm) - 1) * 100;
    const clamped = Math.max(-16, Math.min(16, Number(neededPct.toFixed(1))));
    setSrc((d) => ({ ...d, pitchPct: clamped }));
    pushToast({
      type: 'success',
      title: `Deck ${which} synced to ${otherEffBpm.toFixed(1)} BPM`,
    });
  };

  const loadDeckFile = async (which: 'A' | 'B', file?: File) => {
    if (!file) return;
    try {
      const buffer = await decodeAudioFile(file);
      await loadBufferToDeck(which, file.name.replace(/\.[^.]+$/, ''), buffer);
    } catch (err) {
      pushToast({
        type: 'error',
        title: `Deck ${which} load failed`,
        detail: err instanceof Error ? err.message : 'Unsupported format.',
      });
    }
  };

  const loadBufferToDeck = async (which: 'A' | 'B', name: string, buffer: AudioBuffer) => {
    stopDeckNode(which);
    const peaks = extractWaveformPeaks(buffer, 460);
    const analysis = await analyzeAudioBuffer(buffer);
    const setDeck = which === 'A' ? setDeckA : setDeckB;
    setDeck({
      ...INITIAL_DECK,
      name,
      buffer,
      peaks,
      baseBpm: analysis.bpm,
      keyLabel: `${analysis.key} (${analysis.camelot})`,
    });
  };

  const loadDemoDecks = async () => {
    const [a, b] = await Promise.all([
      generateProceduralDemoTrack('electronic_124'),
      generateProceduralDemoTrack('house_126'),
    ]);
    await Promise.all([loadBufferToDeck('A', a.name, a.buffer), loadBufferToDeck('B', b.name, b.buffer)]);
    pushToast({ type: 'success', title: 'Loaded 2 synced studio grooves onto Deck A & B' });
  };

  const autoTransition = (target: -1 | 1) => {
    const startVal = crossfader;
    const startTs = performance.now();
    const durationMs = 2400;
    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / durationMs);
      setCrossfader(startVal + (target - startVal) * t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const renderDeck = (which: 'A' | 'B') => {
    const deck = which === 'A' ? deckA : deckB;
    const setDeck = which === 'A' ? setDeckA : setDeckB;
    const inputRef = which === 'A' ? inputARef : inputBRef;
    const accent = which === 'A' ? '#22D3EE' : '#8B5CF6';
    const effBpm = (deck.baseBpm * (1 + deck.pitchPct / 100)).toFixed(1);

    return (
      <div className="bg-[#14141D] border border-[#292938] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs font-semibold" style={{ color: accent }}>
              DECK {which}
            </span>
            <h2 className="text-sm font-semibold text-[#F8FAFC] truncate">{deck.name}</h2>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*"
            onChange={(e) => void loadDeckFile(which, e.target.files?.[0])}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            Load
          </button>
        </div>

        {/* Platter + Readout */}
        <div className="flex items-center gap-4 bg-[#09090D] border border-[#292938] rounded-lg p-3.5">
          <div
            className={`w-20 h-20 rounded-full border-2 flex items-center justify-center shrink-0 transition-transform ${
              deck.playing ? 'animate-spin' : ''
            }`}
            style={{
              borderColor: accent,
              animationDuration: '3s',
              background: 'radial-gradient(circle, #1B1B27 25%, #09090D 68%)',
            }}
          >
            <Disc3 className="w-8 h-8 text-[#94A3B8]" />
          </div>

          <div className="flex-1 min-w-0 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-[#94A3B8]">BPM</p>
              <p className="font-mono tabular-nums text-lg font-bold text-[#F8FAFC]">{effBpm}</p>
            </div>
            <div>
              <p className="text-[#94A3B8]">Pitch</p>
              <p className="font-mono tabular-nums text-sm font-semibold text-[#22D3EE]">
                {deck.pitchPct > 0 ? `+${deck.pitchPct.toFixed(1)}%` : `${deck.pitchPct.toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="text-[#94A3B8]">Key</p>
              <p className="font-mono text-xs text-[#F8FAFC] truncate">{deck.keyLabel}</p>
            </div>
            <div>
              <p className="text-[#94A3B8]">Time</p>
              <p className="font-mono tabular-nums text-xs text-[#F8FAFC]">
                {deck.position.toFixed(1)}s / {(deck.buffer?.duration ?? 0).toFixed(1)}s
              </p>
            </div>
          </div>
        </div>

        {/* Waveform */}
        <WaveformCanvas
          peaks={deck.peaks}
          duration={deck.buffer?.duration ?? 1}
          currentTime={deck.position}
          color={accent}
          height={64}
          onSeek={(t) => {
            setDeck((d) => ({ ...d, position: t }));
            if (deck.playing) startDeck(which, t);
          }}
        />

        {/* Transport & Loop Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <StudioButton
            variant={which === 'A' ? 'audio' : 'primary'}
            size="sm"
            onClick={() => toggleDeckPlay(which)}
          >
            {deck.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {deck.playing ? 'Pause' : 'Play'}
          </StudioButton>
          <button
            type="button"
            onClick={() => handleCue(which)}
            className="px-3 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-semibold text-[#F59E0B]"
          >
            CUE
          </button>
          <button
            type="button"
            onClick={() => handleSync(which)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
          >
            <RefreshCw className="w-3 h-3 text-[#A3E635]" />
            SYNC
          </button>

          <div className="ml-auto flex items-center gap-1">
            {([0, 4, 8, 16] as const).map((beats) => (
              <button
                key={beats}
                type="button"
                onClick={() => {
                  setDeck((d) => ({ ...d, loopBeats: beats }));
                  if (deck.playing) setTimeout(() => startDeck(which), 10);
                }}
                className={`px-2 py-1.5 rounded text-[11px] font-mono border ${
                  deck.loopBeats === beats
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                    : 'bg-[#09090D] border-[#292938] text-[#94A3B8]'
                }`}
              >
                {beats === 0 ? 'OFF' : `${beats}B`}
              </button>
            ))}
            <Repeat className="w-3.5 h-3.5 text-[#94A3B8] ml-1" />
          </div>
        </div>

        {/* Pitch & 3-Band EQ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#292938]">
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#94A3B8]">Tempo / Pitch</span>
                <span className="font-mono tabular-nums">{deck.pitchPct.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={-16}
                max={16}
                step={0.1}
                value={deck.pitchPct}
                onChange={(e) => setDeck((d) => ({ ...d, pitchPct: Number(e.target.value) }))}
                className="w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#94A3B8]">Deck Volume</span>
                <span className="font-mono tabular-nums">{Math.round(deck.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.01}
                value={deck.volume}
                onChange={(e) => setDeck((d) => ({ ...d, volume: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            {[
              { key: 'eqHigh' as const, label: 'EQ High' },
              { key: 'eqMid' as const, label: 'EQ Mid' },
              { key: 'eqLow' as const, label: 'EQ Low' },
            ].map((eq) => (
              <div key={eq.key} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#94A3B8]">{eq.label}</span>
                  <span className="font-mono tabular-nums">
                    {deck[eq.key] > 0 ? `+${deck[eq.key]}` : deck[eq.key]} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-24}
                  max={12}
                  step={1}
                  value={deck[eq.key]}
                  onChange={(e) => setDeck((d) => ({ ...d, [eq.key]: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#292938] pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]">
            Dual-Deck DJ Mixer
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Real-time Web Audio dual-deck console with BPM sync, loops, 3-band EQ, and equal-power crossfader.
          </p>
        </div>

        <StudioButton
          variant="primary"
          size="sm"
          onClick={() => void loadDemoDecks()}
          className="self-start sm:self-auto"
        >
          Load Demo DJ Tracks (A + B)
        </StudioButton>
      </div>

      {/* Decks */}
      <StaggerGroup className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StaggerItem>{renderDeck('A')}</StaggerItem>
        <StaggerItem>{renderDeck('B')}</StaggerItem>
      </StaggerGroup>

      {/* Master Crossfader & Transitions Console */}
      <ScrollReveal className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Master Volume & VU */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-[#F8FAFC] font-medium">
                <Volume2 className="w-4 h-4 text-[#22D3EE]" />
                Master Output
              </span>
              <span className="font-mono tabular-nums text-[#94A3B8]">
                {Math.round(masterVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1.3}
              step={0.01}
              value={masterVolume}
              onChange={(e) => setMasterVolume(Number(e.target.value))}
              className="w-full"
            />
            <div className="h-2 bg-[#09090D] rounded overflow-hidden border border-[#292938]">
              <div
                className="h-full transition-all duration-75"
                style={{
                  width: `${Math.round(vuLevel * 100)}%`,
                  backgroundColor: vuLevel > 0.85 ? '#F43F5E' : vuLevel > 0.6 ? '#F59E0B' : '#A3E635',
                }}
              />
            </div>
          </div>

          {/* Center Crossfader */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-[#22D3EE]">DECK A</span>
              <span className="text-[#94A3B8] font-mono">CROSSFADER</span>
              <span className="text-[#8B5CF6]">DECK B</span>
            </div>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={crossfader}
              onChange={(e) => setCrossfader(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setCrossfader(0)}
                className="text-[11px] text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                Center (50 / 50)
              </button>
            </div>
          </div>

          {/* Auto-Transition Controls */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => autoTransition(-1)}
              className="px-3.5 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#22D3EE]"
            >
              Smooth Fade → A
            </button>
            <button
              type="button"
              onClick={() => autoTransition(1)}
              className="px-3.5 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#8B5CF6]"
            >
              Smooth Fade → B
            </button>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
