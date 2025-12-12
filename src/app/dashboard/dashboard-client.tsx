'use client';

import { FolderOpen, LogOut, Youtube } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CategoryManager } from '~/components/category-manager';
import { SyncButton } from '~/components/sync-button';
import { Button } from '~/components/ui/button';
import { VideoCard } from '~/components/video-card';
import { authClient } from '~/lib/auth/client';

interface Video {
  id: string;
  youtubeId: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  channelName?: string | null;
  categoryId?: string | null;
  publishedAt?: Date | null;
  categoryName?: string | null;
}

interface Category {
  id: string;
  name: string;
  isDefault: boolean;
}

interface DashboardClientProps {
  initialVideos: Video[];
  initialCategories: Category[];
  userName: string;
}

export function DashboardClient({
  initialVideos,
  initialCategories,
  userName,
}: DashboardClientProps) {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Group videos by category
  const videosByCategory = useMemo(() => {
    const grouped: Record<string, Video[]> = {
      uncategorized: [],
    };

    // Initialize all categories
    categories.forEach((cat) => {
      grouped[cat.id] = [];
    });

    // Group videos
    videos.forEach((video) => {
      if (video.categoryId && grouped[video.categoryId]) {
        grouped[video.categoryId].push(video);
      } else {
        grouped.uncategorized.push(video);
      }
    });

    return grouped;
  }, [videos, categories]);

  // Filter videos based on selected category
  const filteredVideos = useMemo(() => {
    if (selectedCategory === null) {
      return videos;
    }
    if (selectedCategory === 'uncategorized') {
      return videosByCategory.uncategorized;
    }
    return videosByCategory[selectedCategory] || [];
  }, [videos, selectedCategory, videosByCategory]);

  const handleRefresh = () => {
    router.refresh();
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/');
    router.refresh();
  };

  const handleCategoryAdded = (category: Category) => {
    setCategories((prev) => [...prev, category]);
  };

  const handleCategoryDeleted = (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    // Update videos that had this category
    setVideos((prev) =>
      prev.map((v) =>
        v.categoryId === categoryId
          ? { ...v, categoryId: null, categoryName: null }
          : v
      )
    );
    if (selectedCategory === categoryId) {
      setSelectedCategory(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600">
              <Youtube className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Liked Videos Sorter</h1>
              <p className="text-xs text-muted-foreground">
                Welcome, {userName}
              </p>
            </div>
          </div>

          <Button variant="ghost" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Actions bar */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SyncButton
            onSyncComplete={handleRefresh}
            onCategorizeComplete={handleRefresh}
          />
          <CategoryManager
            categories={categories}
            onCategoryAdded={handleCategoryAdded}
            onCategoryDeleted={handleCategoryDeleted}
            onCategoriesChanged={handleRefresh}
          />
        </div>

        {/* Category filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All ({videos.length})
          </Button>
          {categories.map((category) => {
            const count = videosByCategory[category.id]?.length || 0;
            return (
              <Button
                key={category.id}
                variant={
                  selectedCategory === category.id ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name} ({count})
              </Button>
            );
          })}
          {videosByCategory.uncategorized.length > 0 && (
            <Button
              variant={
                selectedCategory === 'uncategorized' ? 'default' : 'outline'
              }
              size="sm"
              onClick={() => setSelectedCategory('uncategorized')}
              className="border-dashed"
            >
              Uncategorized ({videosByCategory.uncategorized.length})
            </Button>
          )}
        </div>

        {/* Videos grid */}
        {filteredVideos.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">No videos yet</h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              {videos.length === 0
                ? 'Click "Sync & Categorize" to fetch your liked videos from YouTube and automatically organize them.'
                : 'No videos match the selected filter.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
