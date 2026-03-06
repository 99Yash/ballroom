import { count, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { syncState, videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';

export async function GET() {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const userId = session.user.id;

    // Get sync state per source/collection
    const syncStates = await db
      .select({
        source: syncState.source,
        collection: syncState.collection,
        lastSyncedAt: syncState.lastSyncedAt,
        reachedEnd: syncState.reachedEnd,
      })
      .from(syncState)
      .where(eq(syncState.userId, userId));

    // Get counts per source/collection/syncStatus
    const statusCounts = await db
      .select({
        source: videos.source,
        collection: videos.collection,
        syncStatus: videos.syncStatus,
        count: count(),
      })
      .from(videos)
      .where(eq(videos.userId, userId))
      .groupBy(videos.source, videos.collection, videos.syncStatus);

    // Build bySourceCollection map
    const bySourceCollection: Record<
      string,
      {
        lastSyncAt: string | null;
        active: number;
        inactive: number;
        reachedEnd: boolean;
      }
    > = {};

    // Seed with sync state
    for (const ss of syncStates) {
      const key = `${ss.source}:${ss.collection}`;
      bySourceCollection[key] = {
        lastSyncAt: ss.lastSyncedAt?.toISOString() ?? null,
        active: 0,
        inactive: 0,
        reachedEnd: ss.reachedEnd,
      };
    }

    // Fill in counts
    for (const row of statusCounts) {
      const key = `${row.source}:${row.collection}`;
      if (!bySourceCollection[key]) {
        bySourceCollection[key] = {
          lastSyncAt: null,
          active: 0,
          inactive: 0,
          reachedEnd: false,
        };
      }
      if (row.syncStatus === 'active') {
        bySourceCollection[key]!.active = row.count;
      } else {
        bySourceCollection[key]!.inactive = row.count;
      }
    }

    // Compute totals
    let totalActive = 0;
    let totalInactive = 0;
    let lastSyncAt: string | null = null;

    for (const entry of Object.values(bySourceCollection)) {
      totalActive += entry.active;
      totalInactive += entry.inactive;
      if (
        entry.lastSyncAt &&
        (!lastSyncAt || entry.lastSyncAt > lastSyncAt)
      ) {
        lastSyncAt = entry.lastSyncAt;
      }
    }

    // Legacy compat fields
    const totalVideos = totalActive + totalInactive;

    logger.api('GET', '/api/sync-status', {
      userId,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({
      // Legacy fields (backward compat)
      lastSyncAt,
      totalVideos,
      // New multi-source fields
      totals: {
        active: totalActive,
        inactive: totalInactive,
      },
      bySourceCollection,
    });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/sync-status', {
      duration: Date.now() - startTime,
      status: errorResponse.statusCode,
      error: error instanceof Error ? error : undefined,
    });
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
