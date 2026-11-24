import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useMixoraStore } from '../store/useMixoraStore';

export function ToastContainer() {
  const toasts = useMixoraStore((s) => s.toasts);
  const dismiss = useMixoraStore((s) => s.dismissToast);

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] md:bottom-5 pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const icon =
            t.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#A3E635] shrink-0 mt-0.5" />
            ) : t.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-[#F43F5E] shrink-0 mt-0.5" />
            ) : t.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-[#22D3EE] shrink-0 mt-0.5" />
            );

          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex items-start gap-3 bg-[#14141D] border border-[#292938] rounded-lg px-4 py-3 shadow-xl"
            >
              {icon}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#F8FAFC] leading-snug">{t.title}</p>
                {t.detail && <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">{t.detail}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-[#94A3B8] hover:text-[#F8FAFC] p-1 rounded transition-colors shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
