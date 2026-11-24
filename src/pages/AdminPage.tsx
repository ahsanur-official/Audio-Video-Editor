import {
  AlertCircle,
  BarChart3,
  Download,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { triggerBlobDownload } from '../engines/storageEngine';
import { useMixoraStore } from '../store/useMixoraStore';

interface AnalyticsBucket {
  date: string;
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

interface AdminStatusResponse {
  analyticsConfigured: boolean;
  authMode: 'env' | 'claimed' | 'unclaimed';
}

const CHART_COLORS = ['#8B5CF6', '#22D3EE', '#3B82F6', '#A3E635', '#F59E0B', '#F43F5E'];

export function AdminPage() {
  const navigate = useMixoraStore((s) => s.navigate);
  const pushToast = useMixoraStore((s) => s.pushToast);

  // Bearer token held strictly in React state (never localStorage or sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminStatusResponse | null>(null);
  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [days, setDays] = useState(30);
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [featureFilter, setFeatureFilter] = useState('all');
  const [buckets, setBuckets] = useState<AnalyticsBucket[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const checkStatus = async () => {
    try {
      const resp = await fetch('/api/admin/status');
      if (!resp.ok) throw new Error('Unavailable');
      const data = (await resp.json()) as AdminStatusResponse;
      setStatus(data);
      if (!data.analyticsConfigured) setBackendUnavailable(true);
    } catch {
      setBackendUnavailable(true);
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  const fetchAnalytics = async (activeToken: string, rangeDays: number, feature: string) => {
    setLoadingData(true);
    try {
      const qs = new URLSearchParams({ days: String(rangeDays), feature });
      const resp = await fetch(`/api/admin/analytics?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (resp.status === 401) {
        setToken(null);
        setAuthError('Admin session expired. Please sign in again.');
        return;
      }
      if (resp.status === 503) {
        setBackendUnavailable(true);
        return;
      }
      if (!resp.ok) throw new Error('Failed to load analytics');
      const data = (await resp.json()) as { buckets: AnalyticsBucket[]; updatedAt: string };
      setBuckets(data.buckets);
      setUpdatedAt(data.updatedAt);
    } catch {
      pushToast({ type: 'error', title: 'Failed to load aggregate analytics' });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchAnalytics(token, days, featureFilter);
    }
  }, [token, days, featureFilter]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!status) return;

    if (status.authMode === 'unclaimed') {
      if (passcode.length < 8) {
        setAuthError('Choose a passcode of at least 8 characters.');
        return;
      }
      if (passcode !== confirmPasscode) {
        setAuthError('Passcodes do not match.');
        return;
      }
    }

    setAuthLoading(true);
    try {
      const endpoint = status.authMode === 'unclaimed' ? '/api/admin/claim' : '/api/admin/login';
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = (await resp.json()) as { token?: string; error?: string };
      if (!resp.ok || !data.token) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }
      setPasscode('');
      setConfirmPasscode('');
      setToken(data.token);
      await checkStatus();
    } catch {
      setAuthError('Could not reach admin authentication service.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (!token) return;
    try {
      const qs = new URLSearchParams({ days: String(days), feature: featureFilter });
      const resp = await fetch(`/api/admin/analytics/csv?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('CSV export failed');
      const blob = await resp.blob();
      triggerBlobDownload(blob, `mixora-analytics-${days}d.csv`);
      pushToast({ type: 'success', title: 'Exported aggregate analytics CSV' });
    } catch {
      pushToast({ type: 'error', title: 'Failed to export CSV' });
    }
  };

  const handleResetAnalytics = async () => {
    if (!token) return;
    try {
      const resp = await fetch('/api/admin/analytics/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Reset failed');
      setConfirmReset(false);
      await fetchAnalytics(token, days, featureFilter);
      pushToast({ type: 'info', title: 'Aggregate analytics counters reset' });
    } catch {
      pushToast({ type: 'error', title: 'Failed to reset analytics' });
    }
  };

  // Compute genuine aggregate KPIs & chart series from buckets
  const metrics = useMemo(() => {
    let totalVisits = 0;
    let totalSessions = 0;
    let audioSessions = 0;
    let videoSessions = 0;
    let mashupSessions = 0;
    let exportAttempts = 0;
    let exportSuccess = 0;
    let failedAttempts = 0;

    const featureMap = new Map<string, number>();
    const formatMap = new Map<string, number>();
    const resMap = new Map<string, number>();
    const effectMap = new Map<string, number>();
    const aiMap = new Map<string, number>();
    const deviceMap = new Map<string, number>();
    const browserMap = new Map<string, number>();
    const errorMap = new Map<string, number>();
    const timeMap = new Map<string, { label: string; audio: number; video: number; exports: number; total: number }>();

    for (const b of buckets) {
      const c = b.count;
      if (b.eventType === 'visit') totalVisits += c;
      if (b.eventType === 'studio_session') {
        totalSessions += c;
        if (b.feature === 'audio_studio' || b.feature === 'dj_mixer') audioSessions += c;
        if (b.feature === 'video_studio' || b.feature === 'color_grading') videoSessions += c;
        if (b.feature === 'mashup_creator') mashupSessions += c;
      }
      if (b.eventType === 'export_attempt') exportAttempts += c;
      if (b.eventType === 'export_success') exportSuccess += c;
      if (b.eventType === 'export_fail' || b.eventType === 'processing_error') failedAttempts += c;

      featureMap.set(b.feature, (featureMap.get(b.feature) ?? 0) + c);
      if (b.format !== 'none') formatMap.set(b.format.toUpperCase(), (formatMap.get(b.format.toUpperCase()) ?? 0) + c);
      if (b.resolution !== 'none') resMap.set(b.resolution, (resMap.get(b.resolution) ?? 0) + c);
      if (b.effect !== 'none' && b.eventType === 'effect_used') effectMap.set(b.effect, (effectMap.get(b.effect) ?? 0) + c);
      if (b.effect !== 'none' && b.eventType === 'ai_feature_used') aiMap.set(b.effect, (aiMap.get(b.effect) ?? 0) + c);
      deviceMap.set(b.deviceCategory, (deviceMap.get(b.deviceCategory) ?? 0) + c);
      browserMap.set(b.browser, (browserMap.get(b.browser) ?? 0) + c);
      if (b.errorCategory !== 'none') errorMap.set(b.errorCategory, (errorMap.get(b.errorCategory) ?? 0) + c);

      let bucketKey = b.date;
      if (granularity === 'monthly') {
        bucketKey = b.date.slice(0, 7);
      } else if (granularity === 'weekly') {
        const d = new Date(`${b.date}T00:00:00Z`);
        const day = d.getUTCDay();
        d.setUTCDate(d.getUTCDate() - day);
        bucketKey = d.toISOString().slice(0, 10);
      }

      const row = timeMap.get(bucketKey) ?? { label: bucketKey, audio: 0, video: 0, exports: 0, total: 0 };
      row.total += c;
      if (b.feature === 'audio_studio' || b.feature === 'mashup_creator' || b.feature === 'dj_mixer') row.audio += c;
      if (b.feature === 'video_studio' || b.feature === 'color_grading') row.video += c;
      if (b.eventType === 'export_success') row.exports += c;
      timeMap.set(bucketKey, row);
    }

    const toSortedArray = (map: Map<string, number>) =>
      Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const featureList = toSortedArray(featureMap);
    const timeSeries = Array.from(timeMap.values()).sort((a, b) => a.label.localeCompare(b.label));

    return {
      totalVisits,
      totalSessions,
      audioSessions,
      videoSessions,
      mashupSessions,
      exportAttempts,
      exportSuccess,
      failedAttempts,
      featureList,
      formatList: toSortedArray(formatMap),
      resList: toSortedArray(resMap),
      effectList: toSortedArray(effectMap),
      aiList: toSortedArray(aiMap),
      deviceList: toSortedArray(deviceMap),
      browserList: toSortedArray(browserMap),
      errorList: toSortedArray(errorMap),
      audioVsVideo: [
        { name: 'Audio Tools', value: audioSessions + mashupSessions },
        { name: 'Video Tools', value: videoSessions },
      ],
      timeSeries,
    };
  }, [buckets, granularity]);

  if (backendUnavailable) {
    return (
      <div className="min-h-screen bg-[#09090D] text-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#14141D] border border-[#292938] rounded-xl p-8 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-[#F59E0B] mx-auto" />
          <h1 className="font-display text-xl font-bold">
            Global analytics are unavailable in this deployment.
          </h1>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            This instance is running without an active analytics backend. All user creative tools
            continue operating locally.
          </p>
          <button
            type="button"
            onClick={() => navigate('home')}
            className="px-4 py-2 rounded-md bg-[#8B5CF6] text-xs font-medium text-[#F8FAFC]"
          >
            Return to MIXORA
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    const isUnclaimed = status?.authMode === 'unclaimed';
    return (
      <div className="min-h-screen bg-[#09090D] text-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#14141D] border border-[#292938] rounded-xl p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#8B5CF6]">
              <Lock className="w-5 h-5" />
              <span className="text-xs font-semibold tracking-wide">MIXORA OPERATOR CONSOLE</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">
              {isUnclaimed ? 'Initialize Admin Passcode' : 'Admin Analytics Sign In'}
            </h1>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              {isUnclaimed
                ? 'ADMIN_SECRET is not set in environment secrets. Claim an initial scrypt-hashed operator passcode below (or configure ADMIN_SECRET in your deployment environment).'
                : 'Protected server-side route for viewing anonymous aggregate usage counters only.'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-pass" className="text-xs text-[#94A3B8]">
                {isUnclaimed ? 'New Admin Passcode (min 8 chars)' : 'Admin Passcode'}
              </label>
              <input
                id="admin-pass"
                type="password"
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                autoComplete={isUnclaimed ? 'new-password' : 'current-password'}
                className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-sm text-[#F8FAFC]"
              />
            </div>

            {isUnclaimed && (
              <div className="space-y-1.5">
                <label htmlFor="admin-pass-confirm" className="text-xs text-[#94A3B8]">
                  Confirm Passcode
                </label>
                <input
                  id="admin-pass-confirm"
                  type="password"
                  required
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  autoComplete="new-password"
                  className="w-full bg-[#09090D] border border-[#292938] rounded-md px-3 py-2 text-sm text-[#F8FAFC]"
                />
              </div>
            )}

            {authError && <p className="text-xs text-[#F43F5E]">{authError}</p>}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 rounded-md bg-[#8B5CF6] hover:bg-[#7C3AED] text-sm font-semibold text-[#F8FAFC] transition-colors disabled:opacity-50"
            >
              {authLoading
                ? 'Verifying...'
                : isUnclaimed
                  ? 'Claim Admin Access'
                  : 'Access Analytics Dashboard'}
            </button>
          </form>

          <div className="pt-4 border-t border-[#292938] flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Zero PII · Aggregate counters only</span>
            <button type="button" onClick={() => navigate('home')} className="hover:text-[#F8FAFC]">
              Back to Studio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090D] text-[#F8FAFC]">
      <header className="bg-[#14141D] border-b border-[#292938] px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-[#8B5CF6]" />
          <span className="font-display text-lg font-bold tracking-tight">MIXORA Admin Analytics</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchAnalytics(token, days, featureFilter)}
            className="p-2 rounded-md bg-[#1B1B27] border border-[#292938] text-[#94A3B8] hover:text-[#F8FAFC]"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#22D3EE] text-xs font-semibold text-[#09090D]"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-xs font-medium text-[#F43F5E]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => setToken(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1B1B27] border border-[#292938] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Privacy Guarantee & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#14141D] border border-[#292938] rounded-lg px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-[#A3E635]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              Anonymous aggregate counters only. No IP addresses, user IDs, filenames, or media content are stored.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-[#09090D] border border-[#292938] rounded px-2.5 py-1.5 text-[#F8FAFC]"
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
              <option value={365}>Last 365 Days</option>
            </select>

            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as 'daily' | 'weekly' | 'monthly')}
              className="bg-[#09090D] border border-[#292938] rounded px-2.5 py-1.5 text-[#F8FAFC]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>

            <select
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
              className="bg-[#09090D] border border-[#292938] rounded px-2.5 py-1.5 text-[#F8FAFC]"
            >
              <option value="all">All Features</option>
              <option value="audio_studio">Audio Studio</option>
              <option value="mashup_creator">Mashup Creator</option>
              <option value="dj_mixer">DJ Mixer</option>
              <option value="video_studio">Video Studio</option>
              <option value="color_grading">Color Grading</option>
              <option value="ai_lab">AI Lab</option>
              <option value="media_tools">Media Tools</option>
            </select>
          </div>
        </div>

        {/* A. Overview KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Visits', val: metrics.totalVisits, accent: '#F8FAFC' },
            { label: 'Studio Sessions', val: metrics.totalSessions, accent: '#8B5CF6' },
            { label: 'Audio Tool Sessions', val: metrics.audioSessions, accent: '#22D3EE' },
            { label: 'Video Tool Sessions', val: metrics.videoSessions, accent: '#3B82F6' },
            { label: 'Mashup Sessions', val: metrics.mashupSessions, accent: '#8B5CF6' },
            { label: 'Export Attempts', val: metrics.exportAttempts, accent: '#F8FAFC' },
            { label: 'Successful Exports', val: metrics.exportSuccess, accent: '#A3E635' },
            { label: 'Failed Processing', val: metrics.failedAttempts, accent: '#F43F5E' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#14141D] border border-[#292938] rounded-lg p-4">
              <p className="text-xs text-[#94A3B8]">{kpi.label}</p>
              <p
                className="font-mono tabular-nums text-2xl font-bold mt-1"
                style={{ color: kpi.accent }}
              >
                {kpi.val}
              </p>
            </div>
          ))}
        </section>

        {/* C. Usage Over Time & Feature Distribution Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-[#14141D] border border-[#292938] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">
                Aggregate Activity ({granularity})
              </h2>
              {updatedAt && (
                <span className="text-[11px] font-mono text-[#94A3B8]">
                  Updated {new Date(updatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            {metrics.timeSeries.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-[#94A3B8]">
                No aggregate events recorded for this date range yet.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#292938" />
                    <XAxis dataKey="label" stroke="#94A3B8" fontSize={11} />
                    <YAxis stroke="#94A3B8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#14141D', borderColor: '#292938', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="total" name="Total Events" stroke="#8B5CF6" strokeWidth={2} />
                    <Line type="monotone" dataKey="audio" name="Audio Tools" stroke="#22D3EE" strokeWidth={2} />
                    <Line type="monotone" dataKey="video" name="Video Tools" stroke="#3B82F6" strokeWidth={2} />
                    <Line type="monotone" dataKey="exports" name="Exports" stroke="#A3E635" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 bg-[#14141D] border border-[#292938] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold">Audio vs Video Usage</h2>
            {metrics.audioVsVideo.every((x) => x.value === 0) ? (
              <div className="h-64 flex items-center justify-center text-xs text-[#94A3B8]">
                No studio sessions recorded yet.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.audioVsVideo}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={4}
                    >
                      <Cell fill="#22D3EE" />
                      <Cell fill="#8B5CF6" />
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#14141D', borderColor: '#292938', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* Feature & Format Distribution */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#14141D] border border-[#292938] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold">Feature Distribution</h2>
            {metrics.featureList.length === 0 ? (
              <p className="text-xs text-[#94A3B8] py-12 text-center">No feature events yet.</p>
            ) : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.featureList} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#292938" />
                    <XAxis type="number" stroke="#94A3B8" fontSize={11} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="#94A3B8" fontSize={11} width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#14141D', borderColor: '#292938', fontSize: 12 }}
                    />
                    <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-[#14141D] border border-[#292938] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold">Export Format Distribution</h2>
            {metrics.formatList.length === 0 ? (
              <p className="text-xs text-[#94A3B8] py-12 text-center">No export events recorded yet.</p>
            ) : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.formatList}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#292938" />
                    <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} />
                    <YAxis stroke="#94A3B8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#14141D', borderColor: '#292938', fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {metrics.formatList.map((entry, index) => (
                        <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* Breakdown Tables: Devices, Browsers, Effects, AI Features, Resolutions, Errors */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          {[
            { title: 'Device Categories', rows: metrics.deviceList },
            { title: 'Browser Compatibility', rows: metrics.browserList },
            { title: 'Popular Resolutions', rows: metrics.resList },
            { title: 'Popular Effects', rows: metrics.effectList },
            { title: 'Most Used AI Features', rows: metrics.aiList },
            { title: 'Processing Error Categories', rows: metrics.errorList },
          ].map((panel) => (
            <div key={panel.title} className="bg-[#14141D] border border-[#292938] rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-[#F8FAFC]">{panel.title}</h3>
              {panel.rows.length === 0 ? (
                <p className="text-[#64748B]">No data recorded</p>
              ) : (
                <div className="space-y-1.5">
                  {panel.rows.slice(0, 6).map((r) => (
                    <div key={r.name} className="flex justify-between">
                      <span className="text-[#94A3B8] truncate">{r.name}</span>
                      <span className="font-mono tabular-nums text-[#F8FAFC]">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </main>

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#14141D] border border-[#292938] rounded-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold">Reset Aggregate Analytics?</h3>
            <p className="text-xs text-[#94A3B8]">
              This zeroes out all stored aggregate counters on the server. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-4 py-2 rounded-md bg-[#1B1B27] text-xs font-medium text-[#F8FAFC]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleResetAnalytics()}
                className="px-4 py-2 rounded-md bg-[#F43F5E] text-xs font-semibold text-[#F8FAFC]"
              >
                Reset Counters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
