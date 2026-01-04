'use client';

import type { Variants } from 'motion/react';
import { AnimatePresence, motion, useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import * as React from 'react';
import { cn } from '~/lib/utils';

export interface CalendarDaysIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface CalendarDaysIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  animate?: boolean;
}

const DOTS = [
  { cx: 8, cy: 14 },
  { cx: 12, cy: 14 },
  { cx: 16, cy: 14 },
  { cx: 8, cy: 18 },
  { cx: 12, cy: 18 },
  { cx: 16, cy: 18 },
];

const VARIANTS: Variants = {
  normal: {
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  },
  animate: (i: number) => ({
    opacity: [1, 0.3, 1],
    transition: {
      delay: i * 0.1,
      duration: 0.4,
      times: [0, 0.5, 1],
      repeat: Infinity,
      repeatType: 'loop',
    },
  }),
};

const CalendarDaysIcon = React.forwardRef<
  CalendarDaysIconHandle,
  CalendarDaysIconProps
>(
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
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect height="18" rx="2" width="18" x="3" y="4" />
          <path d="M3 10h18" />
          <AnimatePresence>
            {DOTS.map((dot, index) => (
              <motion.circle
                animate={controls}
                custom={index}
                cx={dot.cx}
                cy={dot.cy}
                fill="currentColor"
                initial="normal"
                key={`${dot.cx}-${dot.cy}`}
                r="1"
                stroke="none"
                variants={VARIANTS}
              />
            ))}
          </AnimatePresence>
        </svg>
      </div>
    );
  }
);

CalendarDaysIcon.displayName = 'CalendarDaysIcon';

export { CalendarDaysIcon };
