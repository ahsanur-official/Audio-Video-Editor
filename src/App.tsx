import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { StudioLayout } from './components/StudioLayout';
import { ToastContainer } from './components/ToastContainer';
import { HomePage } from './pages/HomePage';
import { useMixoraStore } from './store/useMixoraStore';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const AudioStudioPage = lazy(() =>
  import('./pages/AudioStudioPage').then((m) => ({ default: m.AudioStudioPage }))
);
const MashupCreatorPage = lazy(() =>
  import('./pages/MashupCreatorPage').then((m) => ({ default: m.MashupCreatorPage }))
);
const DJMixerPage = lazy(() =>
  import('./pages/DJMixerPage').then((m) => ({ default: m.DJMixerPage }))
);
const VideoStudioPage = lazy(() =>
  import('./pages/VideoStudioPage').then((m) => ({ default: m.VideoStudioPage }))
);
const AILabPage = lazy(() =>
  import('./pages/AILabPage').then((m) => ({ default: m.AILabPage }))
);
const MediaToolsPage = lazy(() =>
  import('./pages/MediaToolsPage').then((m) => ({ default: m.MediaToolsPage }))
);
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage }))
);

const ROUTE_TRANSITION = {
  initial: { opacity: 0, y: 14, scale: 0.992 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.995 },
  transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
};

const SHELL_TRANSITION = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
};

function RouteLoadingFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center gap-2.5 text-sm text-[#94A3B8]">
      <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />
      <span>Loading studio module...</span>
    </div>
  );
}

export default function App() {
  const route = useMixoraStore((s) => s.route);
  const initApp = useMixoraStore((s) => s.initApp);

  useEffect(() => {
    void initApp();
  }, [initApp]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [route]);

  const shellKey = route === 'home' ? 'home' : route === 'admin' ? 'admin' : 'studio';

  const renderWorkspace = () => {
    switch (route) {
      case 'dashboard':
        return <DashboardPage />;
      case 'audio':
        return <AudioStudioPage />;
      case 'mashup':
        return <MashupCreatorPage />;
      case 'dj':
        return <DJMixerPage />;
      case 'video':
        return <VideoStudioPage />;
      case 'ai':
        return <AILabPage />;
      case 'tools':
        return <MediaToolsPage />;
      case 'projects':
        return <ProjectsPage />;
      case 'about':
        return <AboutPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {shellKey === 'home' ? (
          <motion.div key="home-shell" {...SHELL_TRANSITION}>
            <HomePage />
          </motion.div>
        ) : shellKey === 'admin' ? (
          <motion.div key="admin-shell" {...SHELL_TRANSITION}>
            <Suspense fallback={<RouteLoadingFallback />}>
              <AdminPage />
            </Suspense>
          </motion.div>
        ) : (
          <motion.div key="studio-shell" {...SHELL_TRANSITION}>
            <StudioLayout>
              <AnimatePresence mode="wait">
                <motion.div key={route} {...ROUTE_TRANSITION}>
                  <Suspense fallback={<RouteLoadingFallback />}>{renderWorkspace()}</Suspense>
                </motion.div>
              </AnimatePresence>
            </StudioLayout>
          </motion.div>
        )}
      </AnimatePresence>
      <ToastContainer />
    </MotionConfig>
  );
}
