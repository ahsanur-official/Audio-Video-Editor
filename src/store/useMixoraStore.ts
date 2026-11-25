import { create } from 'zustand';
import { trackAnonymousEvent } from '../engines/analyticsClient';
import {
  clearAllCachedStudioData,
  deleteAllLocalProjects,
  deleteCustomColorPreset,
  deleteLocalProject,
  getLocalSetting,
  listCustomColorPresets,
  listLocalProjects,
  probeBrowserCapabilities,
  saveCustomColorPreset,
  saveLocalProject,
  setLocalSetting,
} from '../engines/storageEngine';
import type {
  AudioTrackModel,
  BrowserCapabilities,
  ColorGradingSettings,
  CustomColorPreset,
  MixoraProject,
  RouteId,
  TimelineMarker,
  ToastMessage,
  VideoClipModel,
  VideoOverlayModel,
} from '../types/mixora';
import { DEFAULT_COLOR_GRADING } from '../types/mixora';

interface MixoraState {
  route: RouteId;
  projectId: string;
  projectName: string;
  projectType: 'audio' | 'video' | 'mashup';
  masterVolume: number;

  // Audio workspace
  audioTracks: AudioTrackModel[];
  audioMarkers: TimelineMarker[];
  selectedAudioTrackId: string | null;

  // Video workspace
  videoClips: VideoClipModel[];
  videoOverlays: VideoOverlayModel[];
  videoMarkers: TimelineMarker[];
  selectedVideoClipId: string | null;
  colorGrading: ColorGradingSettings;
  colorGradingHistory: ColorGradingSettings[];

  // Local persistence
  savedProjects: MixoraProject[];
  customPresets: CustomColorPreset[];
  autosaveEnabled: boolean;
  capabilities: BrowserCapabilities | null;
  toasts: ToastMessage[];
  sidebarCollapsed: boolean;

  // Actions
  navigate: (route: RouteId) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  initApp: () => Promise<void>;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;

  setProjectMeta: (name: string, type?: 'audio' | 'video' | 'mashup') => void;
  setMasterVolume: (vol: number) => void;

  // Audio actions
  addAudioTrack: (track: AudioTrackModel) => void;
  updateAudioTrack: (id: string, patch: Partial<AudioTrackModel>) => void;
  removeAudioTrack: (id: string) => void;
  reorderAudioTrack: (id: string, direction: 'up' | 'down') => void;
  setSelectedAudioTrackId: (id: string | null) => void;
  addAudioMarker: (marker: TimelineMarker) => void;
  removeAudioMarker: (id: string) => void;

  // Video & Color actions
  addVideoClip: (clip: VideoClipModel) => void;
  updateVideoClip: (id: string, patch: Partial<VideoClipModel>) => void;
  removeVideoClip: (id: string) => void;
  setSelectedVideoClipId: (id: string | null) => void;
  addVideoOverlay: (overlay: VideoOverlayModel) => void;
  updateVideoOverlay: (id: string, patch: Partial<VideoOverlayModel>) => void;
  removeVideoOverlay: (id: string) => void;
  addVideoMarker: (marker: TimelineMarker) => void;
  removeVideoMarker: (id: string) => void;
  setColorGrading: (patch: Partial<ColorGradingSettings>, recordHistory?: boolean) => void;
  undoColorGrading: () => void;
  resetColorGrading: () => void;

  // Presets & Projects
  saveCustomPreset: (name: string) => Promise<void>;
  removeCustomPreset: (id: string) => Promise<void>;
  buildCurrentProjectSnapshot: () => MixoraProject;
  saveCurrentProjectLocally: () => Promise<void>;
  loadProjectIntoWorkspace: (project: MixoraProject) => void;
  renameSavedProject: (id: string, name: string) => Promise<void>;
  duplicateSavedProject: (id: string) => Promise<void>;
  removeSavedProject: (id: string) => Promise<void>;
  toggleAutosave: (enabled: boolean) => Promise<void>;
  clearWorkspaceMedia: () => void;
  wipeAllLocalProjects: () => Promise<void>;
  wipeAllCachedData: () => Promise<void>;
}

function routeFromPathname(): RouteId {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const map: Record<string, RouteId> = {
    '': 'home',
    home: 'home',
    dashboard: 'dashboard',
    audio: 'audio',
    'audio-studio': 'audio',
    mashup: 'mashup',
    dj: 'dj',
    'dj-mixer': 'dj',
    video: 'video',
    'video-studio': 'video',
    ai: 'ai',
    'ai-lab': 'ai',
    tools: 'tools',
    'media-tools': 'tools',
    projects: 'projects',
    about: 'about',
    admin: 'admin',
  };
  return map[path] ?? 'home';
}

