import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, createVideoSearchVector, videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import { serializeVideo } from '~/types/video';

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const uncategorized = searchParams.get('uncategorized') === 'true';
    const rawSearchQuery = searchParams.get('search');
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
    const baseConditions = [eq(videos.userId, session.user.id)];

    if (uncategorized) {
      baseConditions.push(isNull(videos.categoryId));
    } else if (categoryId) {
      baseConditions.push(eq(videos.categoryId, categoryId));
    }

    let searchExpr: SQL | null = null;
    let searchRank: SQL | null = null;
    if (searchQuery && searchQuery.length > 0) {
      // Build a prefix-matching tsquery by splitting words and appending :* to each
      // This allows "bil" to match "bill", "billion", etc.
      // Escape special tsquery characters: & | ! ( ) :
      const words = searchQuery
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => {
          // Escape special characters in tsquery syntax
          const escaped = w.replace(/([&|!():\\])/g, '\\$1');
          return `${escaped}:*`;
        })
        .join(' & ');
      
      // Use to_tsquery with the built query string
      // Drizzle's sql template will properly parameterize this, preventing SQL injection
      const tsquery = sql`to_tsquery('simple', ${words})`;
      searchExpr = createVideoSearchVector(
        videos.title,
        videos.description,
        videos.channelName
      );

      const searchCondition = sql`${searchExpr} @@ ${tsquery}`;
      baseConditions.push(searchCondition);

      searchRank = sql`ts_rank(${searchExpr}, ${tsquery})`;
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50', 10),
      100
    );
    const offset = (page - 1) * limit;

    // Use window function to get total count in the same query, avoiding duplicate full-text search
    const queryBuilder = db
      .select({
        id: videos.id,
        youtubeId: videos.youtubeId,
        title: videos.title,
        description: videos.description,
        thumbnailUrl: videos.thumbnailUrl,
        channelName: videos.channelName,
        publishedAt: videos.publishedAt,
        categoryId: videos.categoryId,
        categoryName: categories.name,
        totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
      })
      .from(videos)
      .leftJoin(categories, eq(videos.categoryId, categories.id))
      .where(and(...baseConditions));

    const orderedQuery = searchRank
      ? queryBuilder.orderBy(desc(searchRank), desc(videos.createdAt))
      : queryBuilder.orderBy(desc(videos.createdAt));

    const userVideos = await orderedQuery.limit(limit).offset(offset);

    const totalCount = userVideos[0]?.totalCount ?? 0;

    // Remove totalCount from video objects before serialization (it's not part of Video type)
    const serializedVideos = userVideos.map((video) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { totalCount: _, ...videoWithoutCount } = video;
      return serializeVideo(videoWithoutCount);
    });

    logger.api('GET', '/api/youtube/videos', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({
      videos: serializedVideos,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/youtube/videos', {
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
