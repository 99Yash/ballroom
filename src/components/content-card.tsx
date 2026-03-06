'use client';

import { Twitter, Youtube } from 'lucide-react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { Badge } from '~/components/ui/badge';
import { CalendarDaysIcon } from '~/components/ui/icons/calendar-days';
import { PlayIcon } from '~/components/ui/icons/play';
import { cn, formatTimeToNow } from '~/lib/utils';
import type { SerializedContentItem } from '~/types/content';

interface ContentCardProps {
  item: SerializedContentItem;
  className?: string;
  priority?: boolean;
}

function getItemUrl(item: SerializedContentItem): string {
  if (item.source === 'youtube') {
    return `https://www.youtube.com/watch?v=${item.externalId}`;
  }
  // X/Twitter: use author ID if available, otherwise use generic status URL
  return `https://x.com/i/status/${item.externalId}`;
}

const SOURCE_ICONS = {
  youtube: Youtube,
  x: Twitter,
} as const;

const SOURCE_COLORS = {
  youtube: 'text-red-500',
  x: 'text-foreground',
} as const;

export function ContentCard({ item, className, priority }: ContentCardProps) {
  const url = getItemUrl(item);
  const publishedDate = item.publishedAt
    ? formatTimeToNow(item.publishedAt, { showDateAfterDays: 30 })
    : null;
  const SourceIcon = SOURCE_ICONS[item.source];
  const isVideo = item.source === 'youtube';

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
      }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-3xl border-2 border-primary/20 bg-card',
        'shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]',
        className
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted/30">
        {item.thumbnailUrl ? (
          <>
            <Image
              src={item.thumbnailUrl}
              alt={item.title}
              fill
              priority={priority}
              className="object-cover transition-transform duration-500 group-hover:scale-110"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-secondary/50">
            {isVideo ? (
              <PlayIcon
                size={48}
                className="text-muted-foreground/40"
                animate
              />
            ) : (
              <SourceIcon className="h-12 w-12 text-muted-foreground/40" />
            )}
          </div>
        )}

        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-primary shadow-lg backdrop-blur-sm transition-transform duration-300 group-hover:scale-105 dark:bg-black/80">
              <PlayIcon size={24} className="ml-1" animate />
            </div>
          </div>
        )}

        <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-md dark:bg-black/80',
              SOURCE_COLORS[item.source]
            )}
          >
            <SourceIcon className="h-3 w-3" />
          </div>
        </div>

        {item.categoryName && (
          <div className="absolute right-3 top-3 z-10">
            <Badge
              variant="secondary"
              className="rotate-2 border-none bg-white/90 text-xs font-bold text-primary shadow-sm backdrop-blur-md transition-transform duration-300 group-hover:rotate-0 dark:bg-black/80"
            >
              {item.categoryName}
            </Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3
          className="line-clamp-2 font-bold leading-tight tracking-tight text-foreground/90 group-hover:text-primary"
          title={item.title}
        >
          {item.title}
        </h3>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          {item.authorName && (
            <div className="flex items-center gap-1.5 truncate font-medium">
              <span
                className="truncate hover:text-foreground"
                title={item.authorName}
              >
                {item.authorName}
              </span>
            </div>
          )}

          {publishedDate && (
            <div className="flex shrink-0 items-center gap-1 opacity-70">
              <CalendarDaysIcon size={12} />
              <span>{publishedDate}</span>
            </div>
          )}
        </div>
      </div>
    </motion.a>
  );
}
