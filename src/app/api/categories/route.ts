import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~/db';
import { categories, DEFAULT_CATEGORIES } from '~/db/schemas';
import { validateCategoryName } from '~/lib/ai/categorize';
import { requireSession } from '~/lib/auth/session';

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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { name, skipValidation } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return NextResponse.json(
        { error: 'Category name must be between 2 and 50 characters' },
        { status: 400 }
      );
    }

    // Check for duplicates
    const existing = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, session.user.id));

    const duplicate = existing.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      return NextResponse.json(
        { error: 'A category with this name already exists' },
        { status: 400 }
      );
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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
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
