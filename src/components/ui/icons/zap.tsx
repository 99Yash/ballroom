'use client';

import { motion, useAnimation, Variants } from 'motion/react';
import * as React from 'react';
import { cn } from '~/lib/utils';

export interface ZapHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ZapProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  animate?: boolean;
}

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

const ZapIcon = React.forwardRef<ZapHandle, ZapProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, animate = false, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = React.useRef(false);

    React.useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });

    React.useEffect(() => {
      if (animate && !isControlledRef.current) {
        controls.start('animate');
      } else if (!animate && !isControlledRef.current) {
        controls.start('normal');
      }
    }, [animate, controls]);

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
          <motion.path
            variants={PATH_VARIANTS}
            animate={controls}
            d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
          />
        </svg>
      </div>
    );
  }
);

ZapIcon.displayName = 'ZapIcon';

export { ZapIcon };
