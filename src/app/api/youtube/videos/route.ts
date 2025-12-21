import { and, count, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
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
    const searchQuery = searchParams.get('search')?.trim();
    const baseConditions = [eq(videos.userId, session.user.id)];

    if (uncategorized) {
      baseConditions.push(isNull(videos.categoryId));
    } else if (categoryId) {
      baseConditions.push(eq(videos.categoryId, categoryId));
    }

    // Add search conditions if search query is provided
    // Use PostgreSQL full-text search with tsvector for better performance
    // Uses weighted search: title (A), description (B), channel_name (C)
    // Uses 'simple' config for YouTube-style text (mixed languages, code words, brand names)
    // websearch_to_tsquery supports web search engine-like syntax (or, and, etc.)
    let searchExpr: SQL | null = null;
    let searchRank: SQL | null = null;
    if (searchQuery && searchQuery.length > 0) {
      // Guard against empty/stop-word queries
      // websearch_to_tsquery returns null for empty/meaningless queries (e.g., only stop words)
      const tsquery = sql`websearch_to_tsquery('simple', ${searchQuery})`;

      searchExpr = sql`(
        setweight(to_tsvector('simple', COALESCE(${videos.title}, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(${videos.description}, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(${videos.channelName}, '')), 'C')
      )`;

      // Only add search condition if query produces valid tsquery (guards against stop words)
      const searchCondition = sql`${searchExpr} @@ ${tsquery} AND ${tsquery} IS NOT NULL`;
      baseConditions.push(searchCondition);

      // Add ranking for ordering results by relevance
      searchRank = sql`ts_rank(${searchExpr}, ${tsquery})`;
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50', 10),
      100
    );
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(videos)
      .where(and(...baseConditions));

    const totalCount = countResult?.count || 0;

    // Fetch videos with only the fields we need (matches Video type)
    // Order by search rank (relevance) if searching, otherwise by creation date
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
      })
      .from(videos)
      .leftJoin(categories, eq(videos.categoryId, categories.id))
      .where(and(...baseConditions));

    // Apply ordering: by relevance rank if searching, otherwise by creation date
    const orderedQuery = searchRank
      ? queryBuilder.orderBy(desc(searchRank), desc(videos.createdAt))
      : queryBuilder.orderBy(desc(videos.createdAt));

    const userVideos = await orderedQuery.limit(limit).offset(offset);

    const serializedVideos = userVideos.map(serializeVideo);

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
