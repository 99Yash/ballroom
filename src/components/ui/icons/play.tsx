'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import {
  createAnimatedIcon,
  type AnimatedIconHandle,
  type AnimatedIconProps,
} from './create-animated-icon';

type AnimationControls = ReturnType<typeof useAnimation>;

export type PlayIconHandle = AnimatedIconHandle;
export type PlayIconProps = AnimatedIconProps;

const VARIANTS: Variants = {
  normal: {
    scale: 1,
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  },
  animate: {
    scale: [1, 1.1, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 0.4,
      times: [0, 0.5, 1],
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
};

function PlaySvg({
  controls,
  size,
}: {
  controls: AnimationControls;
  size: number;
}) {
  return (
    <svg
      fill="currentColor"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <motion.polygon
        animate={controls}
        initial="normal"
        points="5 3 19 12 5 21 5 3"
        variants={VARIANTS}
      />
    </svg>
  );
}

const PlayIcon = createAnimatedIcon(PlaySvg, {
  displayName: 'PlayIcon',
});

export { PlayIcon };
