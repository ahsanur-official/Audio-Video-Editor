import {
  AudioWaveform,
  Command,
  Disc3,
  Film,
  FolderOpen,
  Home,
  Info,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { MixoraLogo } from './MixoraLogo';
import { ModalTransition, ScrollProgressBar } from './MotionPrimitives';
import { StudioButton } from './StudioButton';
import { useMixoraStore } from '../store/useMixoraStore';
import type { RouteId } from '../types/mixora';

interface StudioLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  id: RouteId;
  label: string;
  shortDesc: string;
  icon: typeof Home;
  accent: string;
  group: 'Workspace' | 'Creative Suite' | 'Tools & Library';
}

const STUDIO_NAV: NavItem[] = [
  { id: 'home', label: 'Home', shortDesc: 'Overview & highlights', icon: Home, accent: '#8B5CF6', group: 'Workspace' },
  { id: 'dashboard', label: 'Dashboard', shortDesc: 'Studio hub & quick launch', icon: LayoutDashboard, accent: '#3B82F6', group: 'Workspace' },
  { id: 'audio', label: 'Audio Studio', shortDesc: 'Multitrack DAW, mic & FX', icon: AudioWaveform, accent: '#22D3EE', group: 'Creative Suite' },
  { id: 'mashup', label: 'Mashup Creator', shortDesc: 'Unlimited multi-song mashups', icon: Sliders, accent: '#8B5CF6', group: 'Creative Suite' },
  { id: 'dj', label: 'DJ Mixer', shortDesc: 'Dual decks, FX & live sampler', icon: Disc3, accent: '#3B82F6', group: 'Creative Suite' },
  { id: 'video', label: 'Video Studio', shortDesc: 'Timeline, LUT grading & capture', icon: Film, accent: '#EC4899', group: 'Creative Suite' },
  { id: 'ai', label: 'AI Lab', shortDesc: 'BPM, key, stems & mastering', icon: Sparkles, accent: '#22D3EE', group: 'Tools & Library' },
  { id: 'tools', label: 'Media Tools', shortDesc: 'Multi-quality converters', icon: Wrench, accent: '#A3E635', group: 'Tools & Library' },
  { id: 'projects', label: 'My Projects', shortDesc: 'Local IndexedDB library', icon: FolderOpen, accent: '#F59E0B', group: 'Tools & Library' },
  { id: 'about', label: 'About', shortDesc: 'Privacy & local engine', icon: Info, accent: '#94A3B8', group: 'Tools & Library' },
];

const NAV_GROUPS: NavItem['group'][] = ['Workspace', 'Creative Suite', 'Tools & Library'];

const MOBILE_BAR_NAV: { id: RouteId; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Studio', icon: LayoutDashboard },
  { id: 'audio', label: 'Audio', icon: AudioWaveform },
  { id: 'mashup', label: 'Mashup', icon: Sliders },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'tools', label: 'Tools', icon: Wrench },
];

