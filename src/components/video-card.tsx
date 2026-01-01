'use client';

import { motion } from 'motion/react';
import Image from 'next/image';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';
import type { SerializedVideo } from '~/types/video';

interface VideoCardProps {
  video: SerializedVideo;
  className?: string;
  priority?: boolean;
}

export function VideoCard({ video, className, priority }: VideoCardProps) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`;

  return (
    <motion.a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -4 }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card',
        'shadow-sm transition-all duration-500 ease-out',
        'hover:border-ring/60 hover:shadow-xl hover:shadow-primary/5 dark:hover:shadow-primary/10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted/50 to-muted">
        {video.thumbnailUrl ? (
          <>
            <Image
              src={video.thumbnailUrl}
              alt={video.title}
              fill
              priority={priority}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <svg
              className="h-12 w-12 text-muted-foreground/40 transition-transform duration-300 group-hover:scale-110"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1, opacity: 1 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
            }}
            className="rounded-full bg-red-600 p-4 shadow-2xl ring-4 ring-red-600/20"
          >
            <svg
              className="h-7 w-7 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card via-card/80 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors duration-300 group-hover:text-primary">
          {video.title}
        </h3>

        {video.channelName && (
          <p className="truncate text-xs font-medium text-muted-foreground/80 transition-colors duration-300 group-hover:text-muted-foreground">
            {video.channelName}
          </p>
        )}

        {video.categoryName && (
          <div className="mt-auto pt-1">
            <Badge
              variant="secondary"
              className="w-fit text-xs font-medium shadow-sm transition-all duration-300 group-hover:shadow-md"
            >
              {video.categoryName}
            </Badge>
          </div>
        )}
      </div>
    </motion.a>
  );
}
