import {
  AudioWaveform,
  Disc3,
  Film,
  FolderOpen,
  Home,
  Info,
  LayoutDashboard,
  Menu,
  Save,
  Sliders,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useMixoraStore } from '../store/useMixoraStore';
import type { RouteId } from '../types/mixora';

interface StudioLayoutProps {
  children: React.ReactNode;
}

const STUDIO_NAV: { id: RouteId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'audio', label: 'Audio Studio', icon: AudioWaveform },
  { id: 'mashup', label: 'Mashup Creator', icon: Sliders },
  { id: 'dj', label: 'DJ Mixer', icon: Disc3 },
  { id: 'video', label: 'Video Studio', icon: Film },
  { id: 'ai', label: 'AI Lab', icon: Sparkles },
  { id: 'tools', label: 'Media Tools', icon: Wrench },
  { id: 'projects', label: 'My Projects', icon: FolderOpen },
  { id: 'about', label: 'About', icon: Info },
];

const MOBILE_BAR_NAV: { id: RouteId; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Studio', icon: LayoutDashboard },
  { id: 'audio', label: 'Audio', icon: AudioWaveform },
  { id: 'dj', label: 'DJ', icon: Disc3 },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'tools', label: 'Tools', icon: Wrench },
];

export function StudioLayout({ children }: StudioLayoutProps) {
  const route = useMixoraStore((s) => s.route);
  const navigate = useMixoraStore((s) => s.navigate);
  const projectName = useMixoraStore((s) => s.projectName);
  const setProjectMeta = useMixoraStore((s) => s.setProjectMeta);
  const saveCurrentProjectLocally = useMixoraStore((s) => s.saveCurrentProjectLocally);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isEditingWorkspace = route === 'audio' || route === 'video' || route === 'mashup';

  return (
    <div className="min-h-screen bg-[#09090D] text-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 xl:w-60 shrink-0 bg-[#14141D] border-r border-[#292938] sticky top-0 h-screen">
        <div className="h-14 px-5 flex items-center border-b border-[#292938]">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="font-display text-lg font-bold tracking-tight text-[#F8FAFC] hover:text-[#8B5CF6] transition-colors whitespace-nowrap shrink-0"
          >
            MIXORA
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5" aria-label="Studio navigation">
          {STUDIO_NAV.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'text-[#F8FAFC]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="studio-nav-active-bg"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 rounded-md bg-[#8B5CF6]/15"
                  />
                )}
                <Icon className={`relative z-10 w-4 h-4 shrink-0 ${active ? 'text-[#8B5CF6]' : 'text-[#94A3B8]'}`} />
                <span className="relative z-10 truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#292938]">
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Local processing only. Media files never leave your browser.
          </p>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen pb-16 lg:pb-0">
        {/* Compact Workspace Top Bar */}
        <header className="h-14 bg-[#14141D] border-b border-[#292938] px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open studio menu"
              className="lg:hidden p-2 -ml-1 rounded-md text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27]"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => navigate('home')}
              className="lg:hidden font-display text-base font-bold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0"
            >
              MIXORA
            </button>

            {isEditingWorkspace ? (
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <span className="text-xs text-[#94A3B8] whitespace-nowrap">Project</span>
                <span className="text-[#292938]">/</span>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectMeta(e.target.value)}
                  aria-label="Project title"
                  className="bg-transparent text-sm font-medium text-[#F8FAFC] border border-transparent hover:border-[#292938] focus:border-[#8B5CF6] rounded px-2 py-1 min-w-0 w-52 truncate"
                />
              </div>
            ) : (
              <span className="hidden lg:inline text-sm font-medium text-[#94A3B8] whitespace-nowrap">
                {STUDIO_NAV.find((n) => n.id === route)?.label ?? 'Studio'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isEditingWorkspace && (
              <button
                type="button"
                onClick={() => void saveCurrentProjectLocally()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-xs font-medium text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5 text-[#22D3EE]" />
                Save Locally
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('projects')}
              className="px-3 py-1.5 rounded-md bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-medium text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              My Projects
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Mobile Full Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 bg-black/70"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-72 max-w-[82vw] bg-[#14141D] border-r border-[#292938] h-full flex flex-col p-4 z-10"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#292938]">
                <span className="font-display text-lg font-bold tracking-tight">MIXORA</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="p-2 rounded-md text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-3 space-y-1">
                {STUDIO_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = route === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        navigate(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[#8B5CF6]/15 text-[#F8FAFC]'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-[#8B5CF6]' : 'text-[#94A3B8]'}`} />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Compact Bottom Tab Bar (56px high, touch-friendly >=44px targets) */}
      <nav
        aria-label="Mobile quick navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-[#14141D] border-t border-[#292938] z-30 grid grid-cols-5"
      >
        {MOBILE_BAR_NAV.map((item) => {
          const Icon = item.icon;
          const active = route === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? 'text-[#8B5CF6]' : 'text-[#94A3B8]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
