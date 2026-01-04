'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import * as React from 'react';
import { useAnimatedIcon } from '~/hooks/use-animated-icon';
import { cn } from '~/lib/utils';

export interface ArrowRightIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ArrowRightIconProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  animate?: boolean;
}

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
  normal: { d: 'm12 5 7 7-7 7', translateX: 0 },
  animate: {
    d: 'm12 5 7 7-7 7',
    translateX: [0, -3, 0],
    transition: {
      duration: 0.4,
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
};

const ArrowRightIcon = React.forwardRef<
  ArrowRightIconHandle,
  ArrowRightIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, animate = false, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = React.useRef(false);

  React.useImperativeHandle(ref, () => {
    isControlledRef.current = true;

    return {
      startAnimation: () => controls.start('animate'),
      stopAnimation: () => controls.start('normal'),
    };
  });

  useAnimatedIcon(controls, animate, isControlledRef);

  const handleMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current || animate) {
        onMouseEnter?.(e);
      } else {
        controls.start('animate');
      }
    },
    [controls, onMouseEnter, animate]
  );

  const handleMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current || animate) {
        onMouseLeave?.(e);
      } else {
        controls.start('normal');
      }
    },
    [controls, onMouseLeave, animate]
  );

  return (
    <div
      className={cn(className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
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
        <motion.path d="M5 12h14" variants={PATH_VARIANTS} animate={controls} />
        <motion.path
          d="m12 5 7 7-7 7"
          variants={SECONDARY_PATH_VARIANTS}
          animate={controls}
        />
      </svg>
    </div>
  );
});

ArrowRightIcon.displayName = 'ArrowRightIcon';

export { ArrowRightIcon };
