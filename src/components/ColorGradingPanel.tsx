import { BookmarkPlus, Film, RotateCcw, SplitSquareHorizontal, Trash2, Undo2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import {
  COLOR_GRADING_PRESETS,
  COLOR_PRESET_SWATCHES,
  VIDEO_GRADIENT_OVERLAYS,
} from '../engines/videoEngine';
import { useMixoraStore } from '../store/useMixoraStore';
import type { ColorGradingSettings } from '../types/mixora';
import { STUDIO_EASE, TabContentTransition } from './MotionPrimitives';
import { StudioButton } from './StudioButton';

interface ColorGradingPanelProps {
  compareSplit: boolean;
  onToggleCompareSplit: () => void;
}

interface SliderSpec {
  key: keyof ColorGradingSettings;
  label: string;
  min: number;
  max: number;
  step?: number;
}

const BASIC_SLIDERS: SliderSpec[] = [
  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
  { key: 'whites', label: 'Whites', min: -100, max: 100 },
  { key: 'blacks', label: 'Blacks', min: -100, max: 100 },
];

const ADVANCED_SLIDERS: SliderSpec[] = [
  { key: 'redGain', label: 'Red Channel', min: -50, max: 50 },
  { key: 'greenGain', label: 'Green Channel', min: -50, max: 50 },
  { key: 'blueGain', label: 'Blue Channel', min: -50, max: 50 },
  { key: 'hue', label: 'Hue Shift', min: -180, max: 180 },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 },
  { key: 'lift', label: 'Lift', min: -50, max: 50 },
  { key: 'gamma', label: 'Gamma', min: 0.5, max: 2.0, step: 0.02 },
  { key: 'gain', label: 'Gain', min: 0.5, max: 2.0, step: 0.02 },
];

