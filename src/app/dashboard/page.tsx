import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
import { getSession } from '~/lib/auth/session';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  // Fetch user's videos with category info
  const userVideos = await db
    .select({
      id: videos.id,
      youtubeId: videos.youtubeId,
      title: videos.title,
      description: videos.description,
      thumbnailUrl: videos.thumbnailUrl,
      channelName: videos.channelName,
      categoryId: videos.categoryId,
      publishedAt: videos.publishedAt,
      categoryName: categories.name,
    })
    .from(videos)
    .leftJoin(categories, eq(videos.categoryId, categories.id))
    .where(eq(videos.userId, session.user.id))
    .orderBy(desc(videos.createdAt));

  // Fetch user's categories
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, session.user.id))
    .orderBy(categories.createdAt);

  return (
    <DashboardClient
      initialVideos={userVideos}
      initialCategories={userCategories}
      userName={session.user.name}
    />
  );
}
