import {
  ArrowRight,
  AudioWaveform,
  ChevronDown,
  Cpu,
  Disc3,
  Download,
  Film,
  HardDrive,
  Layers,
  Lock,
  Sliders,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { HeroWaveformPreview } from '../components/HeroWaveformPreview';
import {
  ParallaxFrame,
  ScrollProgressBar,
  ScrollReveal,
  STUDIO_EASE,
  StaggerGroup,
  StaggerItem,
} from '../components/MotionPrimitives';
import { StudioButton } from '../components/StudioButton';
import { useMixoraStore } from '../store/useMixoraStore';

const AUDIO_CONSOLE_IMG = '/src/assets/images/studio_audio_console_1795531034658.jpg';
const VIDEO_GRADING_IMG = '/src/assets/images/studio_video_grading_1795531035105.jpg';
const DJ_MIXER_IMG = '/src/assets/images/studio_dj_mixer_1795531033298.jpg';

const FAQS = [
  {
    q: 'Is MIXORA genuinely free without hidden paywalls or watermarks?',
    a: 'Yes. Every audio tool, DJ deck, mashup analyzer, color grading slider, and media exporter is 100% free with zero subscriptions, zero watermarks, and no account registration.',
  },
  {
    q: 'Are my audio or video files uploaded to a server?',
    a: 'Never. All decoding, effects processing, color grading, analysis, and export encoding happen strictly inside your browser using Web Audio API, Canvas, and local codecs. Your media stays on your device.',
  },
  {
    q: 'How are my projects saved without user accounts?',
    a: 'You can save project timelines locally in your browser IndexedDB or download portable .mixora project files to your computer. When reopening on another device, MIXORA provides a relink-media workflow.',
  },
  {
    q: 'Which export formats are supported?',
    a: 'Audio exports directly to lossless 16-bit/24-bit WAV and encoded MP3 (128–320 kbps). Video exports to the native formats supported by your browser (MP4 H.264 or WebM VP9/VP8) with full color grading baked in.',
  },
  {
    q: 'How do the AI Lab tools work without paid cloud APIs?',
    a: 'MIXORA runs open client-side DSP algorithms directly on your CPU: onset autocorrelation for BPM, Goertzel chromagram correlation for musical key, Mid/Side matrix separation for vocals, and frequency-band stem splitting. Features requiring heavy external neural weights are transparently labeled rather than simulated.',
  },
];

export function HomePage() {
  const navigate = useMixoraStore((s) => s.navigate);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#09090D] text-[#F8FAFC]">
      <ScrollProgressBar />
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#09090D]/90 backdrop-blur-md border-b border-[#292938]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="font-display text-xl font-bold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0"
          >
            MIXORA
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#94A3B8]">
            <button
              type="button"
              onClick={() => scrollToSection('creative-tools')}
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              Tools
            </button>
            <button
              type="button"
              onClick={() => navigate('audio')}
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              Audio Studio
            </button>
            <button
              type="button"
              onClick={() => navigate('video')}
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              Video Studio
            </button>
            <button
              type="button"
              onClick={() => navigate('dj')}
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              DJ Mixer
            </button>
            <button
              type="button"
              onClick={() => navigate('ai')}
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              AI Lab
            </button>
          </nav>

          <StudioButton
            variant="primary"
            size="sm"
            onClick={() => navigate('dashboard')}
            className="text-sm font-medium"
          >
            Start Creating
          </StudioButton>
        </div>
      </header>

      {/* 1. Hero Section */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-20 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
            }}
            className="lg:col-span-6 space-y-6"
          >
            <motion.p
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: STUDIO_EASE } },
              }}
              className="text-sm font-medium text-[#22D3EE] tracking-wide"
            >
              Create. Mix. Edit. Enhance. Export.
            </motion.p>
            <motion.h1
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.48, ease: STUDIO_EASE } },
              }}
              className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.08] text-[#F8FAFC]"
            >
              Your Creative Studio. Completely Free.
            </motion.h1>
            <motion.p
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.46, ease: STUDIO_EASE } },
              }}
              className="text-base sm:text-lg text-[#94A3B8] leading-relaxed max-w-xl"
            >
              Create music mashups, edit videos, enhance audio and produce amazing content — all in
              one private browser-based studio.
            </motion.p>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.44, ease: STUDIO_EASE } },
              }}
              className="flex flex-wrap items-center gap-3 pt-2"
            >
              <StudioButton
                variant="primary"
                size="md"
                onClick={() => navigate('dashboard')}
              >
                Start Creating
                <ArrowRight className="w-4 h-4" />
              </StudioButton>
              <StudioButton
                variant="secondary"
                size="md"
                onClick={() => scrollToSection('creative-tools')}
                className="bg-[#14141D] font-medium"
              >
                Explore Tools
              </StudioButton>
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.44, ease: STUDIO_EASE } },
              }}
              className="pt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#94A3B8]"
            >
              <span className="text-[#F8FAFC] font-medium">100% Free</span>
              <span aria-hidden="true" className="text-[#292938]">·</span>
              <span className="text-[#F8FAFC] font-medium">No Account Required</span>
              <span aria-hidden="true" className="text-[#292938]">·</span>
              <span className="text-[#F8FAFC] font-medium">Your Files Stay on Your Device</span>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.56, delay: 0.14, ease: STUDIO_EASE }}
            className="lg:col-span-6"
          >
            <HeroWaveformPreview />
          </motion.div>
        </div>
      </section>

      {/* 2. Creative Tools (Asymmetric Bento Grid) */}
      <section id="creative-tools" className="border-t border-[#292938] py-20">
        <div className="max-w-7xl mx-auto px-6">
          <ScrollReveal className="max-w-2xl mb-12">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#F8FAFC]">
              Six integrated workspaces in one browser tab
            </h2>
            <p className="text-[#94A3B8] mt-3 leading-relaxed">
              Move cleanly between multitrack audio production, beat-matched mashups, live DJ
              mixing, video cutting, cinema color grading, and local conversion utilities.
            </p>
          </ScrollReveal>

          <StaggerGroup className="grid grid-cols-1 md:grid-cols-6 gap-5">
            <StaggerItem className="md:col-span-3">
              <motion.button
                type="button"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2, ease: STUDIO_EASE }}
                onClick={() => navigate('audio')}
                className="w-full h-full text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] hover:border-[#22D3EE]/50 rounded-xl p-6 transition-colors group"
              >
                <div className="flex items-center justify-between mb-4">
                  <AudioWaveform className="w-6 h-6 text-[#22D3EE]" />
                  <ArrowRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-display text-xl font-semibold text-[#F8FAFC]">Audio Studio</h3>
                <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
                  Multitrack timeline with trim, split, crossfade, reverse, pitch/speed controls, 3-band EQ,
                  reverb, delay, compressor, limiter, and lossless WAV or MP3 export.
                </p>
              </motion.button>
            </StaggerItem>

            <StaggerItem className="md:col-span-3">
              <motion.button
                type="button"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2, ease: STUDIO_EASE }}
                onClick={() => navigate('video')}
                className="w-full h-full text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] hover:border-[#8B5CF6]/50 rounded-xl p-6 transition-colors group"
              >
                <div className="flex items-center justify-between mb-4">
                  <Film className="w-6 h-6 text-[#8B5CF6]" />
                  <ArrowRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-display text-xl font-semibold text-[#F8FAFC]">
                  Video Editing & Color Grading
                </h3>
                <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
                  Multi-clip timeline, transitions, text titles, shapes, crop/rotate/speed controls, and
                  pixel-accurate Lift/Gamma/Gain color grading exported directly from Canvas.
                </p>
              </motion.button>
            </StaggerItem>

            <StaggerItem className="md:col-span-2">
              <motion.button
                type="button"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2, ease: STUDIO_EASE }}
                onClick={() => navigate('mashup')}
                className="w-full h-full text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] hover:border-[#3B82F6]/50 rounded-xl p-6 transition-colors group"
              >
                <div className="flex items-center justify-between mb-4">
                  <Sliders className="w-5 h-5 text-[#3B82F6]" />
                  <ArrowRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">
                  Music Mashup Creator
                </h3>
                <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
                  Real BPM detection, Camelot key compatibility analysis, beat alignment, and vocal/instrumental blending.
                </p>
              </motion.button>
            </StaggerItem>

            <StaggerItem className="md:col-span-2">
              <motion.button
                type="button"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2, ease: STUDIO_EASE }}
                onClick={() => navigate('dj')}
                className="w-full h-full text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] hover:border-[#22D3EE]/50 rounded-xl p-6 transition-colors group"
              >
                <div className="flex items-center justify-between mb-4">
                  <Disc3 className="w-5 h-5 text-[#22D3EE]" />
                  <ArrowRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">Dual-Deck DJ Mixer</h3>
                <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
                  Independent Deck A and B playback with cue points, pitch faders, tempo sync, 3-band kill EQ, and smooth crossfader.
                </p>
              </motion.button>
            </StaggerItem>

            <StaggerItem className="md:col-span-2">
              <motion.button
                type="button"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2, ease: STUDIO_EASE }}
                onClick={() => navigate('ai')}
                className="w-full h-full text-left bg-[#14141D] hover:bg-[#1B1B27] border border-[#292938] hover:border-[#A3E635]/50 rounded-xl p-6 transition-colors group"
              >
                <div className="flex items-center justify-between mb-4">
                  <Sparkles className="w-5 h-5 text-[#A3E635]" />
                  <ArrowRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">AI Lab & Utilities</h3>
                <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
                  Local DSP BPM/key detection, Mid/Side vocal splitting, 4-band stems, audio/video converters, and image resizers.
                </p>
              </motion.button>
            </StaggerItem>
          </StaggerGroup>
        </div>
      </section>

      {/* 3. Audio Studio Spotlight */}
      <section className="border-t border-[#292938] py-20 overflow-x-clip">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <ScrollReveal direction="right" className="lg:col-span-6 flex flex-col justify-center space-y-5">
            <p className="text-xs font-medium text-[#22D3EE]">01. Audio Studio & DJ Mixing</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#F8FAFC]">
              Real-time Web Audio DSP without installing heavy DAW software
            </h2>
            <p className="text-[#94A3B8] leading-relaxed">
              Import MP3, WAV, FLAC, OGG, or AAC files straight into a synchronized multitrack
              engine. Sculpt tone with 3-band EQ, bass boost, algorithmic convolution reverb,
              stereo delay, dynamics compression, and brickwall limiting — then bounce offline to
              16-bit/24-bit WAV or 320 kbps MP3.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <StudioButton
                variant="secondary"
                size="sm"
                onClick={() => navigate('audio')}
                className="text-sm font-medium"
              >
                Open Audio Studio
              </StudioButton>
              <button
                type="button"
                onClick={() => navigate('dj')}
                className="px-4 py-2 rounded-md text-sm font-medium text-[#22D3EE] hover:text-[#F8FAFC] transition-colors"
              >
                Launch DJ Mixer
              </button>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="left" delay={0.08} className="lg:col-span-6">
            <ParallaxFrame className="h-full min-h-[280px] rounded-xl border border-[#292938] bg-[#14141D]">
              {!imgErrors.audio ? (
                <img
                  src={AUDIO_CONSOLE_IMG}
                  alt="Dark mastering audio studio console representing MIXORA Audio Studio"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrors((e) => ({ ...e, audio: true }))}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-[#94A3B8]">
                  <AudioWaveform className="w-10 h-10 text-[#22D3EE] mb-3" />
                  <span className="text-sm font-medium">Multitrack Audio Console</span>
                </div>
              )}
            </ParallaxFrame>
          </ScrollReveal>
        </div>
      </section>

      {/* 4. Video Studio & Color Correction Spotlight */}
      <section className="border-t border-[#292938] py-20 bg-[#0D0D14] overflow-x-clip">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <ScrollReveal direction="right" delay={0.08} className="lg:col-span-6 order-2 lg:order-1">
            <ParallaxFrame className="h-full min-h-[280px] rounded-xl border border-[#292938] bg-[#14141D]">
              {!imgErrors.video ? (
                <img
                  src={VIDEO_GRADING_IMG}
                  alt="Cinema color grading desk with reference monitor representing MIXORA Video Studio"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrors((e) => ({ ...e, video: true }))}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-[#94A3B8]">
                  <Film className="w-10 h-10 text-[#8B5CF6] mb-3" />
                  <span className="text-sm font-medium">Cinema Color Grading Suite</span>
                </div>
              )}
            </ParallaxFrame>
          </ScrollReveal>

          <ScrollReveal direction="left" className="lg:col-span-6 order-1 lg:order-2 flex flex-col justify-center space-y-5">
            <p className="text-xs font-medium text-[#8B5CF6]">02. Video Studio & Color Grading</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#F8FAFC]">
              Precision cuts, motion titles, and pixel-accurate color grading
            </h2>
            <p className="text-[#94A3B8] leading-relaxed">
              Cut, merge, crop, rotate, slow down, and layer animated titles or lower-thirds on a
              multi-track timeline. Grade exposure, highlights, shadows, RGB channels, vibrance, and
              Lift/Gamma/Gain with Before/After split preview — rendered through the exact same
              Canvas pixel pipeline at export.
            </p>
            <div className="pt-2">
              <StudioButton
                variant="primary"
                size="sm"
                onClick={() => navigate('video')}
                className="text-sm font-medium"
              >
                Open Video Studio
              </StudioButton>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 5. AI Lab & DJ / Mashup Intelligence */}
      <section className="border-t border-[#292938] py-20 overflow-x-clip">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <ScrollReveal direction="right" className="lg:col-span-6 flex flex-col justify-center space-y-5">
            <p className="text-xs font-medium text-[#A3E635]">03. Local AI Lab & Mashup Engine</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#F8FAFC]">
              Honest client-side audio intelligence — no cloud queues or fake scores
            </h2>
            <p className="text-[#94A3B8] leading-relaxed">
              Run real local DSP analyzers to detect tempo, beat grids, musical key (with Camelot
              wheel notation), and section energy. Split vocals and instrumentals using Mid/Side
              stereo processing, separate 4-band frequency stems, extract sharp video thumbnails, and
              get genuine mashup transition recommendations.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <StudioButton
                variant="secondary"
                size="sm"
                onClick={() => navigate('ai')}
                className="text-sm font-medium"
              >
                Explore AI Lab
              </StudioButton>
              <button
                type="button"
                onClick={() => navigate('mashup')}
                className="px-4 py-2 rounded-md text-sm font-medium text-[#8B5CF6] hover:text-[#F8FAFC] transition-colors"
              >
                Try Smart Mashup Assistant
              </button>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="left" delay={0.08} className="lg:col-span-6">
            <ParallaxFrame className="h-full min-h-[280px] rounded-xl border border-[#292938] bg-[#14141D]">
              {!imgErrors.dj ? (
                <img
                  src={DJ_MIXER_IMG}
                  alt="Dual-deck dark matte DJ controller representing MIXORA DJ Mixer and Mashup tools"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrors((e) => ({ ...e, dj: true }))}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-[#94A3B8]">
                  <Disc3 className="w-10 h-10 text-[#22D3EE] mb-3" />
                  <span className="text-sm font-medium">Dual-Deck DJ & Mashup Engine</span>
                </div>
              )}
            </ParallaxFrame>
          </ScrollReveal>
        </div>
      </section>

      {/* 6. How It Works */}
      <section className="border-t border-[#292938] py-20 bg-[#0D0D14]">
        <div className="max-w-7xl mx-auto px-6">
          <ScrollReveal>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#F8FAFC] mb-10">
              How MIXORA works
            </h2>
          </ScrollReveal>
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: '01. Load Media',
                body: 'Drop audio, video, or images directly from your device—or generate built-in studio test tracks.',
              },
              {
                step: '02. Edit & Mix',
                body: 'Arrange multitrack audio, blend two tracks in the Mashup Creator, or grade video color in real time.',
              },
              {
                step: '03. Save Locally',
                body: 'Optionally persist workspace state to IndexedDB or export a portable .mixora project file.',
              },
              {
                step: '04. Direct Export',
                body: 'Encode WAV, MP3, MP4/WebM, or PNG/WebP right inside your browser and download immediately.',
              },
            ].map((item) => (
              <StaggerItem key={item.step} className="space-y-2 border-t border-[#292938] pt-5">
                <h3 className="font-display text-base font-semibold text-[#F8FAFC]">{item.step}</h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed">{item.body}</p>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* 7. Privacy First & 8. Why MIXORA */}
      <section className="border-t border-[#292938] py-20">
        <StaggerGroup className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12">
          <StaggerItem className="bg-[#14141D] border border-[#292938] rounded-xl p-8 space-y-5">
            <Lock className="w-6 h-6 text-[#A3E635]" />
            <h2 className="font-display text-2xl font-bold text-[#F8FAFC]">
              Privacy-first by architecture, not policy promises
            </h2>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              MIXORA has no cloud media buckets, no file-upload endpoints, and no user account
              database. Everything you import is held in temporary browser memory and released as
              soon as you clear your workspace or close the tab.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-sm text-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-4 h-4 text-[#22D3EE] shrink-0" />
                <span>Zero server media uploads</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                <span>100% client-side processing</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4 text-[#A3E635] shrink-0" />
                <span>Direct device downloads</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-[#3B82F6] shrink-0" />
                <span>Portable .mixora JSON files</span>
              </div>
            </div>
          </StaggerItem>

          <StaggerItem className="bg-[#14141D] border border-[#292938] rounded-xl p-8 space-y-5">
            <Wrench className="w-6 h-6 text-[#8B5CF6]" />
            <h2 className="font-display text-2xl font-bold text-[#F8FAFC]">Why creators use MIXORA</h2>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              Most browser editors gate exports behind subscriptions, slap watermarks onto video, or
              upload private stems to remote servers. MIXORA was designed as a clean, permanent free
              alternative built on open web standards.
            </p>
            <ul className="space-y-2.5 text-sm text-[#94A3B8] pt-1">
              <li className="text-[#F8FAFC]">No login screens, trial timers, or credit limits.</li>
              <li className="text-[#F8FAFC]">
                Dedicated desktop workstation layout and compact mobile touch workspace.
              </li>
              <li className="text-[#F8FAFC]">
                Transparent browser codec reporting—never faking unsupported exports.
              </li>
            </ul>
            <div className="pt-2">
              <StudioButton
                variant="primary"
                size="sm"
                onClick={() => navigate('dashboard')}
                className="px-5 py-2.5 text-sm font-medium"
              >
                Open Creative Dashboard
                <ArrowRight className="w-4 h-4" />
              </StudioButton>
            </div>
          </StaggerItem>
        </StaggerGroup>
      </section>

      {/* 9. FAQ */}
      <section className="border-t border-[#292938] py-20 bg-[#0D0D14]">
        <div className="max-w-3xl mx-auto px-6">
          <ScrollReveal>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#F8FAFC] mb-8">
              Frequently asked questions
            </h2>
          </ScrollReveal>
          <StaggerGroup className="divide-y divide-[#292938] border-y border-[#292938]" staggerDelay={0.05}>
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <StaggerItem key={item.q} distance={14} className="py-4">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 text-left text-sm sm:text-base font-medium text-[#F8FAFC] hover:text-[#22D3EE] transition-colors"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#94A3B8] shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-[#8B5CF6]' : ''
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.24, ease: STUDIO_EASE }}
                        className="overflow-hidden"
                      >
                        <p className="mt-3 text-sm text-[#94A3B8] leading-relaxed">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </StaggerItem>
              );
            })}
          </StaggerGroup>
        </div>
      </section>

      {/* 10. Quiet Footer */}
      <footer className="border-t border-[#292938] py-12">
        <ScrollReveal
          distance={16}
          className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        >
          <div>
            <p className="font-display text-lg font-bold tracking-tight text-[#F8FAFC]">MIXORA</p>
            <p className="text-xs text-[#94A3B8] mt-1">
              Free All-in-One Audio & Video Creative Studio · Local Browser Processing
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm text-[#94A3B8]">
            <button type="button" onClick={() => navigate('dashboard')} className="hover:text-[#F8FAFC] transition-colors">
              Dashboard
            </button>
            <button type="button" onClick={() => navigate('audio')} className="hover:text-[#F8FAFC] transition-colors">
              Audio Studio
            </button>
            <button type="button" onClick={() => navigate('video')} className="hover:text-[#F8FAFC] transition-colors">
              Video Studio
            </button>
            <button type="button" onClick={() => navigate('tools')} className="hover:text-[#F8FAFC] transition-colors">
              Media Tools
            </button>
            <button type="button" onClick={() => navigate('projects')} className="hover:text-[#F8FAFC] transition-colors">
              My Projects
            </button>
            <button type="button" onClick={() => navigate('about')} className="hover:text-[#F8FAFC] transition-colors">
              About
            </button>
          </div>
        </ScrollReveal>
      </footer>
    </div>
  );
}
