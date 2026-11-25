export type RouteId =
  | 'home'
  | 'dashboard'
  | 'audio'
  | 'mashup'
  | 'dj'
  | 'video'
  | 'ai'
  | 'tools'
  | 'projects'
  | 'about'
  | 'admin';

export interface AudioTrackEffects {
  eqLow: number; // -12 to +12 dB
  eqMid: number; // -12 to +12 dB
  eqHigh: number; // -12 to +12 dB
  bassBoost: number; // 0 to +12 dB
  reverbMix: number; // 0 to 1
  delayTime: number; // 0 to 1.0 s
  delayFeedback: number; // 0 to 0.8
  echoMix: number; // 0 to 1
  compressorThreshold: number; // -48 to 0 dB
  compressorRatio: number; // 1 to 20
  limiterEnabled: boolean;
  distortionAmount: number; // 0 to 100
  noiseReduction: number; // 0 to 1
  highPassFreq: number; // 20 to 2000 Hz
  lowPassFreq: number; // 1000 to 20000 Hz
}

export const DEFAULT_AUDIO_EFFECTS: AudioTrackEffects = {
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  bassBoost: 0,
  reverbMix: 0,
  delayTime: 0.25,
  delayFeedback: 0.3,
  echoMix: 0,
  compressorThreshold: -18,
  compressorRatio: 3,
  limiterEnabled: true,
  distortionAmount: 0,
  noiseReduction: 0,
  highPassFreq: 20,
  lowPassFreq: 20000,
};

export interface AudioTrackModel {
  id: string;
  name: string;
  fileName: string;
  duration: number;
  sampleRate: number;
  channels: number;
  startOffset: number; // Timeline position in seconds
  trimStart: number; // Source trim start in seconds
  trimEnd: number; // Source trim end in seconds
  volume: number; // 0 to 1.5
  pan: number; // -1 to 1
  mute: boolean;
  solo: boolean;
  group: string;
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  reversed: boolean;
  speed: number; // 0.5 to 2.0
  pitchSemitones: number; // -12 to +12
  color: string;
  peaks: number[]; // Downsampled normalized waveform peaks for canvas rendering
  effects: AudioTrackEffects;
  buffer?: AudioBuffer;
  missingMedia?: boolean;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface ColorGradingSettings {
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  exposure: number; // -100 to 100
  saturation: number; // -100 to 100
  temperature: number; // -100 to 100
  tint: number; // -100 to 100
  highlights: number; // -100 to 100
  shadows: number; // -100 to 100
  whites: number; // -100 to 100
  blacks: number; // -100 to 100
  redGain: number; // -50 to 50
  greenGain: number; // -50 to 50
  blueGain: number; // -50 to 50
  hue: number; // -180 to 180
  vibrance: number; // -100 to 100
  gamma: number; // 0.5 to 2.0
  lift: number; // -50 to 50
  gain: number; // 0.5 to 2.0
  vignette: number; // 0 to 100
  gradientPreset: string; // 'none' | 'violet-cyan' | 'teal-orange' | 'sunset' | 'cyberpunk' | 'golden' | 'rose-gold'
  gradientOpacity: number; // 0 to 80
  cinemaBars: boolean;
  filterPreset: string;
}

export const DEFAULT_COLOR_GRADING: ColorGradingSettings = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  redGain: 0,
  greenGain: 0,
  blueGain: 0,
  hue: 0,
  vibrance: 0,
  gamma: 1,
  lift: 0,
  gain: 1,
  vignette: 0,
  gradientPreset: 'none',
  gradientOpacity: 0,
  cinemaBars: false,
  filterPreset: 'Natural',
};

export type AudioExportFormat = 'wav' | 'mp3';
export type AudioBitDepth = 16 | 24 | 32;
export type AudioSampleRate = 22050 | 44100 | 48000 | 96000;
export type Mp3Bitrate = 64 | 96 | 128 | 192 | 256 | 320;
export type VideoResolutionOption = '360p' | '480p' | '720p' | '1080p' | '1440p' | '2160p' | 'source';
export type VideoAspectRatioOption = 'original' | '16:9' | '9:16' | '1:1' | '4:5';

export interface CustomColorPreset {
  id: string;
  name: string;
  createdAt: string;
  settings: ColorGradingSettings;
}

export type TransitionType = 'none' | 'fade' | 'crossfade' | 'slide' | 'zoom' | 'dissolve';

export interface VideoClipModel {
  id: string;
  name: string;
  fileName: string;
  duration: number;
  width: number;
  height: number;
  startOffset: number;
  trimStart: number;
  trimEnd: number;
  trackIndex: number; // 0 or 1
  speed: number; // 0.25 to 3.0
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  cropX: number; // 0 to 0.45
  cropY: number; // 0 to 0.45
  cropW: number; // 0.1 to 1.0
  cropH: number; // 0.1 to 1.0
  volume: number; // 0 to 1.5
  mute: boolean;
  transitionIn: TransitionType;
  transitionDuration: number; // 0.2 to 2.0s
  freezeFrameTime: number | null;
  objectUrl?: string;
  missingMedia?: boolean;
}

export interface VideoOverlayModel {
  id: string;
  kind: 'text' | 'title' | 'subtitle' | 'rect' | 'circle' | 'lower-third';
  text: string;
  startTime: number;
  endTime: number;
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
  width: number; // percentage for shapes
  height: number; // percentage for shapes
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  shadow: boolean;
  animation: 'none' | 'fade' | 'slide-up' | 'zoom';
}

export interface MixoraProject {
  id: string;
  version: '1.0';
  name: string;
  type: 'audio' | 'video' | 'mashup';
  createdAt: string;
  updatedAt: string;
  masterVolume: number;
  audioTracks: Omit<AudioTrackModel, 'buffer'>[];
  audioMarkers: TimelineMarker[];
  videoClips: Omit<VideoClipModel, 'objectUrl'>[];
  videoOverlays: VideoOverlayModel[];
  videoMarkers: TimelineMarker[];
  colorGrading: ColorGradingSettings;
  exportConfig: {
    audioFormat: AudioExportFormat;
    audioBitrate: number;
    videoFormat: string;
    videoResolution: VideoResolutionOption;
    videoFps: number;
  };
}

export interface BrowserCapabilities {
  webAudio: boolean;
  audioWorklet: boolean;
  mediaRecorder: boolean;
  webCodecs: boolean;
  indexedDB: boolean;
  fileSystemAccess: boolean;
  supportedVideoExports: { mimeType: string; label: string; ext: 'mp4' | 'webm' }[];
  hardwareConcurrency: number;
  deviceMemoryGB: number | null;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  detail?: string;
}
