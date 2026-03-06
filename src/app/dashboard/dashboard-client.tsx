'use client';

import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Link,
  LogOut,
  Search,
  Twitter,
  X,
  Youtube,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import * as React from 'react';
import { toast } from 'sonner';
import { CategoryManager } from '~/components/category-manager';
import { ConnectedAccounts } from '~/components/connected-accounts';
import { ContentCard } from '~/components/content-card';
import { QuotaDisplay } from '~/components/quota-display';
import { SyncButton } from '~/components/sync-button';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { authClient } from '~/lib/auth/client';
import { siteConfig } from '~/lib/site';
import type { ContentSource } from '~/lib/sources/types';
import type { Category } from '~/types/category';
import type { SerializedContentItem } from '~/types/content';

interface DashboardClientProps {
  initialCategories: Category[];
  userName: string;
  userEmail: string;
}

const pageParser = parseAsInteger.withDefault(1).withOptions({
  history: 'push',
  shallow: false,
});

const searchParser = parseAsString.withDefault('').withOptions({
  history: 'push',
  shallow: false,
});

const SOURCE_FILTERS: Array<{
  value: ContentSource | null;
  label: string;
  icon: React.ElementType;
  color: string;
}> = [
  { value: null, label: 'All', icon: FolderOpen, color: '' },
  { value: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-500' },
  { value: 'x', label: 'X', icon: Twitter, color: '' },
];

export function DashboardClient({
  initialCategories,
  userName,
  userEmail,
}: DashboardClientProps) {
  const router = useRouter();
  const [accountsOpen, setAccountsOpen] = React.useState(false);
  const [items, setItems] = React.useState<SerializedContentItem[]>([]);
  const [categories, setCategories] =
    React.useState<Category[]>(initialCategories);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null
  );
  const [selectedSource, setSelectedSource] =
    React.useState<ContentSource | null>(null);
  const [searchQuery, setSearchQuery] = useQueryState('search', searchParser);
  const [localSearchQuery, setLocalSearchQuery] = React.useState(searchQuery || '');
  const [currentPage, setCurrentPage] = useQueryState('page', pageParser);
  const [totalPages, setTotalPages] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const limit = 24;

  React.useEffect(() => {
    setLocalSearchQuery(searchQuery || '');
  }, [searchQuery]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedLocal = localSearchQuery.trim();
      const trimmedUrl = (searchQuery || '').trim();

      if (trimmedLocal !== trimmedUrl) {
        setSearchQuery(trimmedLocal || null);
        setCurrentPage(1);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearchQuery, searchQuery, setSearchQuery, setCurrentPage]);

  const fetchContent = React.useCallback(async () => {
    setIsLoading(true);
    try {
      let page = Math.max(1, currentPage);
      if (totalPages > 0 && page > totalPages) {
        page = 1;
        if (currentPage !== 1) {
          setCurrentPage(1);
        }
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (selectedSource) {
        params.set('source', selectedSource);
      }

      if (selectedCategory === 'uncategorized') {
        params.set('uncategorized', 'true');
      } else if (selectedCategory) {
        params.set('categoryId', selectedCategory);
      }

      if (searchQuery?.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/content?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch content');
      }

      const data = await response.json();
      const newTotalPages = data.pagination?.totalPages || 0;
      setItems(data.items || []);
      setTotalPages(newTotalPages);

      if (newTotalPages > 0 && page > newTotalPages && currentPage !== 1) {
        setCurrentPage(1);
      }
    } catch {
      toast.error('Failed to fetch content');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    selectedCategory,
    selectedSource,
    searchQuery,
    limit,
    totalPages,
    setCurrentPage,
  ]);

  React.useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const [categoryCounts, setCategoryCounts] = React.useState<
    Record<string, number>
  >({});
  const [sourceCounts, setSourceCounts] = React.useState<
    Record<string, number>
  >({});

  const fetchCounts = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedSource) {
        params.set('source', selectedSource);
      }
      const url = params.toString()
        ? `/api/content/counts?${params}`
        : '/api/content/counts';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch counts');
      }

      const data = await response.json();
      const counts: Record<string, number> = {
        all: data.total || 0,
        uncategorized: data.uncategorized || 0,
        ...data.byCategory,
      };

      setCategoryCounts(counts);
      setSourceCounts(data.bySource || {});
    } catch {
      // Counts are not critical, so we silently fail
    }
  }, [selectedSource]);

  React.useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const handleRefresh = () => {
    fetchContent();
    fetchCounts();
    router.refresh();
  };

  const handleCategoryChange = React.useCallback(
    (categoryId: string | null) => {
      setSelectedCategory(categoryId);
      setCurrentPage(1);
    },
    [setCurrentPage]
  );

  const handleSourceChange = React.useCallback(
    (source: ContentSource | null) => {
      setSelectedSource(source);
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
      fetchContent();
      fetchCounts();
    }
  };

  const totalAllSources = Object.values(sourceCounts).reduce(
    (sum, c) => sum + c,
    0
  );

  const getPageNumbers = React.useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    const delta = 1;
    const total = totalPages;
    const current = currentPage;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (current - delta > 2) {
        pages.push('ellipsis');
      }

      const start = Math.max(2, current - delta);
      const end = Math.min(total - 1, current + delta);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (current + delta < total - 1) {
        pages.push('ellipsis');
      }

      pages.push(total);
    }

    return pages;
  }, [currentPage, totalPages]);

  const getEmptyStateMessage = React.useMemo(() => {
    const searchValue = searchQuery || '';
    const hasSearchQuery = searchValue.trim().length > 0;
    const hasNoContent = categoryCounts.all === 0 && totalAllSources === 0;

    if (hasNoContent) {
      return {
        title: hasSearchQuery ? 'No content to search' : 'No content yet',
        description:
          'Click "Sync" to fetch your liked videos and bookmarks, then use "Categorize" to organize them with AI.',
      };
    }

    if (hasSearchQuery) {
      return {
        title: 'No results found',
        description: `No content matches "${searchValue}". Try a different search term or clear the search.`,
      };
    }

    return {
      title: 'No content here',
      description: 'No content matches the selected filters.',
    };
  }, [searchQuery, categoryCounts.all, totalAllSources]);

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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20"
            >
              <FolderOpen className="h-5 w-5 text-primary-foreground" />
            </motion.div>
            <div className="min-w-0 flex-1">
              <h1
                className="truncate text-lg font-semibold tracking-tight"
                title={siteConfig.name}
              >
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
            className="flex items-center gap-3"
          >
            <QuotaDisplay />
            <Button
              variant="ghost"
              onClick={() => setAccountsOpen(true)}
              className="gap-2 transition-colors hover:bg-muted/50"
            >
              <Link className="h-4 w-4" />
              <span className="hidden sm:inline">Accounts</span>
            </Button>
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

        {/* Source filter pills */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mb-4 flex flex-wrap gap-2"
        >
          {SOURCE_FILTERS.map((sf) => {
            const isActive = selectedSource === sf.value;
            const sourceCount =
              sf.value === null
                ? totalAllSources
                : sourceCounts[sf.value] ?? 0;
            // Only show source pills that have content (or the "All" pill always)
            if (sf.value !== null && sourceCount === 0) return null;
            const Icon = sf.icon;
            return (
              <Button
                key={sf.value ?? 'all'}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSourceChange(sf.value)}
                disabled={isLoading}
                className="h-8 gap-1.5 whitespace-nowrap rounded-lg border-border/50 px-3 text-sm font-medium shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50"
              >
                <Icon
                  className={`h-3.5 w-3.5 ${!isActive ? sf.color : ''}`}
                />
                {sf.label}
                <span className="ml-0.5 font-normal opacity-80">
                  ({sourceCount})
                </span>
              </Button>
            );
          })}
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
              placeholder="Search by title, description, or author..."
              value={localSearchQuery}
              onChange={(e) => {
                setLocalSearchQuery(e.target.value);
              }}
              className="peer h-11 rounded-xl border-border/50 bg-background pl-11 pr-11 text-sm shadow-sm transition-all duration-200 focus:border-ring focus:bg-background focus:shadow-md [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-moz-search-clear-button]:hidden"
              aria-label="Search by title, description, or author"
            />
            <Search
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60 transition-colors duration-200 peer-focus-within:text-muted-foreground"
              aria-hidden="true"
            />
            {localSearchQuery && (
              <button
                onClick={() => {
                  setLocalSearchQuery('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 cursor-pointer opacity-60 transition-opacity duration-200 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                aria-label="Clear search"
                type="button"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </motion.div>

        {/* Category filter pills */}
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
                  <span
                    className="truncate max-w-[120px] sm:max-w-none"
                    title={category.name}
                  >
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
                Loading content...
              </p>
            </motion.div>
          ) : items.length > 0 ? (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item, index) => (
                  <ContentCard
                    key={item.id}
                    item={item}
                    priority={index < 6}
                  />
                ))}
              </div>
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
              className="flex items-center gap-1 rounded-full border-2 border-border bg-background/95 px-2 py-2.5 shadow-2xl shadow-black/20 backdrop-blur-xl supports-backdrop-filter:bg-background/90 dark:border-border/60 dark:bg-background/95 dark:shadow-black/40"
            >
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  const page = Math.max(1, currentPage);
                  const newPage = Math.max(1, page - 1);
                  setCurrentPage(newPage);
                }}
                disabled={currentPage <= 1 || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/80 transition-all hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </motion.button>

              <div className="mx-1 flex items-center gap-0.5">
                {getPageNumbers.map((page, index) => {
                  if (page === 'ellipsis') {
                    return (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-2 text-sm text-muted-foreground/60"
                        aria-hidden="true"
                      >
                        ...
                      </span>
                    );
                  }

                  const isActive = page === currentPage;
                  return (
                    <motion.button
                      key={page}
                      whileHover={!isActive && !isLoading ? { scale: 1.1 } : undefined}
                      whileTap={!isActive && !isLoading ? { scale: 0.95 } : undefined}
                      onClick={() => !isLoading && setCurrentPage(page)}
                      disabled={isLoading}
                      className={`flex h-8 min-w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-all ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                      } ${isLoading ? 'disabled:opacity-50' : ''}`}
                      aria-label={`Go to page ${page}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {page}
                    </motion.button>
                  );
                })}
              </div>

              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  const page = Math.max(1, currentPage);
                  const newPage = Math.min(totalPages, page + 1);
                  setCurrentPage(newPage);
                }}
                disabled={currentPage >= totalPages || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/80 transition-all hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </main>

      <ConnectedAccounts
        open={accountsOpen}
        onOpenChange={setAccountsOpen}
        userEmail={userEmail}
      />
    </div>
  );
}
