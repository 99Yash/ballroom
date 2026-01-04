'use client';

import { motion, useAnimation } from 'motion/react';
import * as React from 'react';
import { cn } from '~/lib/utils';

export interface RefreshCCWIconWIcon {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface RefreshCWIconProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  animate?: boolean;
}

const RefreshCWIcon = React.forwardRef<RefreshCCWIconWIcon, RefreshCWIconProps>(
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
          variants={{
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
          }}
          animate={controls}
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </motion.svg>
      </div>
    );
  }
);

RefreshCWIcon.displayName = 'RefreshCWIcon';

export { RefreshCWIcon };
