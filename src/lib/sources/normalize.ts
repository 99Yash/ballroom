import type { YouTubeVideo } from '~/lib/youtube';
import type { NormalizedContentItem } from './types';

/**
 * Convert a YouTube video (from the YouTube API client) to a normalized content item.
 */
export function normalizeYouTubeVideo(
  video: YouTubeVideo
): NormalizedContentItem {
  return {
    externalId: video.youtubeId,
    title: video.title,
    description: video.description || null,
    thumbnailUrl: video.thumbnailUrl || null,
    authorName: video.channelName || null,
    authorId: video.channelId || null,
    publishedAt: video.publishedAt ?? null,
    providerMetadata: null,
  };
}
