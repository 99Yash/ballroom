import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories } from '~/db/schemas';
import { requireSession } from '~/lib/auth/session';
import { AppError, createErrorResponse } from '~/lib/errors';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    // Verify ownership
    const category = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, session.user.id)))
      .limit(1);

    if (!category.length) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    }

    // Videos with this category will have categoryId set to null (onDelete: 'set null')
    await db.delete(categories).where(eq(categories.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
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
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json();

    // Validate request body
    const { name: trimmedName } = await import('~/lib/validations/api').then(
      (mod) => mod.validateRequestBody(mod.updateCategorySchema, body)
    );

    // Verify ownership
    const category = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, session.user.id)))
      .limit(1);

    if (!category.length) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    }

    // Check for duplicate name (excluding current category)
    const existing = await db
      .select()
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
      .where(eq(categories.id, id))
      .returning();

    return NextResponse.json({ category: updated });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}
