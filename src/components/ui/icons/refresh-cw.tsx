'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import {
  createAnimatedIcon,
  type AnimatedIconHandle,
  type AnimatedIconProps,
} from './create-animated-icon';

type AnimationControls = ReturnType<typeof useAnimation>;

export type RefreshCWIconHandle = AnimatedIconHandle;
export type RefreshCWIconProps = AnimatedIconProps;

const VARIANTS: Variants = {
  normal: { rotate: '0deg' },
  animate: {
    rotate: '360deg',
    transition: {
      duration: 1,
      repeat: Infinity,
      repeatType: 'loop',
      ease: 'linear',
    },
  },
};

function RefreshCWSvg({
  controls,
  size,
}: {
  controls: AnimationControls;
  size: number;
}) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      transition={{ type: 'spring', stiffness: 250, damping: 25 }}
      variants={VARIANTS}
      animate={controls}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </motion.svg>
  );
}

const RefreshCWIcon = createAnimatedIcon(RefreshCWSvg, {
  displayName: 'RefreshCWIcon',
});

export { RefreshCWIcon };
