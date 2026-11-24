import { type HTMLMotionProps, motion } from 'motion/react';
import { forwardRef } from 'react';

export type StudioButtonVariant = 'primary' | 'audio' | 'secondary' | 'danger';
export type StudioButtonSize = 'xs' | 'sm' | 'md';

export interface StudioButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: StudioButtonVariant;
  size?: StudioButtonSize;
}

const VARIANT_CLASSES: Record<StudioButtonVariant, string> = {
  primary:
    'bg-[#8B5CF6] hover:bg-[#7C3AED] text-[#F8FAFC] hover:shadow-[0_6px_18px_-6px_rgba(139,92,246,0.55)]',
  audio:
    'bg-[#22D3EE] hover:bg-[#06B6D4] text-[#09090D] hover:shadow-[0_6px_18px_-6px_rgba(34,211,238,0.45)]',
  secondary:
    'bg-[#1B1B27] hover:bg-[#292938] border border-[#292938] text-[#F8FAFC]',
  danger:
    'bg-[#F43F5E] hover:bg-[#E11D48] text-[#F8FAFC] hover:shadow-[0_6px_18px_-6px_rgba(244,63,94,0.45)]',
};

const SIZE_CLASSES: Record<StudioButtonSize, string> = {
  xs: 'px-3 py-1.5 text-xs',
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-3 text-sm',
};

const TACTILE_TRANSITION = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 32,
  mass: 0.6,
};

export const StudioButton = forwardRef<HTMLButtonElement, StudioButtonProps>(
  function StudioButton(
    {
      variant = 'primary',
      size = 'sm',
      className = '',
      disabled,
      type = 'button',
      children,
      ...rest
    },
    ref
  ) {
    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled}
        whileHover={disabled ? undefined : { y: -1, scale: 1.015 }}
        whileTap={disabled ? undefined : { y: 0, scale: 0.975 }}
        transition={TACTILE_TRANSITION}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...rest}
      >
        {children}
      </motion.button>
    );
  }
);
