import { NextResponse } from 'next/server';
import { requireSession } from '~/lib/auth/session';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import { formatQuotaForClient, getUserQuotas } from '~/lib/quota';

export async function GET() {
  const startTime = Date.now();
  try {
    const session = await requireSession();

    const quotas = await getUserQuotas(session.user.id);

    logger.api('GET', '/api/quota', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json(formatQuotaForClient(quotas));
  } catch (error) {
    logger.error('Error fetching quota', error, {
      duration: Date.now() - startTime,
    });
    const errorResponse = createErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