export function ColorGradingPanel({ compareSplit, onToggleCompareSplit }: ColorGradingPanelProps) {
  const colorGrading = useMixoraStore((s) => s.colorGrading);
  const historyLen = useMixoraStore((s) => s.colorGradingHistory.length);
  const customPresets = useMixoraStore((s) => s.customPresets);
  const setColorGrading = useMixoraStore((s) => s.setColorGrading);
  const undoColorGrading = useMixoraStore((s) => s.undoColorGrading);
  const resetColorGrading = useMixoraStore((s) => s.resetColorGrading);
  const saveCustomPreset = useMixoraStore((s) => s.saveCustomPreset);
  const removeCustomPreset = useMixoraStore((s) => s.removeCustomPreset);

  const [tab, setTab] = useState<'presets' | 'gradient' | 'basic' | 'advanced'>('presets');
  const [presetName, setPresetName] = useState('');

  const applyPreset = (name: string, settings: ColorGradingSettings) => {
    setColorGrading({ ...settings, filterPreset: name }, true);
    trackAnonymousEvent({ eventType: 'effect_used', feature: 'color_grading', effect: 'color_preset' });
  };

  const handleSaveCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    await saveCustomPreset(presetName.trim());
    setPresetName('');
  };

  const renderSlider = (spec: SliderSpec) => {
    const val = Number(colorGrading[spec.key] ?? 0);
    const step = spec.step ?? 1;
    return (
      <div key={spec.key} className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#94A3B8]">{spec.label}</span>
          <span className="font-mono tabular-nums text-[#F8FAFC]">
            {step < 1 ? val.toFixed(2) : val > 0 ? `+${val}` : val}
          </span>
        </div>
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={step}
          value={val}
          onChange={(e) =>
            setColorGrading({ [spec.key]: Number(e.target.value), filterPreset: 'Custom' }, false)
          }
          onPointerDown={() => setColorGrading({}, true)}
          className="w-full"
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header actions */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#292938]">
        <div className="flex items-center gap-0.5 bg-[#09090D] p-1 rounded-md border border-[#292938]">
          {(['presets', 'gradient', 'basic', 'advanced'] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`relative px-2 py-1 text-[11px] font-medium rounded capitalize transition-colors whitespace-nowrap ${
                  active ? 'text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="color-grading-tab-bg"
                    transition={{ duration: 0.2, ease: STUDIO_EASE }}
                    className="absolute inset-0 rounded bg-[#8B5CF6]"
                  />
                )}
                <span className="relative z-10">{t}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleCompareSplit}
            title="Toggle Before / After split preview"
            className={`p-1.5 rounded border text-xs transition-colors ${
              compareSplit
                ? 'bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE]'
                : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={undoColorGrading}
            disabled={historyLen === 0}
            title="Undo last color change"
            className="p-1.5 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetColorGrading}
            title="Reset all color grading"
            className="p-1.5 rounded bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F43F5E] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pt-3 pr-1">
        <TabContentTransition tabKey={tab} className="space-y-4">
          {tab === 'presets' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(COLOR_GRADING_PRESETS).map(([name, settings]) => {
                  const active = colorGrading.filterPreset === name;
                  const swatch = COLOR_PRESET_SWATCHES[name] ?? 'linear-gradient(135deg, #475569, #1E293B)';
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyPreset(name, settings)}
                      className={`p-2 rounded-lg border text-left transition-colors space-y-1.5 ${
                        active
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                          : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#3F3F56]'
                      }`}
                    >
                      <div
                        className="h-5 w-full rounded"
                        style={{ backgroundImage: swatch }}
                      />
                      <span className="block text-[11px] font-medium truncate">{name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-[#292938] space-y-2.5">
                <p className="text-xs font-medium text-[#F8FAFC]">Save Current Look Locally</p>
                <form onSubmit={handleSaveCustom} className="flex gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Preset name..."
                    maxLength={32}
                    className="flex-1 min-w-0 bg-[#09090D] border border-[#292938] rounded-md px-2.5 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B]"
                  />
                  <StudioButton type="submit" variant="primary" size="xs">
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Save
                  </StudioButton>
                </form>

                {customPresets.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs text-[#94A3B8]">Saved Local Presets</p>
                    {customPresets.map((cp) => (
                      <div
                        key={cp.id}
                        className="flex items-center justify-between gap-2 bg-[#1B1B27] border border-[#292938] rounded-md px-2.5 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => applyPreset(cp.name, cp.settings)}
                          className="text-xs text-[#F8FAFC] hover:text-[#22D3EE] truncate text-left flex-1"
                        >
                          {cp.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeCustomPreset(cp.id)}
                          aria-label={`Delete preset ${cp.name}`}
                          className="text-[#94A3B8] hover:text-[#F43F5E] p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'gradient' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#F8FAFC]">Color Gradient LUT Tint</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(VIDEO_GRADIENT_OVERLAYS).map(([key, spec]) => {
                    const active = (colorGrading.gradientPreset ?? 'none') === key;
                    const bg = spec.stops[2]
                      ? `linear-gradient(135deg, ${spec.stops[0]}, ${spec.stops[1]}, ${spec.stops[2]})`
                      : `linear-gradient(135deg, ${spec.stops[0]}, ${spec.stops[1]})`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setColorGrading(
                            {
                              gradientPreset: key,
                              gradientOpacity:
                                key === 'none'
                                  ? 0
                                  : Math.max(24, colorGrading.gradientOpacity ?? 30),
                              filterPreset: 'Custom',
                            },
                            true
                          )
                        }
                        className={`p-2 rounded-lg border text-left space-y-1.5 transition-colors ${
                          active
                            ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                            : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        <div className="h-5 rounded w-full" style={{ backgroundImage: bg }} />
                        <span className="block text-[11px] font-medium truncate">{spec.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#94A3B8]">Gradient Blend Opacity</span>
                  <span className="font-mono tabular-nums text-[#F8FAFC]">
                    {colorGrading.gradientOpacity ?? 0}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={1}
                  value={colorGrading.gradientOpacity ?? 0}
                  onChange={(e) =>
                    setColorGrading({ gradientOpacity: Number(e.target.value), filterPreset: 'Custom' }, false)
                  }
                  onPointerDown={() => setColorGrading({}, true)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#292938]">
                <div className="flex justify-between text-xs">
                  <span className="text-[#94A3B8]">Cinema Vignette</span>
                  <span className="font-mono tabular-nums text-[#F8FAFC]">
                    {colorGrading.vignette ?? 0}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={colorGrading.vignette ?? 0}
                  onChange={(e) =>
                    setColorGrading({ vignette: Number(e.target.value), filterPreset: 'Custom' }, false)
                  }
                  onPointerDown={() => setColorGrading({}, true)}
                  className="w-full"
                />
              </div>

              <label className="flex items-center justify-between pt-2 border-t border-[#292938] text-xs text-[#F8FAFC] cursor-pointer">
                <span className="inline-flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  Anamorphic 2.39:1 Cinema Bars
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(colorGrading.cinemaBars)}
                  onChange={(e) => setColorGrading({ cinemaBars: e.target.checked }, true)}
                  className="accent-[#8B5CF6] w-4 h-4"
                />
              </label>
            </div>
          )}

          {tab === 'basic' && <div className="space-y-3">{BASIC_SLIDERS.map(renderSlider)}</div>}

          {tab === 'advanced' && <div className="space-y-3">{ADVANCED_SLIDERS.map(renderSlider)}</div>}
        </TabContentTransition>
      </div>

      <p className="text-[11px] text-[#94A3B8] pt-3 mt-2 border-t border-[#292938] leading-relaxed">
        Pixel-accurate grading, gradient LUTs, vignette & cinema bars bake identically into exported video.
      </p>
    </div>
  );
}
