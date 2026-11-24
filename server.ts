import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ANALYTICS_ENABLED = process.env.ANALYTICS_ENABLED !== 'false';
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const DATA_DIR = path.resolve(__dirname, 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const ADMIN_AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');

interface AnalyticsBucket {
  date: string; // YYYY-MM-DD
  eventType: string;
  feature: string;
  deviceCategory: string;
  status: string;
  format: string;
  resolution: string;
  effect: string;
  browser: string;
  errorCategory: string;
  count: number;
}

interface AnalyticsStore {
  buckets: Record<string, AnalyticsBucket>;
  updatedAt: string;
}

interface AdminAuthRecord {
  salt: string;
  hash: string;
  claimedAt: string;
}

const ALLOWED_EVENTS = new Set([
  'visit',
  'studio_session',
  'export_attempt',
  'export_success',
  'export_fail',
  'effect_used',
  'ai_feature_used',
  'processing_error',
]);

const ALLOWED_FEATURES = new Set([
  'home',
  'dashboard',
  'audio_studio',
  'mashup_creator',
  'dj_mixer',
  'video_studio',
  'color_grading',
  'ai_lab',
  'media_tools',
  'projects',
]);

const ALLOWED_DEVICES = new Set(['desktop', 'tablet', 'mobile']);
const ALLOWED_STATUSES = new Set(['ok', 'success', 'error', 'cancelled']);
const ALLOWED_FORMATS = new Set(['none', 'wav', 'mp3', 'webm', 'mp4', 'png', 'jpeg', 'webp', 'mixora']);
const ALLOWED_RESOLUTIONS = new Set(['none', '480p', '720p', '1080p', 'source']);
const ALLOWED_EFFECTS = new Set([
  'none',
  'eq',
  'bass_boost',
  'reverb',
  'delay',
  'echo',
  'compressor',
  'limiter',
  'distortion',
  'noise_reduction',
  'highpass',
  'lowpass',
  'color_preset',
  'bpm_detect',
  'key_detect',
  'vocal_split',
  'stem_split',
  'audio_enhance',
  'smart_mashup',
  'frame_extract',
  'thumbnail_gen',
]);
const ALLOWED_BROWSERS = new Set(['chrome', 'firefox', 'safari', 'edge', 'other']);
const ALLOWED_ERROR_CATEGORIES = new Set([
  'none',
  'unsupported_format',
  'corrupted_media',
  'codec_unavailable',
  'memory_limit',
  'export_failed',
  'worker_error',
]);

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAnalyticsStore(): AnalyticsStore {
  ensureDataDir();
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      const raw = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as AnalyticsStore;
      if (parsed && typeof parsed.buckets === 'object') {
        return parsed;
      }
    }
  } catch {
    // Fallback to empty store if unreadable
  }
  return { buckets: {}, updatedAt: new Date().toISOString() };
}

