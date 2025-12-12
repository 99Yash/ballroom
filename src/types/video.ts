/**
 * Video types with proper server/client serialization
 */

/**
 * Server-side video type with Date objects (from database)
 */
export interface Video {
  id: string;
  youtubeId: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  channelName?: string | null;
  categoryId?: string | null;
  publishedAt?: Date | null;
  categoryName?: string | null;
}

/**
 * Serialized video type for client components (after JSON serialization)
 * Dates are serialized as ISO 8601 strings when passed from server to client
 */
export interface SerializedVideo {
  id: string;
  youtubeId: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  channelName?: string | null;
  categoryId?: string | null;
  publishedAt?: string | null; // ISO 8601 string
  categoryName?: string | null;
}

/**
 * Helper to serialize a video for client consumption
 */
export function serializeVideo(video: Video): SerializedVideo {
  return {
    ...video,
    publishedAt: video.publishedAt?.toISOString() ?? null,
  };
}

/**
 * Helper to parse a serialized video back to a Video with Date objects
 * Useful when you need to perform date operations on the client
 */
export function parseVideo(serialized: SerializedVideo): Video {
  return {
    ...serialized,
    publishedAt: serialized.publishedAt
      ? new Date(serialized.publishedAt)
      : null,
  };
}

/**
 * Format a date string for display
 * @param dateString ISO 8601 date string
 * @returns Formatted date string like "Dec 12, 2024" or relative time like "2 days ago"
 */
export function formatPublishedDate(
  dateString: string | null | undefined
): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // If less than 7 days, show relative time
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

  // Otherwise show formatted date
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
