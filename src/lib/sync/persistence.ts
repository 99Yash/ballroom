import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '~/db';
import { syncState, videos } from '~/db/schemas';
import { VIDEO_SYNC_STATUS } from '~/lib/constants';
import {
  checkAndIncrementQuotaWithinTx,
  incrementQuotaWithinTx,
} from '~/lib/quota';
import type {
  CollectionType,
  ContentSource,
  NormalizedContentItem,
  SyncCursor,
} from '~/lib/sources/types';
import { EMPTY_CURSOR } from '~/lib/sources/types';

// ---------------------------------------------------------------------------
// Sync state persistence
// ---------------------------------------------------------------------------

export async function loadSyncState(
  userId: string,
  source: ContentSource,
  collection: CollectionType
): Promise<SyncCursor> {
  const [state] = await db
    .select({ cursor: syncState.cursor, reachedEnd: syncState.reachedEnd })
    .from(syncState)
    .where(
      and(
        eq(syncState.userId, userId),
        eq(syncState.source, source),
        eq(syncState.collection, collection)
      )
    )
    .limit(1);

  if (!state) return EMPTY_CURSOR;

  return {
    token: state.cursor,
    reachedEnd: state.reachedEnd,
  };
}

export interface SaveSyncStateOptions {
  /** When true, also records the current time as lastFullSyncAt for cooldown tracking. */
  markFullSync?: boolean;
}

export async function saveSyncState(
  userId: string,
  source: ContentSource,
  collection: CollectionType,
  cursor: SyncCursor,
  error?: string | null,
  options?: SaveSyncStateOptions
): Promise<void> {
  const now = new Date();
  const lastFullSyncAt = options?.markFullSync ? now : undefined;

  const baseValues = {
    cursor: cursor.token,
    reachedEnd: cursor.reachedEnd,
    lastSyncedAt: now,
    lastError: error ?? null,
    ...(lastFullSyncAt && { lastFullSyncAt }),
  };

  await db
    .insert(syncState)
    .values({
      userId,
      source,
      collection,
      ...baseValues,
    })
    .onConflictDoUpdate({
      target: [syncState.userId, syncState.source, syncState.collection],
      set: baseValues,
    });
}

/**
 * Check if a full sync is allowed based on the per-source cooldown.
 * Returns null if allowed, or the remaining cooldown in ms if not.
 */
export async function getFullSyncCooldownRemaining(
  userId: string,
  source: ContentSource,
  collection: CollectionType,
  cooldownMs: number
): Promise<number | null> {
  const [state] = await db
    .select({ lastFullSyncAt: syncState.lastFullSyncAt })
    .from(syncState)
    .where(
      and(
        eq(syncState.userId, userId),
        eq(syncState.source, source),
        eq(syncState.collection, collection)
      )
    )
    .limit(1);

  if (!state?.lastFullSyncAt) return null;

  const elapsed = Date.now() - state.lastFullSyncAt.getTime();
  if (elapsed >= cooldownMs) return null;

  return cooldownMs - elapsed;
}

// ---------------------------------------------------------------------------
// Batch upsert
// ---------------------------------------------------------------------------

export interface UpsertBatchOptions {
  userId: string;
  source: ContentSource;
  collection: CollectionType;
  items: NormalizedContentItem[];
  syncStartedAt: Date;
  checkQuota: boolean;
}

/**
 * Derive a value for the legacy `youtubeId` column.
 * YouTube items use the raw external ID; other sources use a namespaced key
 * to satisfy the NOT NULL + unique constraint during the compatibility phase.
 */
function deriveYoutubeId(source: ContentSource, externalId: string): string {
  return source === 'youtube' ? externalId : `${source}:${externalId}`;
}

export async function upsertBatch(options: UpsertBatchOptions): Promise<number> {
  const { userId, source, collection, items, syncStartedAt, checkQuota } =
    options;
  if (items.length === 0) return 0;

  return db.transaction(async (tx) => {
    const values = items.map((item) => ({
      userId,
      youtubeId: deriveYoutubeId(source, item.externalId),
      title: item.title,
      description: item.description,
      thumbnailUrl: item.thumbnailUrl,
      channelName: item.authorName,
      channelId: item.authorId,
      publishedAt: item.publishedAt,
      syncStatus: VIDEO_SYNC_STATUS.ACTIVE,
      lastSeenAt: syncStartedAt,
      source,
      collection,
      externalId: item.externalId,
      providerMetadata: item.providerMetadata ?? null,
    }));

    const insertResult = await tx
      .insert(videos)
      .values(values)
      .onConflictDoNothing();

    const insertedCount = insertResult?.rowCount ?? 0;

    // Update lastSeenAt + reactivate for all items in this batch (new and existing)
    const externalIds = items.map((item) => item.externalId);
    await tx
      .update(videos)
      .set({
        lastSeenAt: sql`COALESCE(GREATEST(${videos.lastSeenAt}, ${syncStartedAt}), ${syncStartedAt})`,
        syncStatus: VIDEO_SYNC_STATUS.ACTIVE,
      })
      .where(
        and(
          eq(videos.userId, userId),
          eq(videos.source, source),
          eq(videos.collection, collection),
          inArray(videos.externalId, externalIds)
        )
      );

    if (insertedCount > 0) {
      if (checkQuota) {
        await checkAndIncrementQuotaWithinTx(
          tx,
          userId,
          'sync',
          insertedCount
        );
      } else {
        await incrementQuotaWithinTx(tx, userId, 'sync', insertedCount);
      }
    }

    return insertedCount;
  });
}
