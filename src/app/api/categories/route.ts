import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, DEFAULT_CATEGORIES } from '~/db/schemas';
import { validateCategoryName } from '~/lib/ai/categorize';
import { requireSession } from '~/lib/auth/session';
import { AppError, createErrorResponse } from '~/lib/errors';

export async function GET() {
  try {
    const session = await requireSession();

    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, session.user.id))
      .orderBy(categories.createdAt);

    return NextResponse.json({ categories: userCategories });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();

    // Validate request body
    const { name: trimmedName, skipValidation } = await import(
      '~/lib/validations/api'
    ).then((mod) => mod.validateRequestBody(mod.createCategorySchema, body));

    // Check for duplicates
    const existing = await db
      .select()
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

    // Validate the category name using AI (unless skipped)
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
      .returning();

    return NextResponse.json({ category: newCategory });
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.message },
      { status: errorResponse.statusCode }
    );
  }
}

// Initialize default categories for a new user
export async function initializeDefaultCategories(userId: string) {
  const existing = await db
    .select()
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
