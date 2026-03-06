import { and, count, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import {
  COLLECTION_TYPES,
  CONTENT_SOURCES,
  type CollectionType,
  type ContentSource,
} from '~/lib/sources/types';

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);

    const sourceParam = searchParams.get('source');
    const collectionParam = searchParams.get('collection');

    if (
      sourceParam &&
      !CONTENT_SOURCES.includes(sourceParam as ContentSource)
    ) {
      return NextResponse.json(
        { error: `Invalid source: ${sourceParam}` },
        { status: 400 }
      );
    }
    if (
      collectionParam &&
      !COLLECTION_TYPES.includes(collectionParam as CollectionType)
    ) {
      return NextResponse.json(
        { error: `Invalid collection: ${collectionParam}` },
        { status: 400 }
      );
    }

    const conditions = [eq(videos.userId, session.user.id)];
    if (sourceParam) {
      conditions.push(eq(videos.source, sourceParam as ContentSource));
    }
    if (collectionParam) {
      conditions.push(
        eq(videos.collection, collectionParam as CollectionType)
      );
    }

    // Category counts (with optional source/collection filter)
    const categoryCounts = await db
      .select({
        categoryId: videos.categoryId,
        count: count(),
      })
      .from(videos)
      .where(and(...conditions))
      .groupBy(videos.categoryId);

    let total = 0;
    let uncategorized = 0;
    const byCategory: Record<string, number> = {};

    for (const row of categoryCounts) {
      total += row.count;
      if (row.categoryId === null) {
        uncategorized = row.count;
      } else {
        byCategory[row.categoryId] = row.count;
      }
    }

    // Source breakdown (always unfiltered by source/collection to show full picture)
    const sourceBreakdown = await db
      .select({
        source: videos.source,
        collection: videos.collection,
        count: count(),
      })
      .from(videos)
      .where(eq(videos.userId, session.user.id))
      .groupBy(videos.source, videos.collection);

    const bySource: Record<string, number> = {};
    const bySourceCollection: Record<string, number> = {};

    for (const row of sourceBreakdown) {
      bySource[row.source] = (bySource[row.source] ?? 0) + row.count;
      bySourceCollection[`${row.source}:${row.collection}`] = row.count;
    }

    // Uncategorized count (scoped to filters)
    const [uncategorizedResult] = await db
      .select({ count: count() })
      .from(videos)
      .where(and(...conditions, isNull(videos.categoryId)));

    // Use the scoped uncategorized count
    uncategorized = uncategorizedResult?.count ?? uncategorized;

    logger.api('GET', '/api/content/counts', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({
      total,
      uncategorized,
      byCategory,
      bySource,
      bySourceCollection,
    });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/content/counts', {
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
