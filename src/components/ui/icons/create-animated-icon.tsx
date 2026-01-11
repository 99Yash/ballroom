'use client';

import { useAnimation } from 'motion/react';
import * as React from 'react';
import { cn } from '~/lib/utils';

type AnimationControls = ReturnType<typeof useAnimation>;

export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface AnimatedIconProps
  extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  animate?: boolean;
}

interface CreateAnimatedIconOptions {
  displayName: string;
  animateVariant?: string;
  normalVariant?: string;
}

/**
 * Factory function to create animated icon components with shared behavior.
 * Reduces boilerplate for icon components that share:
 * - Imperative handle for start/stop animation
 * - Mouse enter/leave animation triggers
 * - Controlled vs uncontrolled animation modes
 */
export function createAnimatedIcon(
  SvgContent: React.FC<{
    controls: AnimationControls;
    size: number;
  }>,
  options: CreateAnimatedIconOptions
) {
  const {
    displayName,
    animateVariant = 'animate',
    normalVariant = 'normal',
  } = options;

  const IconComponent = React.forwardRef<AnimatedIconHandle, AnimatedIconProps>(
    (
      { onMouseEnter, onMouseLeave, className, size = 28, animate = false, ...props },
      ref
    ) => {
      const controls = useAnimation();
      const isControlledRef = React.useRef(false);

      React.useImperativeHandle(ref, () => {
        isControlledRef.current = true;
        return {
          startAnimation: () => controls.start(animateVariant),
          stopAnimation: () => controls.start(normalVariant),
        };
      });

      React.useEffect(() => {
        if (animate && !isControlledRef.current) {
          controls.start(animateVariant);
        } else if (!animate && !isControlledRef.current) {
          controls.start(normalVariant);
        }
      }, [animate, controls, animateVariant, normalVariant]);

      const handleMouseEnter = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
          if (isControlledRef.current || animate) {
            onMouseEnter?.(e);
          } else {
            controls.start(animateVariant);
          }
        },
        [controls, onMouseEnter, animate, animateVariant]
      );

      const handleMouseLeave = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
          if (isControlledRef.current || animate) {
            onMouseLeave?.(e);
          } else {
            controls.start(normalVariant);
          }
        },
        [controls, onMouseLeave, animate, normalVariant]
      );

      return (
        <div
          className={cn(className)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          {...props}
        >
          <SvgContent controls={controls} size={size} />
        </div>
      );
    }
  );

  IconComponent.displayName = displayName;

  return IconComponent;
}

