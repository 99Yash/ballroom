import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import {
  categories,
  categorySelect,
  DEFAULT_CATEGORIES,
} from '~/db/schemas';
import { validateCategoryName } from '~/lib/ai/categorize';
import { requireSession } from '~/lib/auth/session';
import { AppError, createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import {
  createCategorySchema,
  validateRequestBody,
} from '~/lib/validations/api';

export async function GET() {
  const startTime = Date.now();
  try {
    const session = await requireSession();

    const userCategories = await db
      .select(categorySelect)
      .from(categories)
      .where(eq(categories.userId, session.user.id))
      .orderBy(categories.createdAt);

    logger.api('GET', '/api/categories', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({ categories: userCategories });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('GET', '/api/categories', {
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

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await request.json();

    const { name: trimmedName, skipValidation } = validateRequestBody(
      createCategorySchema,
      body
    );

    const existing = await db
      .select({
        id: categories.id,
        name: categories.name,
      })
      .from(categories)
      .where(eq(categories.userId, session.user.id));

    const duplicate = existing.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'A category with this name already exists',
      });
    }

    if (!skipValidation) {
      const validation = await validateCategoryName(trimmedName);
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: 'Invalid category name',
            reason: validation.reason,
            suggestion: validation.suggestion,
          },
          { status: 400 }
        );
      }
    }

    const [newCategory] = await db
      .insert(categories)
      .values({
        userId: session.user.id,
        name: trimmedName,
        isDefault: false,
      })
      .returning(categorySelect);

    logger.api('POST', '/api/categories', {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({ category: newCategory });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('POST', '/api/categories', {
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

export async function initializeDefaultCategories(userId: string) {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return; // Already has categories
  }

  const defaultCats = DEFAULT_CATEGORIES.map((name) => ({
    userId,
    name,
    isDefault: true,
  }));

  await db.insert(categories).values(defaultCats);
}
