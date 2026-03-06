import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, createVideoSearchVector, videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
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
    const rawSearchQuery = searchParams.get('search');

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

    const MAX_SEARCH_QUERY_LENGTH = 300;
    if (rawSearchQuery && rawSearchQuery.length > MAX_SEARCH_QUERY_LENGTH) {
      return NextResponse.json(
        {
          error: `Search query is too long. Maximum length is ${MAX_SEARCH_QUERY_LENGTH} characters.`,
        },
        { status: 400 }
      );
    }
    const searchQuery = rawSearchQuery?.trim();

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

    let searchExpr: SQL | null = null;
    let searchRank: SQL | null = null;
    if (searchQuery && searchQuery.length > 0) {
      const words = searchQuery
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => {
          const escaped = w.replace(/([&|!():\\])/g, '\\$1');
          return escaped.length > 0 ? `${escaped}:*` : '';
        })
        .filter((w) => w.length > 0)
        .join(' & ');

      const tsquery =
        words.length > 0
          ? sql`to_tsquery('simple', ${words})`
          : sql`plainto_tsquery('simple', ${searchQuery})`;

      searchExpr = createVideoSearchVector(
        videos.title,
        videos.description,
        videos.channelName
      );

      const searchCondition = sql`${searchExpr} @@ ${tsquery}`;
      baseConditions.push(searchCondition);

      searchRank = sql`ts_rank(${searchExpr}, ${tsquery})`;
    }

    const rawPage = Number(searchParams.get('page') ?? '1');
    const rawLimit = Number(searchParams.get('limit') ?? '50');
    const page =
      Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const limit = Math.min(
      100,
      Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : 50
    );
    const offset = (page - 1) * limit;

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
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/content', {
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