const ROUTE_TO_FEATURE: Partial<Record<RouteId, Parameters<typeof trackAnonymousEvent>[0]['feature']>> = {
  home: 'home',
  dashboard: 'dashboard',
  audio: 'audio_studio',
  mashup: 'mashup_creator',
  dj: 'dj_mixer',
  video: 'video_studio',
  ai: 'ai_lab',
  tools: 'media_tools',
  projects: 'projects',
};

export const useMixoraStore = create<MixoraState>((set, get) => ({
  route: routeFromPathname(),
  projectId: crypto.randomUUID(),
  projectName: 'Untitled Studio Session',
  projectType: 'audio',
  masterVolume: 0.9,

  audioTracks: [],
  audioMarkers: [],
  selectedAudioTrackId: null,

  videoClips: [],
  videoOverlays: [],
  videoMarkers: [],
  selectedVideoClipId: null,
  colorGrading: { ...DEFAULT_COLOR_GRADING },
  colorGradingHistory: [],

  savedProjects: [],
  customPresets: [],
  autosaveEnabled: false,
  capabilities: null,
  toasts: [],
  sidebarCollapsed:
    typeof window !== 'undefined' && window.localStorage.getItem('mixora_sidebar_collapsed') === 'true',

  toggleSidebarCollapsed: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('mixora_sidebar_collapsed', String(next));
        } catch {
          // ignore storage quota errors
        }
      }
      return { sidebarCollapsed: next };
    }),

  setSidebarCollapsed: (collapsed) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('mixora_sidebar_collapsed', String(collapsed));
      } catch {
        // ignore
      }
    }
    set({ sidebarCollapsed: collapsed });
  },

  navigate: (route) => {
    set({ route });
    if (typeof window !== 'undefined') {
      const targetPath = route === 'home' ? '/' : `/${route}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ route }, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    const feature = ROUTE_TO_FEATURE[route];
    if (feature) {
      trackAnonymousEvent({
        eventType: route === 'home' ? 'visit' : 'studio_session',
        feature,
      });
    }
  },

  initApp: async () => {
    if (typeof window !== 'undefined') {
      window.onpopstate = () => {
        set({ route: routeFromPathname() });
      };
    }

    const [caps, projects, presets, autosave] = await Promise.all([
      probeBrowserCapabilities(),
      listLocalProjects().catch(() => []),
      listCustomColorPresets().catch(() => []),
      getLocalSetting<boolean>('autosaveEnabled', false),
    ]);

    set({
      capabilities: caps,
      savedProjects: projects,
      customPresets: presets,
      autosaveEnabled: autosave,
    });

    const initialFeature = ROUTE_TO_FEATURE[get().route];
    if (initialFeature) {
      trackAnonymousEvent({ eventType: 'visit', feature: initialFeature });
    }
  },

  pushToast: (toast) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4500);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setProjectMeta: (name, type) =>
    set((s) => ({
      projectName: name,
      projectType: type ?? s.projectType,
    })),

  setMasterVolume: (masterVolume) => set({ masterVolume }),

  addAudioTrack: (track) => {
    set((s) => ({
      audioTracks: [...s.audioTracks, track],
      selectedAudioTrackId: track.id,
    }));
    if (get().autosaveEnabled) void get().saveCurrentProjectLocally();
  },

  updateAudioTrack: (id, patch) => {
    set((s) => ({
      audioTracks: s.audioTracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  },

  removeAudioTrack: (id) =>
    set((s) => {
      const remaining = s.audioTracks.filter((t) => t.id !== id);
      return {
        audioTracks: remaining,
        selectedAudioTrackId:
          s.selectedAudioTrackId === id ? (remaining[0]?.id ?? null) : s.selectedAudioTrackId,
      };
    }),

  reorderAudioTrack: (id, direction) =>
    set((s) => {
      const idx = s.audioTracks.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= s.audioTracks.length) return s;
      const next = [...s.audioTracks];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { audioTracks: next };
    }),

  setSelectedAudioTrackId: (selectedAudioTrackId) => set({ selectedAudioTrackId }),

  addAudioMarker: (marker) => set((s) => ({ audioMarkers: [...s.audioMarkers, marker] })),

  removeAudioMarker: (id) =>
    set((s) => ({ audioMarkers: s.audioMarkers.filter((m) => m.id !== id) })),

  addVideoClip: (clip) => {
    set((s) => ({
      videoClips: [...s.videoClips, clip],
      selectedVideoClipId: clip.id,
      projectType: 'video',
    }));
    if (get().autosaveEnabled) void get().saveCurrentProjectLocally();
  },

  updateVideoClip: (id, patch) =>
    set((s) => ({
      videoClips: s.videoClips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  removeVideoClip: (id) =>
    set((s) => {
      const target = s.videoClips.find((c) => c.id === id);
      if (target?.objectUrl) URL.revokeObjectURL(target.objectUrl);
      const remaining = s.videoClips.filter((c) => c.id !== id);
      return {
        videoClips: remaining,
        selectedVideoClipId:
          s.selectedVideoClipId === id ? (remaining[0]?.id ?? null) : s.selectedVideoClipId,
      };
    }),

  setSelectedVideoClipId: (selectedVideoClipId) => set({ selectedVideoClipId }),

  addVideoOverlay: (overlay) =>
    set((s) => ({ videoOverlays: [...s.videoOverlays, overlay] })),

  updateVideoOverlay: (id, patch) =>
    set((s) => ({
      videoOverlays: s.videoOverlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),

  removeVideoOverlay: (id) =>
    set((s) => ({ videoOverlays: s.videoOverlays.filter((o) => o.id !== id) })),

  addVideoMarker: (marker) => set((s) => ({ videoMarkers: [...s.videoMarkers, marker] })),

  removeVideoMarker: (id) =>
    set((s) => ({ videoMarkers: s.videoMarkers.filter((m) => m.id !== id) })),

  setColorGrading: (patch, recordHistory = true) =>
    set((s) => ({
      colorGradingHistory: recordHistory
        ? [...s.colorGradingHistory.slice(-19), s.colorGrading]
        : s.colorGradingHistory,
      colorGrading: { ...s.colorGrading, ...patch },
    })),

  undoColorGrading: () =>
    set((s) => {
      if (s.colorGradingHistory.length === 0) return s;
      const prev = s.colorGradingHistory[s.colorGradingHistory.length - 1];
      return {
        colorGrading: prev,
        colorGradingHistory: s.colorGradingHistory.slice(0, -1),
      };
    }),

  resetColorGrading: () =>
    set((s) => ({
      colorGradingHistory: [...s.colorGradingHistory.slice(-19), s.colorGrading],
      colorGrading: { ...DEFAULT_COLOR_GRADING },
    })),

  saveCustomPreset: async (name) => {
    const preset: CustomColorPreset = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Custom Look',
      createdAt: new Date().toISOString(),
      settings: { ...get().colorGrading, filterPreset: name.trim() || 'Custom Look' },
    };
    await saveCustomColorPreset(preset);
    const updated = await listCustomColorPresets();
    set({ customPresets: updated });
    get().pushToast({ type: 'success', title: `Saved color preset "${preset.name}" locally` });
  },

  removeCustomPreset: async (id) => {
    await deleteCustomColorPreset(id);
    const updated = await listCustomColorPresets();
    set({ customPresets: updated });
  },

  buildCurrentProjectSnapshot: () => {
    const s = get();
    return {
      id: s.projectId,
      version: '1.0',
      name: s.projectName,
      type: s.videoClips.length > 0 ? 'video' : s.projectType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      masterVolume: s.masterVolume,
      audioTracks: s.audioTracks.map(({ buffer: _b, ...rest }) => rest),
      audioMarkers: s.audioMarkers,
      videoClips: s.videoClips.map(({ objectUrl: _u, ...rest }) => rest),
      videoOverlays: s.videoOverlays,
      videoMarkers: s.videoMarkers,
      colorGrading: s.colorGrading,
      exportConfig: {
        audioFormat: 'wav',
        audioBitrate: 192,
        videoFormat: s.capabilities?.supportedVideoExports[0]?.mimeType ?? 'video/webm',
        videoResolution: '720p',
        videoFps: 30,
      },
    };
  },

  saveCurrentProjectLocally: async () => {
    const snapshot = get().buildCurrentProjectSnapshot();
    const existing = get().savedProjects.find((p) => p.id === snapshot.id);
    if (existing) snapshot.createdAt = existing.createdAt;
    await saveLocalProject(snapshot);
    const projects = await listLocalProjects();
    const caps = await probeBrowserCapabilities();
    set({ savedProjects: projects, capabilities: caps });
    get().pushToast({ type: 'success', title: `Saved "${snapshot.name}" to local device storage` });
  },

  loadProjectIntoWorkspace: (project) => {
    // Revoke old video object URLs before loading new project
    get().videoClips.forEach((c) => {
      if (c.objectUrl) URL.revokeObjectURL(c.objectUrl);
    });
    set({
      projectId: project.id,
      projectName: project.name,
      projectType: project.type,
      masterVolume: project.masterVolume ?? 0.9,
      audioTracks: project.audioTracks.map((t) => ({ ...t, buffer: undefined, missingMedia: true })),
      audioMarkers: project.audioMarkers ?? [],
      selectedAudioTrackId: project.audioTracks[0]?.id ?? null,
      videoClips: project.videoClips.map((c) => ({ ...c, objectUrl: undefined, missingMedia: true })),
      videoOverlays: project.videoOverlays ?? [],
      videoMarkers: project.videoMarkers ?? [],
      selectedVideoClipId: project.videoClips[0]?.id ?? null,
      colorGrading: { ...DEFAULT_COLOR_GRADING, ...(project.colorGrading ?? {}) },
      colorGradingHistory: [],
    });
    get().navigate(project.type === 'video' ? 'video' : project.type === 'mashup' ? 'mashup' : 'audio');
    get().pushToast({
      type: 'info',
      title: `Opened "${project.name}"`,
      detail:
        project.audioTracks.length > 0 || project.videoClips.length > 0
          ? 'Relink local source media files to restore audio/video playback.'
          : undefined,
    });
  },

  renameSavedProject: async (id, name) => {
    const proj = get().savedProjects.find((p) => p.id === id);
    if (!proj) return;
    await saveLocalProject({ ...proj, name: name.trim() || proj.name });
    const updated = await listLocalProjects();
    set((s) => ({
      savedProjects: updated,
      projectName: s.projectId === id ? name.trim() || s.projectName : s.projectName,
    }));
  },

  duplicateSavedProject: async (id) => {
    const proj = get().savedProjects.find((p) => p.id === id);
    if (!proj) return;
    const copy: MixoraProject = {
      ...proj,
      id: crypto.randomUUID(),
      name: `${proj.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveLocalProject(copy);
    const updated = await listLocalProjects();
    set({ savedProjects: updated });
    get().pushToast({ type: 'success', title: `Duplicated "${proj.name}"` });
  },

  removeSavedProject: async (id) => {
    await deleteLocalProject(id);
    const updated = await listLocalProjects();
    const caps = await probeBrowserCapabilities();
    set({ savedProjects: updated, capabilities: caps });
    get().pushToast({ type: 'info', title: 'Project removed from local storage' });
  },

  toggleAutosave: async (enabled) => {
    await setLocalSetting('autosaveEnabled', enabled);
    set({ autosaveEnabled: enabled });
  },

  clearWorkspaceMedia: () => {
    get().videoClips.forEach((c) => {
      if (c.objectUrl) URL.revokeObjectURL(c.objectUrl);
    });
    set({
      projectId: crypto.randomUUID(),
      projectName: 'Untitled Studio Session',
      audioTracks: [],
      audioMarkers: [],
      selectedAudioTrackId: null,
      videoClips: [],
      videoOverlays: [],
      videoMarkers: [],
      selectedVideoClipId: null,
      colorGrading: { ...DEFAULT_COLOR_GRADING },
      colorGradingHistory: [],
    });
    get().pushToast({
      type: 'success',
      title: 'Workspace cleared',
      detail: 'All temporary media buffers and Blob URLs have been released from memory.',
    });
  },

  wipeAllLocalProjects: async () => {
    await deleteAllLocalProjects();
    const caps = await probeBrowserCapabilities();
    set({ savedProjects: [], capabilities: caps });
    get().pushToast({ type: 'info', title: 'All local projects deleted from this browser' });
  },

  wipeAllCachedData: async () => {
    get().clearWorkspaceMedia();
    await clearAllCachedStudioData();
    const caps = await probeBrowserCapabilities();
    set({ savedProjects: [], customPresets: [], autosaveEnabled: false, capabilities: caps });
    get().pushToast({
      type: 'success',
      title: 'All local studio data cleared',
      detail: 'IndexedDB projects, presets, and memory buffers have been removed.',
    });
  },
}));
