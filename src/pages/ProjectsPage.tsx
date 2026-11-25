import {
  AlertTriangle,
  Copy,
  Download,
  Edit3,
  FolderOpen,
  HardDrive,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { ModalTransition, ScrollReveal } from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import {
  exportProjectFile,
  formatBytes,
  parseImportedProjectFile,
} from '../engines/storageEngine';
import { useMixoraStore } from '../store/useMixoraStore';

export function ProjectsPage() {
  const savedProjects = useMixoraStore((s) => s.savedProjects);
  const projectName = useMixoraStore((s) => s.projectName);
  const autosaveEnabled = useMixoraStore((s) => s.autosaveEnabled);
  const capabilities = useMixoraStore((s) => s.capabilities);
  const audioTracks = useMixoraStore((s) => s.audioTracks);
  const videoClips = useMixoraStore((s) => s.videoClips);

  const saveCurrentProjectLocally = useMixoraStore((s) => s.saveCurrentProjectLocally);
  const buildCurrentProjectSnapshot = useMixoraStore((s) => s.buildCurrentProjectSnapshot);
  const loadProjectIntoWorkspace = useMixoraStore((s) => s.loadProjectIntoWorkspace);
  const renameSavedProject = useMixoraStore((s) => s.renameSavedProject);
  const duplicateSavedProject = useMixoraStore((s) => s.duplicateSavedProject);
  const removeSavedProject = useMixoraStore((s) => s.removeSavedProject);
  const toggleAutosave = useMixoraStore((s) => s.toggleAutosave);
  const clearWorkspaceMedia = useMixoraStore((s) => s.clearWorkspaceMedia);
  const wipeAllLocalProjects = useMixoraStore((s) => s.wipeAllLocalProjects);
  const wipeAllCachedData = useMixoraStore((s) => s.wipeAllCachedData);
  const pushToast = useMixoraStore((s) => s.pushToast);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmAction, setConfirmAction] = useState<'workspace' | 'projects' | 'all' | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const proj = await parseImportedProjectFile(file);
      loadProjectIntoWorkspace(proj);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Unable to import project',
        detail: err instanceof Error ? err.message : 'Corrupted .mixora file.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const commitRename = async (id: string) => {
    if (draftName.trim()) {
      await renameSavedProject(id, draftName.trim());
    }
    setEditingId(null);
  };

  const executeConfirm = async () => {
    if (confirmAction === 'workspace') {
      clearWorkspaceMedia();
    } else if (confirmAction === 'projects') {
      await wipeAllLocalProjects();
    } else if (confirmAction === 'all') {
      await wipeAllCachedData();
    }
    setConfirmAction(null);
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#292938] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]">
            Local Projects & Storage
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Projects are saved exclusively to your browser IndexedDB or portable .mixora files.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".mixora,application/json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
          >
            <Upload className="w-3.5 h-3.5 text-[#22D3EE]" />
            Import .mixora
          </button>
          <button
            type="button"
            onClick={() => exportProjectFile(buildCurrentProjectSnapshot())}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
          >
            <Download className="w-3.5 h-3.5 text-[#8B5CF6]" />
            Export Current .mixora
          </button>
          <StudioButton
            variant="primary"
            size="sm"
            onClick={() => void saveCurrentProjectLocally()}
          >
            <Save className="w-3.5 h-3.5" />
            Save Current Session
          </StudioButton>
        </div>
      </div>

      {/* Active Workspace Bar */}
      <ScrollReveal className="bg-[#14141D] border border-[#292938] rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-[#94A3B8]">Current Open Workspace</p>
          <p className="text-base font-semibold text-[#F8FAFC] mt-0.5">{projectName}</p>
          <p className="text-xs text-[#94A3B8] mt-1 font-mono tabular-nums">
            {audioTracks.length} audio track(s) · {videoClips.length} video clip(s) in active memory
          </p>
        </div>

        <label className="inline-flex items-center gap-2.5 text-xs text-[#F8FAFC] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autosaveEnabled}
            onChange={(e) => void toggleAutosave(e.target.checked)}
            className="accent-[#8B5CF6] w-4 h-4 rounded"
          />
          Auto-save timeline metadata to local IndexedDB
        </label>
      </ScrollReveal>

      {/* Saved Projects List */}
      <ScrollReveal delay={0.05} className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#F8FAFC]">
            Saved Local Projects ({savedProjects.length})
          </h2>
          <span className="text-xs text-[#94A3B8] font-mono tabular-nums">
            Storage used: {formatBytes(capabilities?.storageUsageBytes)}
          </span>
        </div>

        {savedProjects.length === 0 ? (
          <div className="bg-[#14141D] border border-[#292938] rounded-lg p-10 text-center">
            <FolderOpen className="w-8 h-8 text-[#94A3B8] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#F8FAFC]">No local projects stored yet</p>
            <p className="text-xs text-[#94A3B8] mt-1 max-w-md mx-auto">
              Save any Audio Studio, Mashup, or Video Studio session locally. Media references are
              saved without embedding giant source files, keeping projects fast and portable.
            </p>
          </div>
        ) : (
          <div className="bg-[#14141D] border border-[#292938] rounded-lg divide-y divide-[#292938]">
            {savedProjects.map((proj) => (
              <div
                key={proj.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  {editingId === proj.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void commitRename(proj.id)}
                        autoFocus
                        className="bg-[#09090D] border border-[#8B5CF6] rounded px-2.5 py-1 text-sm text-[#F8FAFC]"
                      />
                      <button
                        type="button"
                        onClick={() => void commitRename(proj.id)}
                        className="px-2.5 py-1 rounded bg-[#8B5CF6] text-xs font-medium text-[#F8FAFC]"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-[#F8FAFC] truncate">{proj.name}</p>
                  )}
                  <p className="text-xs text-[#94A3B8] mt-1 font-mono tabular-nums">
                    {proj.type.toUpperCase()} · {proj.audioTracks.length} audio tracks ·{' '}
                    {proj.videoClips.length} video clips · Updated{' '}
                    {new Date(proj.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <StudioButton
                    variant="primary"
                    size="xs"
                    onClick={() => loadProjectIntoWorkspace(proj)}
                  >
                    Reopen
                  </StudioButton>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(proj.id);
                      setDraftName(proj.name);
                    }}
                    title="Rename project"
                    className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void duplicateSavedProject(proj.id)}
                    title="Duplicate project"
                    className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => exportProjectFile(proj)}
                    title="Export .mixora config"
                    className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#22D3EE]"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeSavedProject(proj.id)}
                    title="Delete project"
                    className="p-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#94A3B8] hover:text-[#F43F5E]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollReveal>

      {/* Privacy & Data Controls */}
      <ScrollReveal delay={0.08} className="bg-[#14141D] border border-[#292938] rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]">
          <HardDrive className="w-4 h-4 text-[#F59E0B]" />
          Privacy & Local Memory Controls
        </div>
        <p className="text-xs text-[#94A3B8] leading-relaxed">
          All media buffers live temporarily in browser RAM and saved projects stay strictly in
          local IndexedDB. Use these controls to immediately purge session memory or browser storage.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => setConfirmAction('workspace')}
            className="px-3.5 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC]"
          >
            Clear Workspace Memory
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('projects')}
            className="px-3.5 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F59E0B]"
          >
            Delete All Local Projects
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('all')}
            className="px-3.5 py-2 rounded-md bg-[#F43F5E]/15 hover:bg-[#F43F5E]/25 border border-[#F43F5E]/40 text-xs font-medium text-[#F43F5E]"
          >
            Clear All Cached Data
          </button>
        </div>
      </ScrollReveal>

      {/* Privacy Notice Confirmation Modal */}
      <ModalTransition open={confirmAction != null} onBackdropClick={() => setConfirmAction(null)}>
        <div className="bg-[#14141D] border border-[#292938] rounded-xl w-full p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />
            <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">
              Privacy & Data Clearance Notice
            </h3>
          </div>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            {confirmAction === 'workspace' &&
              'This releases all loaded audio buffers, video Blob URLs, and active edits from browser memory. Saved projects in IndexedDB are untouched.'}
            {confirmAction === 'projects' &&
              'This permanently deletes all saved MIXORA projects stored in this browser. Export any .mixora files you wish to keep before continuing.'}
            {confirmAction === 'all' &&
              'This clears your active workspace memory, all saved local projects, custom color presets, and browser preferences stored by MIXORA.'}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="px-4 py-2 rounded-md bg-[#1B1B27] hover:bg-[#292938] text-xs font-medium text-[#F8FAFC]"
            >
              Cancel
            </button>
            <StudioButton
              variant="danger"
              size="sm"
              onClick={() => void executeConfirm()}
            >
              Confirm Clear
            </StudioButton>
          </div>
        </div>
      </ModalTransition>
    </div>
  );
}
