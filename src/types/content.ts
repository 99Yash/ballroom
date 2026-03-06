/**
 * Multi-source content types with proper server/client serialization.
 *
 * Used by the generic /api/content endpoints.
 * Field selection happens at the query level (SELECT statement).
 * Serialization converts Date → string for client transport.
 */

import type { CollectionType, ContentSource } from '~/lib/sources/types';
import { serialize, type Serialize } from '~/lib/utils';

/**
 * Server-side content item (with Date objects).
 * Represents the shape after a SELECT + JOIN query on the videos table.
 */
export interface ContentItem {
  id: string;
  source: ContentSource;
  collection: CollectionType;
  externalId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  authorName: string | null;
  authorId: string | null;
  publishedAt: Date | null;
  categoryId: string | null;
  categoryName?: string | null;
  syncStatus: string;
  providerMetadata: unknown;
}

/**
 * Client-safe content item (after JSON serialization).
 * All Date fields become strings automatically.
 */
export type SerializedContentItem = Serialize<ContentItem>;

export function serializeContentItem<T extends ContentItem>(
  item: T
): Serialize<T> {
  return serialize(item);
}
