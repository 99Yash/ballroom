import { NextResponse } from 'next/server';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import { syncVideosSchema, validateRequestBody } from '~/lib/validations/api';
import { syncLikedVideosForUser } from '~/lib/youtube';

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));

    const { limit } = validateRequestBody(syncVideosSchema, body);

    const result = await syncLikedVideosForUser(session.user.id, limit);

    const response = NextResponse.json({
      synced: result.synced,
      new: result.new,
      existing: result.existing,
      message:
        result.new > 0
          ? `Synced ${result.new} new videos`
          : 'No new videos found',
    });

    logger.api('POST', '/api/youtube/sync', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return response;
  } catch (error) {
    logger.error('Error syncing videos', error, {
      duration: Date.now() - startTime,
    });
    const errorResponse = createErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