export function StudioLayout({ children }: StudioLayoutProps) {
  const route = useMixoraStore((s) => s.route);
  const navigate = useMixoraStore((s) => s.navigate);
  const projectName = useMixoraStore((s) => s.projectName);
  const setProjectMeta = useMixoraStore((s) => s.setProjectMeta);
  const saveCurrentProjectLocally = useMixoraStore((s) => s.saveCurrentProjectLocally);
  const sidebarCollapsed = useMixoraStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useMixoraStore((s) => s.toggleSidebarCollapsed);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  const isEditingWorkspace = route === 'audio' || route === 'video' || route === 'mashup';
  const currentNav = STUDIO_NAV.find((n) => n.id === route);

  // Global keyboard shortcuts: Cmd/Ctrl+K for Command Palette, '[' for sidebar collapse
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
        setCommandQuery('');
        return;
      }
      if (e.key === 'Escape' && commandOpen) {
        setCommandOpen(false);
        return;
      }
      if (!isInput && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '[') {
        e.preventDefault();
        toggleSidebarCollapsed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandOpen, toggleSidebarCollapsed]);

  const filteredCommands = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return STUDIO_NAV;
    return STUDIO_NAV.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.shortDesc.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [commandQuery]);

  return (
    <div className="min-h-screen bg-[#09090D] text-[#F8FAFC] flex flex-col lg:flex-row">
      {!isEditingWorkspace && <ScrollProgressBar />}

      {/* Desktop Collapsible & Expandable Left Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 76 : 252 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="hidden lg:flex lg:flex-col shrink-0 bg-[#12121B] border-r border-[#292938]/90 sticky top-0 h-screen z-30 relative"
      >
        {/* Subtle top gradient hairline */}
        <div
          aria-hidden="true"
          className="h-[2px] w-full bg-gradient-to-r from-[#8B5CF6] via-[#3B82F6] to-[#22D3EE]"
        />

        {/* Brand Header + Collapse Toggle */}
        <div
          className={`h-[74px] flex items-center border-b border-[#292938]/80 ${
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
          }`}
        >
          <button
            type="button"
            onClick={() => navigate('home')}
            className="flex items-center gap-3 group min-w-0"
            title="MIXORA Home"
          >
            <MixoraLogo
              className={
                sidebarCollapsed
                  ? 'w-11 h-11 transition-transform duration-200 group-hover:scale-105'
                  : 'w-12 h-12 transition-transform duration-200 group-hover:scale-105'
              }
            />
            <AnimatePresence initial={false}>
              {!sidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.16 }}
                  className="overflow-hidden text-left"
                >
                  <span className="block font-display text-lg font-bold tracking-tight studio-gradient-text leading-none">
                    MIXORA
                  </span>
                  <span className="block text-[10px] text-[#94A3B8] tracking-wider uppercase mt-1 whitespace-nowrap">
                    Creative Studio
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title="Collapse sidebar ([)"
              aria-label="Collapse sidebar"
              className="p-1.5 rounded-md text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27] transition-colors shrink-0"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5 space-y-4"
          aria-label="Studio navigation"
        >
          {NAV_GROUPS.map((groupName) => {
            const items = STUDIO_NAV.filter((n) => n.group === groupName);
            return (
              <div key={groupName} className="space-y-1">
                {!sidebarCollapsed ? (
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
                    {groupName}
                  </p>
                ) : (
                  <div className="mx-3 my-1.5 h-px bg-[#292938]/70" />
                )}

                {items.map((item) => {
                  const Icon = item.icon;
                  const active = route === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id)}
                      title={sidebarCollapsed ? `${item.label} — ${item.shortDesc}` : undefined}
                      className={`group relative w-full flex items-center ${
                        sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-2.5 py-2.5'
                      } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'text-[#F8FAFC]'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27]/80'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="studio-nav-active-bg"
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-0 rounded-lg studio-nav-bar-glow border border-[#8B5CF6]/35"
                        />
                      )}
                      {active && (
                        <motion.span
                          layoutId="studio-nav-active-rail"
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-gradient-to-b from-[#8B5CF6] via-[#3B82F6] to-[#22D3EE]"
                        />
                      )}

                      <span
                        className={`relative z-10 w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          active
                            ? 'bg-[#8B5CF6]/20 text-[#F8FAFC]'
                            : 'text-[#94A3B8] group-hover:text-[#F8FAFC] group-hover:bg-[#232333]'
                        }`}
                      >
                        <Icon
                          className="w-4 h-4"
                          style={active ? { color: item.accent } : undefined}
                        />
                      </span>

                      {!sidebarCollapsed && (
                        <span className="relative z-10 truncate text-[13px]">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer: Privacy badge + Expand button when collapsed */}
        <div className="p-2.5 border-t border-[#292938]/80 space-y-2">
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title="Expand sidebar ([)"
              aria-label="Expand sidebar"
              className="w-full flex items-center justify-center p-2 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27] transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <div className="rounded-lg bg-[#0D0D14] border border-[#292938]/80 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F8FAFC]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#22D3EE] shrink-0" />
                <span>100% Local & Free</span>
              </div>
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                Zero cloud uploads. Press <kbd className="px-1 py-0.5 rounded bg-[#1B1B27] text-[#F8FAFC] font-mono text-[10px]">[</kbd> to toggle rail.
              </p>
            </div>
          )}
        </div>
      </motion.aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen pb-16 lg:pb-0">
        {/* Polished Workspace Top Bar */}
        <header className="h-16 bg-[#12121B]/90 backdrop-blur-md border-b border-[#292938]/90 px-4 lg:px-6 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
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
              onClick={toggleSidebarCollapsed}
              title={sidebarCollapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:inline-flex p-1.5 rounded-md text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27] transition-colors"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('home')}
              className="lg:hidden flex items-center gap-2.5 whitespace-nowrap shrink-0"
            >
              <MixoraLogo className="w-10 h-10" />
              <span className="font-display text-base font-bold tracking-tight studio-gradient-text">
                MIXORA
              </span>
            </button>

            {isEditingWorkspace ? (
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <span className="text-xs text-[#94A3B8] whitespace-nowrap">
                  {currentNav?.label}
                </span>
                <span className="text-[#292938]">/</span>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectMeta(e.target.value)}
                  aria-label="Project title"
                  className="bg-[#09090D]/60 text-sm font-medium text-[#F8FAFC] border border-[#292938]/70 hover:border-[#8B5CF6]/50 focus:border-[#8B5CF6] rounded-md px-2.5 py-1 min-w-0 w-52 truncate transition-colors"
                />
              </div>
            ) : (
              <div className="hidden lg:flex items-center gap-2">
                <span className="text-sm font-semibold text-[#F8FAFC] whitespace-nowrap">
                  {currentNav?.label ?? 'Studio'}
                </span>
                {currentNav && (
                  <span className="text-xs text-[#64748B] whitespace-nowrap">
                    — {currentNav.shortDesc}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCommandOpen(true);
                setCommandQuery('');
              }}
              className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#09090D]/80 border border-[#292938] hover:border-[#8B5CF6]/60 text-xs text-[#94A3B8] hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              <Search className="w-3.5 h-3.5 text-[#8B5CF6]" />
              <span>Quick Jump</span>
              <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#1B1B27] text-[10px] font-mono text-[#94A3B8]">
                <Command className="w-2.5 h-2.5" />K
              </kbd>
            </button>

            {isEditingWorkspace && (
              <StudioButton
                variant="secondary"
                size="xs"
                onClick={() => void saveCurrentProjectLocally()}
                className="font-medium"
              >
                <Save className="w-3.5 h-3.5 text-[#22D3EE]" />
                Save Locally
              </StudioButton>
            )}
            <StudioButton
              variant="primary"
              size="xs"
              onClick={() => navigate('projects')}
              className="font-medium bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:from-[#7C3AED] hover:to-[#2563EB] border-0"
            >
              My Projects
            </StudioButton>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Quick Jump Command Palette (Cmd/Ctrl+K) */}
      <ModalTransition open={commandOpen} onClose={() => setCommandOpen(false)}>
        <div className="bg-[#14141D] border border-[#292938] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#292938]">
            <Search className="w-4 h-4 text-[#8B5CF6] shrink-0" />
            <input
              type="text"
              autoFocus
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
              placeholder="Jump to Audio Studio, Mashup, Video, DJ Mixer, Tools..."
              className="flex-1 bg-transparent text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setCommandOpen(false)}
              className="text-xs px-1.5 py-0.5 rounded bg-[#1B1B27] text-[#94A3B8] hover:text-[#F8FAFC]"
            >
              ESC
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2 space-y-1">
            {filteredCommands.length === 0 ? (
              <p className="text-xs text-[#94A3B8] text-center py-6">No matching workspace found.</p>
            ) : (
              filteredCommands.map((item) => {
                const Icon = item.icon;
                const active = route === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigate(item.id);
                      setCommandOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      active
                        ? 'studio-nav-bar-glow border border-[#8B5CF6]/40 text-[#F8FAFC]'
                        : 'hover:bg-[#1B1B27] text-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-md bg-[#1B1B27] flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" style={{ color: item.accent }} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        <p className="text-xs text-[#94A3B8] truncate">{item.shortDesc}</p>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-[#64748B] shrink-0">
                      {item.group}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </ModalTransition>

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
                <div className="flex items-center gap-3">
                  <MixoraLogo className="w-12 h-12" />
                  <div>
                    <span className="block font-display text-lg font-bold tracking-tight studio-gradient-text leading-none">
                      MIXORA
                    </span>
                    <span className="block text-[10px] text-[#94A3B8] uppercase tracking-wider mt-1">
                      Creative Studio
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="p-2 rounded-md text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-3 space-y-4">
                {NAV_GROUPS.map((groupName) => (
                  <div key={groupName} className="space-y-1">
                    <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                      {groupName}
                    </p>
                    {STUDIO_NAV.filter((n) => n.group === groupName).map((item) => {
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
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            active
                              ? 'studio-nav-bar-glow border border-[#8B5CF6]/35 text-[#F8FAFC]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B1B27]'
                          }`}
                        >
                          <Icon className="w-4 h-4" style={{ color: active ? item.accent : undefined }} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Compact Bottom Tab Bar */}
      <nav
        aria-label="Mobile quick navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-[#12121B]/95 backdrop-blur-md border-t border-[#292938] z-30 grid grid-cols-5"
      >
        {MOBILE_BAR_NAV.map((item) => {
          const Icon = item.icon;
          const active = route === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? 'text-[#F8FAFC]' : 'text-[#94A3B8]'
              }`}
            >
              {active && (
                <span className="absolute top-0 inset-x-3 h-[2px] rounded-b-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE]" />
              )}
              <Icon className={`w-4 h-4 ${active ? 'text-[#8B5CF6]' : ''}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
