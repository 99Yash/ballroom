import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '~/db';
import { user } from '~/db/schemas';
import { getSession } from '~/lib/auth/session';
import { OnboardingClient } from './onboarding-client';

export default async function OnboardingPage() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  // Check if user is already onboarded
  const [currentUser] = await db
    .select({ onboardedAt: user.onboardedAt })
    .from(user)
    .where(eq(user.id, session.user.id));

  if (currentUser?.onboardedAt) {
    redirect('/dashboard');
  }

  return (
    <OnboardingClient userName={session.user.name ?? session.user.email} />
  );
}