function writeAnalyticsStore(store: AnalyticsStore): void {
  ensureDataDir();
  store.updatedAt = new Date().toISOString();
  const tmpFile = `${ANALYTICS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpFile, ANALYTICS_FILE);
}

function readClaimedAdmin(): AdminAuthRecord | null {
  ensureDataDir();
  try {
    if (fs.existsSync(ADMIN_AUTH_FILE)) {
      const raw = fs.readFileSync(ADMIN_AUTH_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as AdminAuthRecord;
      if (parsed && typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
        return parsed;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getEnvAdminSecret(): string {
  const val = process.env.ADMIN_SECRET?.trim() ?? '';
  return val;
}

function getAuthMode(): 'env' | 'claimed' | 'unclaimed' {
  if (getEnvAdminSecret().length > 0) return 'env';
  if (readClaimedAdmin() !== null) return 'claimed';
  return 'unclaimed';
}

function hashPasscode(passcode: string, salt: string): string {
  return crypto.scryptSync(passcode, salt, 64).toString('hex');
}

function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signAdminToken(): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 4; // 4 hours
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: expiresAt, nonce })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt };
}

function verifyAdminToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!safeCompareStrings(sig, expectedSig)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      role?: string;
      exp?: number;
    };
    return decoded.role === 'admin' && typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: 'Invalid or expired admin session' });
    return;
  }
  next();
}

// Simple fixed-window in-memory rate limiter without storing raw IPs persistently
let eventWindowStart = Date.now();
let eventWindowCount = 0;

function sanitizeCsvCell(val: string | number): string {
  const str = String(val);
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  // Health & public analytics configuration check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', analyticsEnabled: ANALYTICS_ENABLED });
  });

  // Anonymous aggregate event ingestion (zero PII, zero filenames, zero media content)
  app.post('/api/analytics/event', (req, res) => {
    if (!ANALYTICS_ENABLED) {
      res.status(204).end();
      return;
    }

    const now = Date.now();
    if (now - eventWindowStart > 60_000) {
      eventWindowStart = now;
      eventWindowCount = 0;
    }
    eventWindowCount += 1;
    if (eventWindowCount > 600) {
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const eventType = typeof body.eventType === 'string' && ALLOWED_EVENTS.has(body.eventType) ? body.eventType : null;
    if (!eventType) {
      res.status(400).json({ error: 'Invalid eventType' });
      return;
    }

    const feature =
      typeof body.feature === 'string' && ALLOWED_FEATURES.has(body.feature) ? body.feature : 'dashboard';
    const deviceCategory =
      typeof body.deviceCategory === 'string' && ALLOWED_DEVICES.has(body.deviceCategory)
        ? body.deviceCategory
        : 'desktop';
    const status =
      typeof body.status === 'string' && ALLOWED_STATUSES.has(body.status) ? body.status : 'ok';
    const format =
      typeof body.format === 'string' && ALLOWED_FORMATS.has(body.format) ? body.format : 'none';
    const resolution =
      typeof body.resolution === 'string' && ALLOWED_RESOLUTIONS.has(body.resolution)
        ? body.resolution
        : 'none';
    const effect =
      typeof body.effect === 'string' && ALLOWED_EFFECTS.has(body.effect) ? body.effect : 'none';
    const browser =
      typeof body.browser === 'string' && ALLOWED_BROWSERS.has(body.browser) ? body.browser : 'other';
    const errorCategory =
      typeof body.errorCategory === 'string' && ALLOWED_ERROR_CATEGORIES.has(body.errorCategory)
        ? body.errorCategory
        : 'none';

    const date = new Date().toISOString().slice(0, 10);
    const key = [date, eventType, feature, deviceCategory, status, format, resolution, effect, browser, errorCategory].join('|');

    const store = readAnalyticsStore();
    if (!store.buckets[key]) {
      store.buckets[key] = {
        date,
        eventType,
        feature,
        deviceCategory,
        status,
        format,
        resolution,
        effect,
        browser,
        errorCategory,
        count: 0,
      };
    }
    store.buckets[key].count += 1;
    writeAnalyticsStore(store);

    res.status(202).json({ accepted: true });
  });

  // Admin auth status
  app.get('/api/admin/status', (_req, res) => {
    res.json({
      analyticsConfigured: ANALYTICS_ENABLED,
      authMode: getAuthMode(),
    });
  });

  // First-run one-time admin claim route (only active when ADMIN_SECRET is unset & not yet claimed)
  app.post('/api/admin/claim', (req, res) => {
    if (getAuthMode() !== 'unclaimed') {
      res.status(403).json({ error: 'Admin access is already configured' });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 8 || passcode.length > 128) {
      res.status(400).json({ error: 'Passcode must be between 8 and 128 characters' });
      return;
    }

    ensureDataDir();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPasscode(passcode, salt);
    const record: AdminAuthRecord = { salt, hash, claimedAt: new Date().toISOString() };

    try {
      // Atomic create (wx) so concurrent claims cannot overwrite
      fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify(record, null, 2), { encoding: 'utf-8', flag: 'wx' });
    } catch {
      res.status(409).json({ error: 'Admin access was already claimed' });
      return;
    }

    const session = signAdminToken();
    res.status(201).json(session);
  });

  // Server-side admin login
  app.post('/api/admin/login', (req, res) => {
    const mode = getAuthMode();
    if (mode === 'unclaimed') {
      res.status(400).json({ error: 'Admin passcode has not been configured yet' });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!passcode) {
      res.status(400).json({ error: 'Passcode is required' });
      return;
    }

    let valid = false;
    if (mode === 'env') {
      valid = safeCompareStrings(passcode, getEnvAdminSecret());
    } else {
      const record = readClaimedAdmin();
      if (record) {
        const candidateHash = hashPasscode(passcode, record.salt);
        valid = safeCompareStrings(candidateHash, record.hash);
      }
    }

    if (!valid) {
      res.status(401).json({ error: 'Invalid admin passcode' });
      return;
    }

    const session = signAdminToken();
    res.json(session);
  });

  // Protected aggregate analytics query
  app.get('/api/admin/analytics', requireAdminAuth, (req, res) => {
    if (!ANALYTICS_ENABLED) {
      res.status(503).json({ error: 'Global analytics are unavailable in this deployment.' });
      return;
    }

    const rangeDaysRaw = Number(req.query.days ?? 30);
    const rangeDays = Number.isFinite(rangeDaysRaw) && rangeDaysRaw > 0 && rangeDaysRaw <= 365 ? rangeDaysRaw : 30;
    const featureFilter =
      typeof req.query.feature === 'string' && ALLOWED_FEATURES.has(req.query.feature) ? req.query.feature : 'all';

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const store = readAnalyticsStore();
    const filtered = Object.values(store.buckets).filter((b) => {
      if (b.date < cutoffStr) return false;
      if (featureFilter !== 'all' && b.feature !== featureFilter) return false;
      return true;
    });

    res.json({
      rangeDays,
      featureFilter,
      updatedAt: store.updatedAt,
      buckets: filtered,
    });
  });

  // Protected CSV export of aggregate analytics
  app.get('/api/admin/analytics/csv', requireAdminAuth, (req, res) => {
    if (!ANALYTICS_ENABLED) {
      res.status(503).json({ error: 'Global analytics are unavailable in this deployment.' });
      return;
    }

    const rangeDaysRaw = Number(req.query.days ?? 30);
    const rangeDays = Number.isFinite(rangeDaysRaw) && rangeDaysRaw > 0 && rangeDaysRaw <= 365 ? rangeDaysRaw : 30;
    const featureFilter =
      typeof req.query.feature === 'string' && ALLOWED_FEATURES.has(req.query.feature) ? req.query.feature : 'all';

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const store = readAnalyticsStore();
    const rows = Object.values(store.buckets)
      .filter((b) => b.date >= cutoffStr && (featureFilter === 'all' || b.feature === featureFilter))
      .sort((a, b) => a.date.localeCompare(b.date));

    const header = [
      'date',
      'eventType',
      'feature',
      'deviceCategory',
      'status',
      'format',
      'resolution',
      'effect',
      'browser',
      'errorCategory',
      'count',
    ].join(',');

    const lines = rows.map((r) =>
      [
        r.date,
        r.eventType,
        r.feature,
        r.deviceCategory,
        r.status,
        r.format,
        r.resolution,
        r.effect,
        r.browser,
        r.errorCategory,
        r.count,
      ]
        .map(sanitizeCsvCell)
        .join(',')
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mixora-analytics-${rangeDays}d.csv"`);
    res.send([header, ...lines].join('\n'));
  });

  // Protected reset analytics
  app.post('/api/admin/analytics/reset', requireAdminAuth, (_req, res) => {
    if (!ANALYTICS_ENABLED) {
      res.status(503).json({ error: 'Global analytics are unavailable in this deployment.' });
      return;
    }
    writeAnalyticsStore({ buckets: {}, updatedAt: new Date().toISOString() });
    res.json({ reset: true });
  });

  // Vite middleware in development; static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MIXORA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MIXORA server:', err);
  process.exit(1);
});
