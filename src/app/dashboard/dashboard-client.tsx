'use client';

import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LogOut,
  Search,
  X,
  Youtube,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { parseAsInteger, useQueryState } from 'nuqs';
import * as React from 'react';
import { toast } from 'sonner';
import { CategoryManager } from '~/components/category-manager';
import { SyncButton } from '~/components/sync-button';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { VideoCard } from '~/components/video-card';
import { authClient } from '~/lib/auth/client';
import { siteConfig } from '~/lib/site';
import type { Category } from '~/types/category';
import type { SerializedVideo } from '~/types/video';

interface DashboardClientProps {
  initialCategories: Category[];
  userName: string;
}

const pageParser = parseAsInteger.withDefault(1).withOptions({
  history: 'push',
  shallow: false,
});

export function DashboardClient({
  initialCategories,
  userName,
}: DashboardClientProps) {
  const router = useRouter();
  const [videos, setVideos] = React.useState<SerializedVideo[]>([]);
  const [categories, setCategories] =
    React.useState<Category[]>(initialCategories);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const [currentPage, setCurrentPage] = useQueryState('page', pageParser);
  const [totalPages, setTotalPages] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const limit = 24;

  const prevSearchQueryRef = React.useRef(searchQuery);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const hasChanged = prevSearchQueryRef.current !== searchQuery;
      prevSearchQueryRef.current = searchQuery;
      setDebouncedSearchQuery(searchQuery);
      if (hasChanged) {
        setCurrentPage(1);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, setCurrentPage]);

  const fetchVideos = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Clamp page to valid range before fetching to prevent out-of-bounds requests
      // Use previous totalPages to avoid unnecessary fetches
      let page = Math.max(1, currentPage);
      if (totalPages > 0 && page > totalPages) {
        page = 1;
        // Only update URL state if we're clamping the page
        if (currentPage !== 1) {
          setCurrentPage(1);
        }
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (selectedCategory === 'uncategorized') {
        params.set('uncategorized', 'true');
      } else if (selectedCategory) {
        params.set('categoryId', selectedCategory);
      }

      if (debouncedSearchQuery.trim()) {
        params.set('search', debouncedSearchQuery.trim());
      }

      const response = await fetch(`/api/youtube/videos?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }

      const data = await response.json();
      const newTotalPages = data.pagination?.totalPages || 0;
      setVideos(data.videos || []);
      setTotalPages(newTotalPages);

      // Only reset to page 1 if we're out of bounds AND not already on page 1
      // This prevents infinite loops if the API returns inconsistent totalPages
      if (newTotalPages > 0 && page > newTotalPages && currentPage !== 1) {
        setCurrentPage(1);
      }
    } catch {
      toast.error('Failed to fetch videos');
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    selectedCategory,
    debouncedSearchQuery,
    limit,
    totalPages,
    setCurrentPage,
  ]);

  React.useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const [categoryCounts, setCategoryCounts] = React.useState<
    Record<string, number>
  >({});

  const fetchCategoryCounts = React.useCallback(async () => {
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
      // Category counts are not critical, so we silently fail
    }
  }, []);

  React.useEffect(() => {
    fetchCategoryCounts();
  }, [fetchCategoryCounts]);

  const handleRefresh = () => {
    fetchVideos();
    fetchCategoryCounts();
    router.refresh();
  };

  const handleCategoryChange = React.useCallback(
    (categoryId: string | null) => {
      setSelectedCategory(categoryId);
      setCurrentPage(1);
    },
    [setCurrentPage]
  );

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
    if (selectedCategory === categoryId) {
      handleCategoryChange(null);
    } else {
      fetchVideos();
      fetchCategoryCounts();
    }
  };

  const getEmptyStateMessage = React.useMemo(() => {
    const hasSearchQuery = debouncedSearchQuery.trim().length > 0;
    const hasNoVideos = categoryCounts.all === 0;

    // If no videos at all, always prompt to sync first (even if searching)
    if (hasNoVideos) {
      return {
        title: hasSearchQuery ? 'No videos to search' : 'No videos yet',
        description:
          'Click "Sync & Categorize" to fetch your liked videos from YouTube and automatically organize them.',
      };
    }

    // If searching and videos exist but none match the search query
    if (hasSearchQuery) {
      return {
        title: 'No videos found',
        description: `No videos match "${debouncedSearchQuery}". Try a different search term or clear the search.`,
      };
    }

    // Videos exist but don't match the selected filter
    return {
      title: 'No videos yet',
      description: 'No videos match the selected filter.',
    };
  }, [debouncedSearchQuery, categoryCounts.all]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="flex min-w-0 items-center gap-3"
          >
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-700 shadow-lg shadow-red-600/20"
            >
              <Youtube className="h-5 w-5 text-white" />
            </motion.div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </h1>
              <p className="truncate text-xs text-muted-foreground/80">
                Welcome, {userName}
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="gap-2 transition-colors hover:bg-muted/50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </motion.div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
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
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-8"
        >
          <div className="relative max-w-md">
            <Input
              type="search"
              placeholder="Search videos by title, description, or channel..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
              className="peer h-11 rounded-xl border-border/50 bg-background pl-11 pr-11 text-sm shadow-sm transition-all duration-200 focus:border-ring focus:bg-background focus:shadow-md"
              aria-label="Search videos by title, description, or channel"
            />
            <Search
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60 transition-colors duration-200 peer-focus-within:text-muted-foreground"
              aria-hidden="true"
            />
            <AnimatePresence>
              {searchQuery && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => {
                    setSearchQuery('');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground/60 transition-all duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-8 flex flex-wrap gap-2"
        >
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleCategoryChange(null)}
            disabled={isLoading}
            className="h-9 whitespace-nowrap rounded-lg border-border/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
          >
            All ({categoryCounts.all || 0})
          </Button>
          {categories.map((category, index) => {
            const count = categoryCounts[category.id] || 0;
            const isActive = selectedCategory === category.id;
            return (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: 0.3 + index * 0.03 }}
              >
                <Button
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCategoryChange(category.id)}
                  disabled={isLoading}
                  className="h-9 whitespace-nowrap rounded-lg border-border/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
                >
                  <span className="truncate max-w-[120px] sm:max-w-none">
                    {category.name}
                  </span>
                  <span className="ml-1.5 font-normal opacity-80">
                    ({count})
                  </span>
                </Button>
              </motion.div>
            );
          })}
          {categoryCounts.uncategorized > 0 && (
            <Button
              variant={
                selectedCategory === 'uncategorized' ? 'default' : 'outline'
              }
              size="sm"
              onClick={() => handleCategoryChange('uncategorized')}
              className="h-9 border-dashed whitespace-nowrap rounded-lg border-border/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              disabled={isLoading}
            >
              <span className="truncate max-w-[100px] sm:max-w-none">
                Uncategorized
              </span>
              <span className="ml-1.5 font-normal opacity-80">
                ({categoryCounts.uncategorized})
              </span>
            </Button>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="mb-6 h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
              <p className="text-sm font-medium text-muted-foreground">
                Loading videos...
              </p>
            </motion.div>
          ) : videos.length > 0 ? (
            <motion.div
              key="videos"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {videos.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    priority={index < 6}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: 20 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.2,
                    type: 'spring',
                    stiffness: 300,
                    damping: 25,
                  }}
                  className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 sm:bottom-8"
                >
                  <motion.div
                    layout
                    className="flex items-center gap-0.5 rounded-full border border-border/40 bg-background/70 px-3.5 py-2 shadow-2xl shadow-black/10 backdrop-blur-2xl supports-backdrop-filter:bg-background/50 dark:border-border/20 dark:bg-background/60 dark:shadow-black/30"
                  >
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        const page = Math.max(1, currentPage);
                        const newPage = Math.max(1, page - 1);
                        setCurrentPage(newPage);
                      }}
                      disabled={currentPage <= 1}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </motion.button>

                    <motion.div
                      key={currentPage}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.25,
                        type: 'spring',
                        stiffness: 400,
                        damping: 25,
                      }}
                      className="mx-2.5 flex min-w-[55px] items-center justify-center"
                    >
                      <span className="text-xs font-semibold tabular-nums tracking-tight">
                        <span className="text-foreground">{currentPage}</span>
                        <span className="mx-1 text-muted-foreground/50">/</span>
                        <span className="text-muted-foreground/70">
                          {totalPages}
                        </span>
                      </span>
                    </motion.div>

                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        const page = Math.max(1, currentPage);
                        const newPage = Math.min(totalPages, page + 1);
                        setCurrentPage(newPage);
                      }}
                      disabled={currentPage >= totalPages}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </motion.button>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="mb-6 rounded-2xl bg-gradient-to-br from-muted/50 to-muted p-6 shadow-sm"
              >
                <FolderOpen className="h-12 w-12 text-muted-foreground/60" />
              </motion.div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {getEmptyStateMessage.title}
              </h2>
              <p className="mt-3 max-w-md text-sm text-muted-foreground/80">
                {getEmptyStateMessage.description}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
