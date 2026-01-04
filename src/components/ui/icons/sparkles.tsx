'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import * as React from 'react';
import { cn } from '~/lib/utils';
import { useAnimatedIconCallback } from '~/hooks/use-animated-icon';

export interface SparklesIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SparklesIconProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  animate?: boolean;
}

const SPARKLE_VARIANTS: Variants = {
  initial: {
    y: 0,
    fill: 'none',
  },
  hover: {
    y: [0, -1, 0, 0],
    fill: 'currentColor',
    transition: {
      duration: 1,
      bounce: 0.3,
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
};

const STAR_VARIANTS: Variants = {
  initial: {
    opacity: 1,
    x: 0,
    y: 0,
  },
  blink: () => ({
    opacity: [0, 1, 0, 0, 0, 0, 1],
    transition: {
      duration: 2,
      type: 'spring',
      stiffness: 70,
      damping: 10,
      mass: 0.4,
      repeat: Infinity,
      repeatType: 'loop',
    },
  }),
};

const SparklesIcon = React.forwardRef<SparklesIconHandle, SparklesIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, animate = false, ...props }, ref) => {
    const starControls = useAnimation();
    const sparkleControls = useAnimation();
    const isControlledRef = React.useRef(false);

    React.useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => {
          sparkleControls.start('hover');
          starControls.start('blink', { delay: 1 });
        },
        stopAnimation: () => {
          sparkleControls.start('initial');
          starControls.start('initial');
        },
      };
    });

    const startAnimation = React.useCallback(() => {
      sparkleControls.start('hover');
      starControls.start('blink', { delay: 1 });
    }, [sparkleControls, starControls]);

    const stopAnimation = React.useCallback(() => {
      sparkleControls.start('initial');
      starControls.start('initial');
    }, [sparkleControls, starControls]);

    useAnimatedIconCallback(startAnimation, stopAnimation, animate, isControlledRef);

    const handleMouseEnter = React.useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current || animate) {
          onMouseEnter?.(e);
        } else {
          startAnimation();
        }
      },
      [onMouseEnter, animate, startAnimation]
    );

    const handleMouseLeave = React.useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current || animate) {
          onMouseLeave?.(e);
        } else {
          stopAnimation();
        }
      },
      [onMouseLeave, animate, stopAnimation]
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
          <motion.path
            d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
            variants={SPARKLE_VARIANTS}
            animate={sparkleControls}
          />
          <motion.path
            d="M20 3v4"
            variants={STAR_VARIANTS}
            animate={starControls}
          />
          <motion.path
            d="M22 5h-4"
            variants={STAR_VARIANTS}
            animate={starControls}
          />
          <motion.path
            d="M4 17v2"
            variants={STAR_VARIANTS}
            animate={starControls}
          />
          <motion.path
            d="M5 18H3"
            variants={STAR_VARIANTS}
            animate={starControls}
          />
        </svg>
      </div>
    );
  }
);

SparklesIcon.displayName = 'SparklesIcon';

export { SparklesIcon };
