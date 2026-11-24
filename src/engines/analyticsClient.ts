type AnalyticsEventType =
  | 'visit'
  | 'studio_session'
  | 'export_attempt'
  | 'export_success'
  | 'export_fail'
  | 'effect_used'
  | 'ai_feature_used'
  | 'processing_error';

type AnalyticsFeature =
  | 'home'
  | 'dashboard'
  | 'audio_studio'
  | 'mashup_creator'
  | 'dj_mixer'
  | 'video_studio'
  | 'color_grading'
  | 'ai_lab'
  | 'media_tools'
  | 'projects';

interface AnalyticsPayload {
  eventType: AnalyticsEventType;
  feature: AnalyticsFeature;
  status?: 'ok' | 'success' | 'error' | 'cancelled';
  format?: string;
  resolution?: string;
  effect?: string;
  errorCategory?: string;
}

function getCoarseDeviceCategory(): 'desktop' | 'tablet' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

function getCoarseBrowser(): 'chrome' | 'firefox' | 'safari' | 'edge' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox/')) return 'firefox';
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'safari';
  return 'other';
}

/**
 * Dispatches strictly anonymous aggregate telemetry counters.
 * Never transmits filenames, media contents, user IDs, or project data.
 */
export function trackAnonymousEvent(payload: AnalyticsPayload): void {
  try {
    const body = JSON.stringify({
      eventType: payload.eventType,
      feature: payload.feature,
      deviceCategory: getCoarseDeviceCategory(),
      browser: getCoarseBrowser(),
      status: payload.status ?? 'ok',
      format: payload.format ?? 'none',
      resolution: payload.resolution ?? 'none',
      effect: payload.effect ?? 'none',
      errorCategory: payload.errorCategory ?? 'none',
    });

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/event', blob);
      return;
    }

    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Analytics is strictly optional
    });
  } catch {
    // Ignore telemetry transport errors
  }
}
