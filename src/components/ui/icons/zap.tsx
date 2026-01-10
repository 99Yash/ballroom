'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import {
  createAnimatedIcon,
  type AnimatedIconHandle,
  type AnimatedIconProps,
} from './create-animated-icon';

type AnimationControls = ReturnType<typeof useAnimation>;

export type ZapHandle = AnimatedIconHandle;
export type ZapProps = AnimatedIconProps;

const PATH_VARIANTS: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    transition: {
      duration: 0.6,
      opacity: { duration: 0.1 },
    },
  },
  animate: {
    opacity: [0, 1, 0],
    pathLength: [0, 1, 0],
    transition: {
      duration: 0.6,
      opacity: { duration: 0.1 },
      repeat: 2,
      repeatType: 'loop',
    },
  },
};

function ZapSvg({
  controls,
  size,
}: {
  controls: AnimationControls;
  size: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path
        variants={PATH_VARIANTS}
        animate={controls}
        d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
      />
    </svg>
  );
}

const ZapIcon = createAnimatedIcon(ZapSvg, {
  displayName: 'ZapIcon',
});

export { ZapIcon };
