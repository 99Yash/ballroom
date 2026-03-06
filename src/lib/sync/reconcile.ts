import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { VIDEO_SYNC_STATUS } from '~/lib/constants';
import { logger } from '~/lib/logger';
import type { CollectionType, ContentSource } from '~/lib/sources/types';

/**
 * Mark items as inactive that were not seen during a completed sync run.
 *
 * Only called when the sync reached the end of the collection (reachedEnd = true),
 * ensuring we don't falsely inactivate items that simply weren't fetched yet.
 *
 * Scoped to a single (userId, source, collection) to avoid cross-source side effects.
 */
export async function reconcileInactive(
  userId: string,
  source: ContentSource,
  collection: CollectionType,
  syncStartedAt: Date | undefined
): Promise<number> {
  const baseCondition = and(
    eq(videos.userId, userId),
    eq(videos.source, source),
    eq(videos.collection, collection),
    eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE)
  );

  const condition = syncStartedAt
    ? and(
        baseCondition,
        or(isNull(videos.lastSeenAt), lt(videos.lastSeenAt, syncStartedAt))
      )
    : baseCondition;

  const updated = await db
    .update(videos)
    .set({ syncStatus: VIDEO_SYNC_STATUS.UNLIKED })
    .where(condition)
    .returning({ id: videos.id });

  if (updated.length > 0) {
    logger.info(
      syncStartedAt
        ? 'Marked items as inactive'
        : 'Marked all items as inactive (no items found in source)',
      { userId, source, collection, count: updated.length }
    );
  }

  return updated.length;
}
