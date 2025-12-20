import { count, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';

export async function GET() {
  const startTime = Date.now();
  try {
    const session = await requireSession();

    // Get the most recently created video to determine last sync time
    const [latestVideo] = await db
      .select({ createdAt: videos.createdAt })
      .from(videos)
      .where(eq(videos.userId, session.user.id))
      .orderBy(desc(videos.createdAt))
      .limit(1);

    // Get total video count efficiently using COUNT aggregate
    const [countResult] = await db
      .select({ count: count() })
      .from(videos)
      .where(eq(videos.userId, session.user.id));

    logger.api('GET', '/api/sync-status', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({
      lastSyncAt: latestVideo?.createdAt?.toISOString() ?? null,
      totalVideos: countResult?.count ?? 0,
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
