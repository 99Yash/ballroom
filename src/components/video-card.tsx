'use client';

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
    <a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-300',
        'hover:border-ring/50 hover:shadow-lg hover:shadow-primary/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {video.thumbnailUrl ? (
          <Image
            src={video.thumbnailUrl}
            alt={video.title}
            fill
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <svg
              className="h-12 w-12 text-muted-foreground/50"
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

        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <div className="scale-0 rounded-full bg-red-600 p-3 transition-transform group-hover:scale-100">
            <svg
              className="h-6 w-6 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight text-foreground transition-colors group-hover:text-primary">
          {video.title}
        </h3>

        {video.channelName && (
          <p className="truncate text-xs text-muted-foreground">
            {video.channelName}
          </p>
        )}

        {video.categoryName && (
          <div className="mt-auto pt-2 w-full">
            <Badge
              variant="secondary"
              className="w-full max-w-full truncate text-xs"
            >
              {video.categoryName}
            </Badge>
          </div>
        )}
      </div>
    </a>
  );
}
