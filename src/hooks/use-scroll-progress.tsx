'use client';

import * as React from 'react';
import { useResizeObserver } from './use-resize-observer';

export function useScrollProgress(ref: React.RefObject<HTMLElement>) {
  const [scrollProgress, setScrollProgress] = React.useState(1);

  const updateScrollProgress = React.useCallback(() => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;

    setScrollProgress(
      scrollHeight === clientHeight
        ? 1
        : Math.min(scrollTop / (scrollHeight - clientHeight), 1)
    );
  }, [ref]);

  const resizeObserverEntry = useResizeObserver(ref);

  React.useEffect(() => {
    if (!ref.current) return;

    updateScrollProgress();

    const element = ref.current;
    element.addEventListener('scroll', updateScrollProgress, { passive: true });

    return () => {
      element.removeEventListener('scroll', updateScrollProgress);
    };
  }, [ref, updateScrollProgress, resizeObserverEntry]);

  return { scrollProgress, updateScrollProgress };
}
