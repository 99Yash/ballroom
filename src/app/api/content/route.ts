import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, createVideoSearchVector, videos } from '~/db/schemas';
import {
  buildPrefixTsquery,
  handleApiError,
  parsePagination,
  validateSearchQuery,
} from '~/lib/api-utils';
import { requireSession } from '~/lib/auth/session';
import { logger } from '~/lib/logger';
import {
  COLLECTION_TYPES,
  CONTENT_SOURCES,
  type CollectionType,
  type ContentSource,
} from '~/lib/sources/types';
import { serializeContentItem } from '~/types/content';

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);

    // Parse optional source/collection filters
    const sourceParam = searchParams.get('source');
    const collectionParam = searchParams.get('collection');
    const categoryId = searchParams.get('categoryId');
    const uncategorized = searchParams.get('uncategorized') === 'true';

    // Validate source/collection if provided
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

    const { query: searchQuery, errorResponse: searchError } =
      validateSearchQuery(searchParams);
    if (searchError) return searchError;

    const baseConditions: SQL[] = [eq(videos.userId, session.user.id)];

    if (sourceParam) {
      baseConditions.push(
        eq(videos.source, sourceParam as ContentSource)
      );
    }
    if (collectionParam) {
      baseConditions.push(
        eq(videos.collection, collectionParam as CollectionType)
      );
    }
    if (uncategorized) {
      baseConditions.push(isNull(videos.categoryId));
    } else if (categoryId) {
      baseConditions.push(eq(videos.categoryId, categoryId));
    }

    let searchRank: SQL | null = null;
    if (searchQuery) {
      const tsquery = buildPrefixTsquery(searchQuery);
      const searchExpr = createVideoSearchVector(
        videos.title,
        videos.description,
        videos.channelName
      );
      baseConditions.push(sql`${searchExpr} @@ ${tsquery}`);
      searchRank = sql`ts_rank(${searchExpr}, ${tsquery})`;
    }

    const { page, limit, offset } = parsePagination(searchParams);

    const queryBuilder = db
      .select({
        id: videos.id,
        source: videos.source,
        collection: videos.collection,
        externalId: videos.externalId,
        title: videos.title,
        description: videos.description,
        thumbnailUrl: videos.thumbnailUrl,
        authorName: videos.channelName,
        authorId: videos.channelId,
        publishedAt: videos.publishedAt,
        categoryId: videos.categoryId,
        categoryName: categories.name,
        syncStatus: videos.syncStatus,
        providerMetadata: videos.providerMetadata,
        totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
      })
      .from(videos)
      .leftJoin(categories, eq(videos.categoryId, categories.id))
      .where(and(...baseConditions));

    const orderedQuery = searchRank
      ? queryBuilder.orderBy(desc(searchRank), desc(videos.createdAt))
      : queryBuilder.orderBy(desc(videos.createdAt));

    const rows = await orderedQuery.limit(limit).offset(offset);

    const totalCount = rows[0]?.totalCount ?? 0;

    const items = rows.map((row) => {
      const { totalCount: _, ...item } = row;
      return serializeContentItem(item);
    });

    logger.api('GET', '/api/content', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
      source: sourceParam,
      collection: collectionParam,
    });

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'GET', '/api/content', startTime);
  }
}
