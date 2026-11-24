import type { BrowserCapabilities, CustomColorPreset, MixoraProject } from '../types/mixora';

const DB_NAME = 'mixora_local_studio_db';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const PRESETS_STORE = 'color_presets';
const SETTINGS_STORE = 'settings';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PRESETS_STORE)) {
        db.createObjectStore(PRESETS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open local IndexedDB'));
  });
}

export async function listLocalProjects(): Promise<MixoraProject[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readonly');
    const req = tx.objectStore(PROJECTS_STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as MixoraProject[]) ?? [];
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalProject(project: MixoraProject): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).put({
      ...project,
      updatedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteLocalProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAllLocalProjects(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listCustomColorPresets(): Promise<CustomColorPreset[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readonly');
    const req = tx.objectStore(PRESETS_STORE).getAll();
    req.onsuccess = () => resolve((req.result as CustomColorPreset[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomColorPreset(preset: CustomColorPreset): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readwrite');
    tx.objectStore(PRESETS_STORE).put(preset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCustomColorPreset(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readwrite');
    tx.objectStore(PRESETS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const req = tx.objectStore(SETTINGS_STORE).get(key);
      req.onsuccess = () => {
        const res = req.result as { key: string; value: T } | undefined;
        resolve(res ? res.value : fallback);
      };
      req.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

export async function setLocalSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllCachedStudioData(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, PRESETS_STORE, SETTINGS_STORE], 'readwrite');
    tx.objectStore(PROJECTS_STORE).clear();
    tx.objectStore(PRESETS_STORE).clear();
    tx.objectStore(SETTINGS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function exportProjectFile(project: MixoraProject): void {
  const safeName = project.name.replace(/[^a-z0-9\-_\s]/gi, '').trim().replace(/\s+/g, '_') || 'project';
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  triggerBlobDownload(blob, `${safeName}.mixora`);
}

export async function parseImportedProjectFile(file: File): Promise<MixoraProject> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<MixoraProject>;
  if (!parsed || typeof parsed.name !== 'string' || !Array.isArray(parsed.audioTracks) || !Array.isArray(parsed.videoClips)) {
    throw new Error('Invalid .mixora project file structure.');
  }
  return {
    id: parsed.id || crypto.randomUUID(),
    version: '1.0',
    name: parsed.name,
    type: parsed.type === 'video' || parsed.type === 'mashup' ? parsed.type : 'audio',
    createdAt: parsed.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : 1,
    audioTracks: parsed.audioTracks.map((t) => ({ ...t, missingMedia: true })),
    audioMarkers: Array.isArray(parsed.audioMarkers) ? parsed.audioMarkers : [],
    videoClips: parsed.videoClips.map((c) => ({ ...c, missingMedia: true })),
    videoOverlays: Array.isArray(parsed.videoOverlays) ? parsed.videoOverlays : [],
    videoMarkers: Array.isArray(parsed.videoMarkers) ? parsed.videoMarkers : [],
    colorGrading: parsed.colorGrading!,
    exportConfig: parsed.exportConfig ?? {
      audioFormat: 'wav',
      audioBitrate: 192,
      videoFormat: 'video/webm',
      videoResolution: '720p',
      videoFps: 30,
    },
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function probeBrowserCapabilities(): Promise<BrowserCapabilities> {
  const hasWebAudio = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  const hasAudioWorklet = hasWebAudio && typeof AudioWorkletNode !== 'undefined';
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
  const hasIndexedDB = typeof indexedDB !== 'undefined';
  const hasFileSystemAccess = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

  const candidates: { mimeType: string; label: string; ext: 'mp4' | 'webm' }[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', label: 'MP4 (H.264 / AAC)', ext: 'mp4' },
    { mimeType: 'video/mp4', label: 'MP4 (Browser Native)', ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', label: 'WebM (VP9 / Opus)', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', label: 'WebM (VP8 / Opus)', ext: 'webm' },
    { mimeType: 'video/webm', label: 'WebM (Standard)', ext: 'webm' },
  ];

  const supportedVideoExports = hasMediaRecorder
    ? candidates.filter((c) => {
        try {
          return MediaRecorder.isTypeSupported(c.mimeType);
        } catch {
          return false;
        }
      })
    : [];

  let storageUsageBytes: number | null = null;
  let storageQuotaBytes: number | null = null;
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      storageUsageBytes = est.usage ?? null;
      storageQuotaBytes = est.quota ?? null;
    }
  } catch {
    // Ignore storage estimate failure
  }

  const nav = navigator as Navigator & { deviceMemory?: number };

  return {
    webAudio: hasWebAudio,
    audioWorklet: hasAudioWorklet,
    mediaRecorder: hasMediaRecorder,
    webCodecs: hasWebCodecs,
    indexedDB: hasIndexedDB,
    fileSystemAccess: hasFileSystemAccess,
    supportedVideoExports,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    storageUsageBytes,
    storageQuotaBytes,
  };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
