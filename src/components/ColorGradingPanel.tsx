import { BookmarkPlus, RotateCcw, SplitSquareHorizontal, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import { COLOR_GRADING_PRESETS } from '../engines/videoEngine';
import { useMixoraStore } from '../store/useMixoraStore';
import type { ColorGradingSettings } from '../types/mixora';

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

  const [tab, setTab] = useState<'presets' | 'basic' | 'advanced'>('presets');
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
    const val = Number(colorGrading[spec.key]);
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
        <div className="flex items-center gap-1 bg-[#09090D] p-1 rounded-md border border-[#292938]">
          {(['presets', 'basic', 'advanced'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap ${
                tab === t
                  ? 'bg-[#8B5CF6] text-[#F8FAFC]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
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
      <div className="flex-1 overflow-y-auto pt-3 space-y-4 pr-1">
        {tab === 'presets' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(COLOR_GRADING_PRESETS).map(([name, settings]) => {
                const active = colorGrading.filterPreset === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyPreset(name, settings)}
                    className={`px-3 py-2.5 rounded-md border text-left text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F8FAFC]'
                        : 'bg-[#1B1B27] border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#3F3F56]'
                    }`}
                  >
                    {name}
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
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md bg-[#8B5CF6] hover:bg-[#7C3AED] text-[#F8FAFC] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  Save
                </button>
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

        {tab === 'basic' && <div className="space-y-3">{BASIC_SLIDERS.map(renderSlider)}</div>}

        {tab === 'advanced' && <div className="space-y-3">{ADVANCED_SLIDERS.map(renderSlider)}</div>}
      </div>

      <p className="text-[11px] text-[#94A3B8] pt-3 mt-2 border-t border-[#292938] leading-relaxed">
        Pixel-accurate grading runs on Canvas2D so preview and exported video match identically.
      </p>
    </div>
  );
}
