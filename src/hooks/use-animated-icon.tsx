import { useAnimation } from 'motion/react';
import * as React from 'react';

type AnimationControls = ReturnType<typeof useAnimation>;

export function useAnimatedIcon(
  controls: AnimationControls,
  animate: boolean,
  isControlledRef: React.MutableRefObject<boolean>
) {
  React.useEffect(() => {
    if (animate && !isControlledRef.current) {
      controls.start('animate');
    } else if (!animate && !isControlledRef.current) {
      controls.start('normal');
    }
  }, [animate, controls, isControlledRef]);
}

export function useAnimatedIconCallback(
  startAnimation: () => void,
  stopAnimation: () => void,
  animate: boolean,
  isControlledRef: React.MutableRefObject<boolean>
) {
  React.useEffect(() => {
    if (animate && !isControlledRef.current) {
      startAnimation();
    } else if (!animate && !isControlledRef.current) {
      stopAnimation();
    }
  }, [animate, startAnimation, stopAnimation, isControlledRef]);
}
