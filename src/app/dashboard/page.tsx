import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '~/db';
import { categories } from '~/db/schemas';
import { getSession } from '~/lib/auth/session';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  // Fetch user's categories (videos will be loaded via API with pagination)
  const userCategories = await db
    .select()
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
