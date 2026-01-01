import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '~/db';
import { categories, categorySelect, user } from '~/db/schemas';
import { getSession } from '~/lib/auth/session';
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
    .select(categorySelect)
    .from(categories)
    .where(eq(categories.userId, session.user.id))
    .orderBy(categories.createdAt);

  return (
    <DashboardClient
      initialCategories={userCategories}
      userName={session.user.name ?? session.user.email}
    />
  );
}
