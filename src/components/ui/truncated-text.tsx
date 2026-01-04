'use client';

import * as React from 'react';
import { cn } from '~/lib/utils';

interface TruncatedTextProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
}

export function TruncatedText({
  children,
  className,
  as: Component = 'div',
  ...props
}: TruncatedTextProps) {
  const ref = React.useRef<HTMLElement>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const checkTruncation = () => {
      // scrollWidth > clientWidth checks for text-overflow: ellipsis (single line)
      // scrollHeight > clientHeight checks for line-clamp (multiline)
      // We add a small buffer (1px) to avoid false positives due to sub-pixel rendering
      const truncated =
        element.scrollWidth > element.clientWidth + 1 ||
        element.scrollHeight > element.clientHeight + 1;
      setIsTruncated(truncated);
    };

    checkTruncation();

    const resizeObserver = new ResizeObserver(checkTruncation);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [children]);

  // If children is a string, use it as title.
  // If it's something else, we try to grab text content if possible, or just don't show tooltip.
  const titleText = typeof children === 'string' ? children : undefined;

  return (
    <Component
      ref={ref}
      className={cn(className)}
      title={isTruncated ? titleText : undefined}
      {...props}
    >
      {children}
    </Component>
  );
}

