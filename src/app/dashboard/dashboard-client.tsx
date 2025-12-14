'use client';

import { FolderOpen, LogOut, Youtube } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CategoryManager } from '~/components/category-manager';
import { SyncButton } from '~/components/sync-button';
import { Button } from '~/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '~/components/ui/pagination';
import { VideoCard } from '~/components/video-card';
import { authClient } from '~/lib/auth/client';
import { siteConfig } from '~/lib/site';
import type { SerializedVideo } from '~/types/video';

interface Category {
  id: string;
  name: string;
  isDefault: boolean;
}

interface DashboardClientProps {
  initialCategories: Category[];
  userName: string;
}

export function DashboardClient({
  initialCategories,
  userName,
}: DashboardClientProps) {
  const router = useRouter();
  const [videos, setVideos] = useState<SerializedVideo[]>([]);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const limit = 24; // Videos per page

  // Fetch videos from API
  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
      });

      if (selectedCategory === 'uncategorized') {
        params.set('uncategorized', 'true');
      } else if (selectedCategory) {
        params.set('categoryId', selectedCategory);
      }

      const response = await fetch(`/api/youtube/videos?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }

      const data = await response.json();
      setVideos(data.videos || []);
      setTotalPages(data.pagination?.totalPages || 0);
    } catch {
      toast.error('Failed to fetch videos');
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, selectedCategory, limit]);

  // Fetch videos when page or category changes
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Get category counts (we'll fetch these separately)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(
    {}
  );

  // Fetch category counts in a single API call
  const fetchCategoryCounts = useCallback(async () => {
    try {
      const response = await fetch('/api/youtube/videos/counts');
      if (!response.ok) {
        throw new Error('Failed to fetch category counts');
      }

      const data = await response.json();
      const counts: Record<string, number> = {
        all: data.total || 0,
        uncategorized: data.uncategorized || 0,
        ...data.byCategory,
      };

      setCategoryCounts(counts);
    } catch {
      // Silently fail - category counts are not critical
    }
  }, []);

  useEffect(() => {
    fetchCategoryCounts();
  }, [fetchCategoryCounts]);

  const handleRefresh = () => {
    fetchVideos();
    fetchCategoryCounts();
    router.refresh();
  };

  // Reset to page 1 when category changes
  const handleCategoryChange = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    setCurrentPage(1);
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
    // If viewing the deleted category, switch to "All"
    if (selectedCategory === categoryId) {
      handleCategoryChange(null);
    } else {
      // Just refresh the current view
      fetchVideos();
      fetchCategoryCounts();
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
              <h1 className="text-lg font-semibold">{siteConfig.name}</h1>
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
            onClick={() => handleCategoryChange(null)}
            disabled={isLoading}
          >
            All ({categoryCounts.all || 0})
          </Button>
          {categories.map((category) => {
            const count = categoryCounts[category.id] || 0;
            return (
              <Button
                key={category.id}
                variant={
                  selectedCategory === category.id ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => handleCategoryChange(category.id)}
                disabled={isLoading}
              >
                {category.name} ({count})
              </Button>
            );
          })}
          {categoryCounts.uncategorized > 0 && (
            <Button
              variant={
                selectedCategory === 'uncategorized' ? 'default' : 'outline'
              }
              size="sm"
              onClick={() => handleCategoryChange('uncategorized')}
              className="border-dashed"
              disabled={isLoading}
            >
              Uncategorized ({categoryCounts.uncategorized})
            </Button>
          )}
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="text-muted-foreground">Loading videos...</p>
          </div>
        ) : videos.length > 0 ? (
          <>
            {/* Videos grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {videos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        className={
                          currentPage === 1
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer'
                        }
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (page) => {
                        // Show first page, last page, current page, and pages around current
                        const showPage =
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1);

                        if (!showPage) {
                          // Show ellipsis for skipped pages
                          if (
                            page === currentPage - 2 ||
                            page === currentPage + 2
                          ) {
                            return (
                              <PaginationItem key={page}>
                                <span className="px-2">...</span>
                              </PaginationItem>
                            );
                          }
                          return null;
                        }

                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }
                    )}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        className={
                          currentPage === totalPages
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer'
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">No videos yet</h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              {categoryCounts.all === 0
                ? 'Click "Sync & Categorize" to fetch your liked videos from YouTube and automatically organize them.'
                : 'No videos match the selected filter.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
