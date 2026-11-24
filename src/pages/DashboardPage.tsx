import {
  AudioWaveform,
  Cpu,
  Disc3,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  Lock,
  Palette,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import { useRef } from 'react';
import {
  exportProjectFile,
  formatBytes,
  parseImportedProjectFile,
} from '../engines/storageEngine';
import { useMixoraStore } from '../store/useMixoraStore';

export function DashboardPage() {
  const navigate = useMixoraStore((s) => s.navigate);
  const savedProjects = useMixoraStore((s) => s.savedProjects);
  const capabilities = useMixoraStore((s) => s.capabilities);
  const clearWorkspaceMedia = useMixoraStore((s) => s.clearWorkspaceMedia);
  const setProjectMeta = useMixoraStore((s) => s.setProjectMeta);
  const loadProjectIntoWorkspace = useMixoraStore((s) => s.loadProjectIntoWorkspace);
  const removeSavedProject = useMixoraStore((s) => s.removeSavedProject);
  const pushToast = useMixoraStore((s) => s.pushToast);

  const importRef = useRef<HTMLInputElement | null>(null);

  const startNewProject = (type: 'audio' | 'video' | 'mashup') => {
    clearWorkspaceMedia();
    setProjectMeta(
      type === 'video'
        ? 'Untitled Video Edit'
        : type === 'mashup'
          ? 'Untitled Mashup'
          : 'Untitled Audio Session',
      type
    );
    navigate(type);
  };

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const proj = await parseImportedProjectFile(file);
      loadProjectIntoWorkspace(proj);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Project import failed',
        detail: err instanceof Error ? err.message : 'Invalid .mixora file.',
      });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Welcome & Quick Start */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#292938] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]">
            Creative Dashboard
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Launch a studio workspace or reopen a project stored locally in your browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".mixora,application/json"
            onChange={handleImportProject}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] text-xs font-medium text-[#F8FAFC] transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-[#22D3EE]" />
            Import .mixora
          </button>
          <button
            type="button"
            onClick={() => startNewProject('audio')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-medium text-[#F8FAFC] transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Audio Project
          </button>
        </div>
      </section>

      {/* Quick Start Actions */}
      <section className="space-y-4">
        <h2 className="font-display text-base font-semibold text-[#F8FAFC]">Quick Start</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => startNewProject('audio')}
            className="text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] rounded-lg p-5 transition-colors"
          >
            <AudioWaveform className="w-5 h-5 text-[#22D3EE] mb-3" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">Create Audio Project</h3>
            <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
              Multitrack waveforms, effects rack, mixer, WAV & MP3 export.
            </p>
          </button>

          <button
            type="button"
            onClick={() => startNewProject('video')}
            className="text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] rounded-lg p-5 transition-colors"
          >
            <Film className="w-5 h-5 text-[#8B5CF6] mb-3" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">Create Video Project</h3>
            <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
              Timeline editing, text titles, transitions, and color grading.
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate('dj')}
            className="text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] rounded-lg p-5 transition-colors"
          >
            <Disc3 className="w-5 h-5 text-[#3B82F6] mb-3" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">Open DJ Mixer</h3>
            <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
              Dual-deck live mixing with BPM sync, pitch, loops, and EQ.
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate('ai')}
            className="text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] rounded-lg p-5 transition-colors"
          >
            <Sparkles className="w-5 h-5 text-[#A3E635] mb-3" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">Open AI Lab</h3>
            <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
              BPM & key analyzer, vocal split, 4-band stems, frame extractor.
            </p>
          </button>
        </div>
      </section>

      {/* Audio Tools & Video Tools */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#14141D] border border-[#292938] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#F8FAFC]">Audio Tools</h2>
            <span className="text-xs text-[#94A3B8]">Web Audio DSP</span>
          </div>
          <div className="divide-y divide-[#292938]">
            {[
              {
                icon: Sliders,
                title: 'Smart Mashup Creator',
                desc: 'Compare two songs, match BPM & Camelot key, crossfade and export.',
                action: () => navigate('mashup'),
                cta: 'Open Mashup',
              },
              {
                icon: AudioWaveform,
                title: 'Multitrack Audio Editor',
                desc: 'Trim, split, reverse, apply EQ/reverb/compressor and bounce.',
                action: () => navigate('audio'),
                cta: 'Open Editor',
              },
              {
                icon: Wrench,
                title: 'Audio Converter & Normalizer',
                desc: 'Convert WAV/MP3, trim clips, merge files, and normalize loudness.',
                action: () => navigate('tools'),
                cta: 'Open Utilities',
              },
            ].map((tool) => {
              const Icon = tool.icon;
              return (
                <div key={tool.title} className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-[#22D3EE] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#F8FAFC]">{tool.title}</p>
                      <p className="text-xs text-[#94A3B8] mt-0.5">{tool.desc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={tool.action}
                    className="px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] whitespace-nowrap shrink-0 transition-colors"
                  >
                    {tool.cta}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#14141D] border border-[#292938] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#F8FAFC]">Video Tools</h2>
            <span className="text-xs text-[#94A3B8]">Canvas & Native Codecs</span>
          </div>
          <div className="divide-y divide-[#292938]">
            {[
              {
                icon: Palette,
                title: 'Professional Color Grading',
                desc: 'Exposure, temperature, Lift/Gamma/Gain, presets & before/after split.',
                action: () => navigate('video'),
                cta: 'Grade Video',
              },
              {
                icon: Film,
                title: 'Multi-Track Video Editor',
                desc: 'Trim, split, rotate, speed ramp, add text titles and export.',
                action: () => navigate('video'),
                cta: 'Open Editor',
              },
              {
                icon: Wrench,
                title: 'Video & Image Utilities',
                desc: 'Extract audio from video, capture thumbnails, resize and convert images.',
                action: () => navigate('tools'),
                cta: 'Open Utilities',
              },
            ].map((tool) => {
              const Icon = tool.icon;
              return (
                <div key={tool.title} className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-[#8B5CF6] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#F8FAFC]">{tool.title}</p>
                      <p className="text-xs text-[#94A3B8] mt-0.5">{tool.desc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={tool.action}
                    className="px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] whitespace-nowrap shrink-0 transition-colors"
                  >
                    {tool.cta}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recently Opened Local Projects */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#F8FAFC]">
            Recent Local Projects
          </h2>
          <button
            type="button"
            onClick={() => navigate('projects')}
            className="text-xs font-medium text-[#8B5CF6] hover:text-[#F8FAFC] transition-colors"
          >
            Manage All Local Projects
          </button>
        </div>

        {savedProjects.length === 0 ? (
          <div className="bg-[#14141D] border border-[#292938] rounded-lg p-8 text-center">
            <FolderOpen className="w-7 h-7 text-[#94A3B8] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#F8FAFC]">No saved projects on this device yet</p>
            <p className="text-xs text-[#94A3B8] mt-1 max-w-md mx-auto">
              Create an audio or video session and click &ldquo;Save Locally&rdquo;, or import an
              existing .mixora project file.
            </p>
          </div>
        ) : (
          <div className="bg-[#14141D] border border-[#292938] rounded-lg divide-y divide-[#292938]">
            {savedProjects.slice(0, 6).map((proj) => (
              <div
                key={proj.id}
                className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#F8FAFC] truncate">{proj.name}</p>
                  <p className="text-xs text-[#94A3B8] mt-0.5 font-mono tabular-nums">
                    {proj.type.toUpperCase()} · {proj.audioTracks.length} audio / {proj.videoClips.length} video · Updated{' '}
                    {new Date(proj.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => loadProjectIntoWorkspace(proj)}
                    className="px-3 py-1.5 rounded-md bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-medium text-[#F8FAFC] transition-colors"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => exportProjectFile(proj)}
                    title="Export .mixora file"
                    className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeSavedProject(proj.id)}
                    title="Remove from local browser storage"
                    className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F43F5E]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Capabilities, Storage & Privacy */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-[#14141D] border border-[#292938] rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]">
            <Cpu className="w-4 h-4 text-[#22D3EE]" />
            Browser Capabilities
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-[#94A3B8]">Web Audio API</dt>
              <dd className={capabilities?.webAudio ? 'text-[#A3E635]' : 'text-[#F43F5E]'}>
                {capabilities?.webAudio ? 'Supported' : 'Unavailable'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#94A3B8]">AudioWorklet</dt>
              <dd className={capabilities?.audioWorklet ? 'text-[#A3E635]' : 'text-[#F59E0B]'}>
                {capabilities?.audioWorklet ? 'Supported' : 'Fallback'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#94A3B8]">WebCodecs</dt>
              <dd className={capabilities?.webCodecs ? 'text-[#A3E635]' : 'text-[#94A3B8]'}>
                {capabilities?.webCodecs ? 'Supported' : 'Canvas Fallback'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#94A3B8]">Video Export Formats</dt>
              <dd className="text-[#F8FAFC] font-mono tabular-nums">
                {capabilities?.supportedVideoExports.length ?? 0} codecs
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-[#14141D] border border-[#292938] rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]">
            <HardDrive className="w-4 h-4 text-[#8B5CF6]" />
            Device Memory & Storage
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-[#94A3B8]">Logical CPU Cores</dt>
              <dd className="text-[#F8FAFC] font-mono tabular-nums">
                {capabilities?.hardwareConcurrency ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#94A3B8]">Device Memory Hint</dt>
              <dd className="text-[#F8FAFC] font-mono tabular-nums">
                {capabilities?.deviceMemoryGB ? `${capabilities.deviceMemoryGB} GB` : 'Browser Restricted'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#94A3B8]">Local Browser Storage Used</dt>
              <dd className="text-[#F8FAFC] font-mono tabular-nums">
                {formatBytes(capabilities?.storageUsageBytes)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#94A3B8]">Local Storage Quota</dt>
              <dd className="text-[#F8FAFC] font-mono tabular-nums">
                {formatBytes(capabilities?.storageQuotaBytes)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-[#14141D] border border-[#292938] rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]">
            <Lock className="w-4 h-4 text-[#A3E635]" />
            Local-Only Privacy
          </div>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            No account required. Audio, video, and project data remain exclusively on this device.
            Clearing your workspace immediately revokes Blob URLs and releases memory buffers.
          </p>
        </div>
      </section>
    </div>
  );
}
