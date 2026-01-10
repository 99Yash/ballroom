'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import {
  createAnimatedIcon,
  type AnimatedIconHandle,
  type AnimatedIconProps,
} from './create-animated-icon';

type AnimationControls = ReturnType<typeof useAnimation>;

export type ArrowRightIconHandle = AnimatedIconHandle;
export type ArrowRightIconProps = AnimatedIconProps;

const PATH_VARIANTS: Variants = {
  normal: { d: 'M5 12h14' },
  animate: {
    d: ['M5 12h14', 'M5 12h9', 'M5 12h14'],
    transition: {
      duration: 0.4,
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
};

const SECONDARY_PATH_VARIANTS: Variants = {
  normal: { translateX: 0 },
  animate: {
    translateX: [0, -3, 0],
    transition: {
      duration: 0.4,
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
};

function ArrowRightSvg({
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
      <motion.path variants={PATH_VARIANTS} animate={controls} d="M5 12h14" />
      <motion.path
        variants={SECONDARY_PATH_VARIANTS}
        animate={controls}
        d="m12 5 7 7-7 7"
      />
    </svg>
  );
}

const ArrowRightIcon = createAnimatedIcon(ArrowRightSvg, {
  displayName: 'ArrowRightIcon',
});

export { ArrowRightIcon };
