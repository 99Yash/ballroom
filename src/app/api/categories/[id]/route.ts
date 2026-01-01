import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { AppError, createErrorResponse } from '~/lib/errors';
import { logger } from '~/lib/logger';
import type { Category } from '~/types/category';
import {
  updateCategorySchema,
  validateRequestBody,
} from '~/lib/validations/api';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const session = await requireSession();

    const category = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, session.user.id)))
      .limit(1);

    if (!category.length) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    }

    await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, session.user.id)));

    logger.api('DELETE', `/api/categories/${id}`, {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('DELETE', `/api/categories/${id}`, {
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const session = await requireSession();
    const body = await request.json();

    const { name: trimmedName } = validateRequestBody(
      updateCategorySchema,
      body
    );

    const category = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, session.user.id)))
      .limit(1);

    if (!category.length) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    }

    const existing = await db
      .select({
        id: categories.id,
        name: categories.name,
      })
      .from(categories)
      .where(eq(categories.userId, session.user.id));

    const duplicate = existing.find(
      (c) => c.id !== id && c.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'A category with this name already exists',
      });
    }

    const [updated] = await db
      .update(categories)
      .set({ name: trimmedName })
      .where(and(eq(categories.id, id), eq(categories.userId, session.user.id)))
      .returning({
        id: categories.id,
        name: categories.name,
        isDefault: categories.isDefault,
        parentCategoryId: categories.parentCategoryId,
      });

    logger.api('PATCH', `/api/categories/${id}`, {
      userId: session.user.id,
      duration: Date.now() - startTime,
      status: 200,
    });

    return NextResponse.json({ category: updated as Category });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    logger.api('PATCH', `/api/categories/${id}`, {
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
