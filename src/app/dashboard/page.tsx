import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '~/db';
import { categories, user } from '~/db/schemas';
import { getSession } from '~/lib/auth/session';
import type { Category } from '~/types/category';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  const [currentUser] = await db
    .select({ onboardedAt: user.onboardedAt })
    .from(user)
    .where(eq(user.id, session.user.id));

  if (!currentUser?.onboardedAt) {
    redirect('/onboarding');
  }

  const userCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      isDefault: categories.isDefault,
      parentCategoryId: categories.parentCategoryId,
    })
    .from(categories)
    .where(eq(categories.userId, session.user.id))
    .orderBy(categories.createdAt);

  return (
    <DashboardClient
      initialCategories={userCategories as Category[]}
      userName={session.user.name ?? session.user.email}
    />
  );
}
