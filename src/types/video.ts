/**
 * Video types with proper server/client serialization
 *
 * Field selection happens at the query level (SELECT statement).
 * Serialization just converts Date → string for whatever you pass in.
 */

import type { DatabaseVideo } from '~/db/schemas/videos';
import { serialize, type Serialize } from '~/lib/utils';

/**
 * Re-exported from schema - inferred directly from Drizzle table definition
 */
export type { DatabaseVideo };

/**
 * Server-side video type (with Date objects)
 * This represents the shape after your SELECT + JOIN query.
 * Define the fields you want here - they should match your query.
 */
export type Video = Pick<
  DatabaseVideo,
  | 'id'
  | 'youtubeId'
  | 'title'
  | 'description'
  | 'thumbnailUrl'
  | 'channelName'
  | 'categoryId'
  | 'publishedAt'
> & {
  categoryName?: string | null; // From join
};

/**
 * Client-safe video type (after JSON serialization)
 * Automatically derived - all Date fields become strings
 */
export type SerializedVideo = Serialize<Video>;

/**
 * Serialize any object for client consumption.
 * Just pass your query result - dates get converted automatically.
 */
export function serializeVideo<T extends Video>(video: T): Serialize<T> {
  return serialize(video);
}
