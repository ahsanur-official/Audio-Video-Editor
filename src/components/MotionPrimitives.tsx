import {
  AnimatePresence,
  type HTMLMotionProps,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { type ReactNode, useRef } from 'react';

export const STUDIO_EASE = [0.22, 1, 0.36, 1] as const;

export const VIEWPORT_ONCE = {
  once: true,
  amount: 0.14,
} as const;

/**
 * Slim top scroll-progress bar driven by Framer Motion useScroll + useSpring.
 */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 32,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed top-0 inset-x-0 h-[2px] origin-left z-50 pointer-events-none bg-gradient-to-r from-[#8B5CF6] via-[#3B82F6] to-[#22D3EE]"
    />
  );
}

interface ScrollRevealProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  distance?: number;
  delay?: number;
  duration?: number;
  className?: string;
}

/**
 * Scroll-triggered entrance animation using compositor-only transform + opacity.
 */
export function ScrollReveal({
  children,
  direction = 'up',
  distance = 24,
  delay = 0,
  duration = 0.48,
  className = '',
  ...rest
}: ScrollRevealProps) {
  const offset =
    direction === 'up'
      ? { y: distance, x: 0 }
      : direction === 'down'
        ? { y: -distance, x: 0 }
        : direction === 'left'
          ? { x: distance, y: 0 }
          : direction === 'right'
            ? { x: -distance, y: 0 }
            : { x: 0, y: 0 };

  return (
    <motion.div
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration, delay, ease: STUDIO_EASE }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface StaggerGroupProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  staggerDelay?: number;
  delayChildren?: number;
  className?: string;
}

export function StaggerGroup({
  children,
  staggerDelay = 0.075,
  delayChildren = 0.04,
  className = '',
  ...rest
}: StaggerGroupProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren,
          },
        },
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  distance?: number;
  className?: string;
}

export function StaggerItem({
  children,
  distance = 20,
  className = '',
  ...rest
}: StaggerItemProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: distance },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.44, ease: STUDIO_EASE },
        },
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface ParallaxFrameProps {
  children: ReactNode;
  className?: string;
  offset?: number;
}

/**
 * Scroll-linked parallax frame for spotlight studio photography.
 */
export function ParallaxFrame({ children, className = '', offset = 28 }: ParallaxFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.08, 1.03, 1.08]);

  return (
    <div ref={containerRef} className={`overflow-hidden ${className}`}>
      <motion.div style={{ y, scale }} className="w-full h-full will-change-transform">
        {children}
      </motion.div>
    </div>
  );
}

interface TabContentTransitionProps {
  tabKey: string;
  children: ReactNode;
  className?: string;
}

/**
 * Smooth crossfade + slight vertical slide for switching tabs and inspector panels.
 */
export function TabContentTransition({ tabKey, children, className = '' }: TabContentTransitionProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: STUDIO_EASE }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

interface ModalTransitionProps {
  open: boolean;
  onBackdropClick?: () => void;
  onClose?: () => void;
  maxWidthClass?: string;
  children: ReactNode;
}

/**
 * Animated modal backdrop and dialog entrance/exit transition.
 */
export function ModalTransition({
  open,
  onBackdropClick,
  onClose,
  maxWidthClass = 'max-w-md',
  children,
}: ModalTransitionProps) {
  const handleBackdrop = onBackdropClick ?? onClose;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={handleBackdrop}
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/75 backdrop-blur-[2px] px-3 py-6 sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: STUDIO_EASE }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full my-auto ${maxWidthClass}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
