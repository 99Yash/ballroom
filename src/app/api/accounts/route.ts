import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { account } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { isXConfigured } from '~/lib/auth/x-availability';
import { createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';

export async function GET() {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const accounts = await db
      .select({
        providerId: account.providerId,
        accountId: account.accountId,
        createdAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.userId, userId));

    logger.api('GET', '/api/accounts', {
      userId,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({
      accounts: accounts.map((a) => ({
        providerId: a.providerId,
        accountId: a.accountId,
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
      xConfigured: isXConfigured(),
    });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/accounts', {
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
