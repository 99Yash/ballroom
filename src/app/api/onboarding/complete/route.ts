import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, user } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { AppError, createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import {
  completeOnboardingSchema,
  validateRequestBody,
} from '~/lib/validations/api';
import { initialSyncTask } from '~/workflows/sync-videos';

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await request.json();

    // Validate request body
    const { categories: categoryNames } = validateRequestBody(
      completeOnboardingSchema,
      body
    );

    // Check if user is already onboarded
    const [currentUser] = await db
      .select({ onboardedAt: user.onboardedAt })
      .from(user)
      .where(eq(user.id, session.user.id));

    if (currentUser?.onboardedAt) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'User is already onboarded',
      });
    }

    // Check for existing categories (shouldn't exist for new users)
    const existingCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, session.user.id));

    if (existingCategories.length > 0) {
      throw new AppError({
        code: 'CONFLICT',
        message:
          'User already has categories. Delete them first or skip onboarding.',
      });
    }

    // Deduplicate category names (case-insensitive)
    const uniqueNames = [
      ...new Set(categoryNames.map((n) => n.toLowerCase())),
    ].map(
      (lowerName) => categoryNames.find((n) => n.toLowerCase() === lowerName)!
    );

    // Ensure "Other" is included (add if not present)
    const hasOther = uniqueNames.some((n) => n.toLowerCase() === 'other');

    const finalCategories = hasOther ? uniqueNames : [...uniqueNames, 'Other'];

    // Create categories in a transaction along with updating onboardedAt
    await db.transaction(async (tx) => {
      // Insert all categories
      await tx.insert(categories).values(
        finalCategories.map((name) => ({
          userId: session.user.id,
          name,
          isDefault: false,
        }))
      );

      // Mark user as onboarded
      await tx
        .update(user)
        .set({ onboardedAt: new Date() })
        .where(eq(user.id, session.user.id));
    });

    // Trigger initial sync task in background
    try {
      await initialSyncTask.trigger({ userId: session.user.id });
      logger.info('Triggered initial sync task', { userId: session.user.id });
    } catch (triggerError) {
      // Don't fail onboarding if trigger fails - user can manually sync
      logger.error('Failed to trigger initial sync task', triggerError, {
        userId: session.user.id,
      });
    }

    logger.api('POST', '/api/onboarding/complete', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({
      success: true,
      categoriesCreated: finalCategories.length,
      message: 'Onboarding complete. Initial sync started in background.',
    });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('POST', '/api/onboarding/complete', {
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
