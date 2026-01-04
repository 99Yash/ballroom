'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import * as React from 'react';
import { useAnimatedIcon } from '~/hooks/use-animated-icon';
import { cn } from '~/lib/utils';

export interface PlayIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PlayIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  animate?: boolean;
}

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

const PlayIcon = React.forwardRef<PlayIconHandle, PlayIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 28,
      animate = false,
      ...props
    },
    ref
  ) => {
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
      </div>
    );
  }
);

PlayIcon.displayName = 'PlayIcon';

export { PlayIcon };
