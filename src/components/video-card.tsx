'use client';

import { motion } from 'motion/react';
import Image from 'next/image';
import { Badge } from '~/components/ui/badge';
import { CalendarDaysIcon } from '~/components/ui/icons/calendar-days';
import { PlayIcon } from '~/components/ui/icons/play';
import { cn, formatTimeToNow } from '~/lib/utils';
import { type SerializedVideo } from '~/types/video';

interface VideoCardProps {
  video: SerializedVideo;
  className?: string;
  priority?: boolean;
}

export function VideoCard({ video, className, priority }: VideoCardProps) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`;
  const publishedDate = video.publishedAt
    ? formatTimeToNow(video.publishedAt, { showDateAfterDays: 30 })
    : null;

  return (
    <motion.a
      href={youtubeUrl}
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
      {/* Thumbnail Container */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted/30">
        {video.thumbnailUrl ? (
          <>
            <Image
              src={video.thumbnailUrl}
              alt={video.title}
              fill
              priority={priority}
              className="object-cover transition-transform duration-500 group-hover:scale-110"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            {/* Dark overlay on hover */}
            <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-secondary/50">
            <PlayIcon size={48} className="text-muted-foreground/40" animate />
          </div>
        )}

        {/* Play Button Overlay - Pops in center */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-primary shadow-lg backdrop-blur-sm transition-transform duration-300 group-hover:scale-105 dark:bg-black/80">
            <PlayIcon size={24} className="ml-1" animate />
          </div>
        </div>

        {/* Floating Category Badge (Sticker style) */}
        {video.categoryName && (
          <div className="absolute right-3 top-3 z-10">
            <Badge
              variant="secondary"
              className="rotate-2 border-none bg-white/90 text-xs font-bold text-primary shadow-sm backdrop-blur-md transition-transform duration-300 group-hover:rotate-0 dark:bg-black/80"
            >
              {video.categoryName}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3
          className="line-clamp-2 font-bold leading-tight tracking-tight text-foreground/90 group-hover:text-primary"
          title={video.title}
        >
          {video.title}
        </h3>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          {video.channelName && (
            <div className="flex items-center gap-1.5 truncate font-medium">
              <span
                className="truncate hover:text-foreground"
                title={video.channelName}
              >
                {video.channelName}
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
