import { Cpu, HardDrive, Lock, ShieldCheck, Terminal } from 'lucide-react';
import { MixoraLogo } from '../components/MixoraLogo';
import { ScrollReveal, StaggerGroup, StaggerItem } from '../components/MotionPrimitives';
import { useMixoraStore } from '../store/useMixoraStore';

export function AboutPage() {
  const capabilities = useMixoraStore((s) => s.capabilities);

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <ScrollReveal distance={16} className="border-b border-[#292938] pb-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <MixoraLogo className="w-20 h-20" />
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold tracking-tight studio-gradient-text">
            About MIXORA
          </h1>
          <p className="text-sm text-[#94A3B8] leading-relaxed max-w-3xl">
            MIXORA is a free, browser-first audio and video creative studio engineered around strict
            local processing, zero user accounts, and direct device downloads.
          </p>
        </div>
      </ScrollReveal>

      <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <StaggerItem className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-3">
          <Lock className="w-5 h-5 text-[#A3E635]" />
          <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
            Zero Cloud Media Storage
          </h2>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Uploaded audio, video, and image files never leave your browser. All Web Audio DSP,
            Canvas2D pixel color grading, MP3/WAV encoding, and MediaRecorder video exports execute
            entirely in local device memory.
          </p>
        </StaggerItem>

        <StaggerItem className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-3">
          <ShieldCheck className="w-5 h-5 text-[#22D3EE]" />
          <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
            No Accounts or Paywalls
          </h2>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            There is no registration, no login wall, no subscription tier, and no export watermark.
            Optional project saving uses your browser&apos;s IndexedDB and portable .mixora JSON
            files you own.
          </p>
        </StaggerItem>
      </StaggerGroup>

      <ScrollReveal className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-[#8B5CF6]" />
          <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
            Detected Browser Codec & Engine Support
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <p className="font-medium text-[#F8FAFC]">Audio Engines</p>
            <p className="text-[#94A3B8]">
              Web Audio API: {capabilities?.webAudio ? 'Available' : 'Unavailable'}
            </p>
            <p className="text-[#94A3B8]">
              AudioWorklet: {capabilities?.audioWorklet ? 'Available' : 'Script fallback'}
            </p>
            <p className="text-[#94A3B8]">Exports: 16/24-bit WAV PCM, 128–320 kbps LAME MP3</p>
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-[#F8FAFC]">Video Export Codecs (This Browser)</p>
            {capabilities?.supportedVideoExports.length ? (
              <ul className="space-y-1 text-[#94A3B8] font-mono">
                {capabilities.supportedVideoExports.map((c) => (
                  <li key={c.mimeType}>{c.label}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[#F59E0B]">No MediaRecorder video codecs reported.</p>
            )}
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.06} className="bg-[#14141D] border border-[#292938] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-[#22D3EE]" />
          <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
            Self-Hosting & Deployment Reference
          </h2>
        </div>

        <div className="space-y-3 text-xs text-[#94A3B8] leading-relaxed">
          <p>
            MIXORA ships with an Express + Vite full-stack runtime serving the browser studio and an
            optional anonymous aggregate analytics endpoint.
          </p>
          <div className="bg-[#09090D] border border-[#292938] rounded-lg p-4 font-mono text-[11px] text-[#F8FAFC] space-y-1 overflow-x-auto">
            <p># Install dependencies</p>
            <p>npm install</p>
            <p className="pt-2"># Set optional server-side admin passcode in .env</p>
            <p>ADMIN_SECRET=&quot;your-strong-passcode&quot;</p>
            <p>ANALYTICS_ENABLED=&quot;true&quot;</p>
            <p className="pt-2"># Run development server (port 3000)</p>
            <p>npm run dev</p>
            <p className="pt-2"># Build & start production bundle</p>
            <p>npm run build &amp;&amp; NODE_ENV=production npm start</p>
          </div>
          <p className="flex items-center gap-2 text-[#94A3B8]">
            <HardDrive className="w-3.5 h-3.5 text-[#A3E635] shrink-0" />
            Operators can access aggregate anonymous metrics via the dedicated /admin route.
          </p>
        </div>
      </ScrollReveal>
    </div>
  );
}
