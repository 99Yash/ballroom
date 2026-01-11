'use client';

import { ChevronDown, Clock, FastForward, RotateCcw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import * as z from 'zod/v4';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { RefreshCWIcon } from '~/components/ui/icons/refresh-cw';
import { SparklesIcon } from '~/components/ui/icons/sparkles';
import { Spinner } from '~/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { isQuotaExceeded, isQuotaLow, useQuota } from '~/hooks/use-quota';
import { clientQuotaStateSchema } from '~/lib/quota-client';
import { cn, formatTimeToNow } from '~/lib/utils';

interface SyncButtonProps {
  onSyncComplete?: (result: { synced: number; new: number }) => void;
  onCategorizeComplete?: (result: { categorized: number }) => void;
}

interface SyncStatus {
  lastSyncAt: string | null;
  totalVideos: number;
}

const syncStatusSchema = z.object({
  lastSyncAt: z.string().nullable(),
  totalVideos: z.number(),
});

const youtubeSyncResponseSchema = z.object({
  synced: z.number(),
  new: z.number(),
  existing: z.number(),
  unliked: z.number(),
  reachedEnd: z.boolean(),
  message: z.string().optional(),
  quota: clientQuotaStateSchema.optional(),
  quotaFetchFailed: z.boolean().optional(),
});

const categorizeResponseSchema = z.object({
  categorized: z.number(),
  total: z.number(),
  skipped: z.number(),
  message: z.string().optional(),
  quota: clientQuotaStateSchema.optional(),
  quotaFetchFailed: z.boolean().optional(),
});

const errorResponseSchema = z.object({
  error: z.string().optional(),
});

const isDevelopment = process.env.NODE_ENV === 'development';

export function SyncButton({
  onSyncComplete,
  onCategorizeComplete,
}: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isCategorizing, setIsCategorizing] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus | null>(null);
  const { quota, refetch: refetchQuota } = useQuota();

  const fetchSyncStatus = React.useCallback(async () => {
    try {
      const response = await fetch('/api/sync-status');
      if (response.ok) {
        const data = syncStatusSchema.parse(await response.json());
        setSyncStatus(data);
      }
    } catch {
    }
  }, []);

  React.useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  const handleSync = async (mode: 'quick' | 'extended') => {
    setIsSyncing(true);
    const modeLabel = mode === 'extended' ? 'Extended' : 'Quick';
    setStatus(`${modeLabel} sync in progress...`);

    try {
      const response = await fetch('/api/youtube/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      if (!response.ok) {
        const errorJson = errorResponseSchema.safeParse(await response.json());
        throw new Error(errorJson.success ? (errorJson.data.error ?? 'Failed to sync') : 'Failed to sync');
      }

      const result = youtubeSyncResponseSchema.parse(await response.json());

      const message =
        result.new > 0
          ? `Synced ${result.new} new videos`
          : 'No new videos found';

      setStatus(message);
      toast.success('Sync complete', { description: message });

      if (result.quotaFetchFailed) {
        toast.warning('Quota information temporarily unavailable', {
          description:
            'Sync succeeded, but quota info may be outdated. Refreshing...',
        });
      }

      onSyncComplete?.(result);

      await Promise.all([fetchSyncStatus(), refetchQuota()]);
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Sync failed';
      setStatus(errorMessage);
      toast.error('Sync failed', { description: errorMessage });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQuickSync = () => handleSync('quick');
  const handleExtendedSync = () => handleSync('extended');

  const handleFullSync = async () => {
    setIsSyncing(true);
    setStatus('Starting full sync in background...');

    try {
      const response = await fetch('/api/youtube/full-sync', {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start full sync');
      }

      toast.success('Full sync started', {
        description:
          'Syncing all your liked videos in the background. This may take a few minutes.',
      });
      setStatus('Full sync running in background...');

      setTimeout(() => {
        setStatus(null);
        fetchSyncStatus();
        refetchQuota();
      }, 5000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Full sync failed';
      setStatus(errorMessage);
      toast.error('Failed to start full sync', { description: errorMessage });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCategorize = async () => {
    setIsCategorizing(true);
    setStatus('Categorizing videos with AI...');

    try {
      const response = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorJson = errorResponseSchema.safeParse(await response.json());
        throw new Error(
          errorJson.success
            ? (errorJson.data.error ?? 'Failed to categorize')
            : 'Failed to categorize'
        );
      }

      const result = categorizeResponseSchema.parse(await response.json());

      const message =
        result.categorized > 0
          ? `Categorized ${result.categorized} videos`
          : 'All videos already categorized';

      setStatus(message);
      toast.success('Categorization complete', { description: message });

      if (result.quotaFetchFailed) {
        toast.warning('Quota information temporarily unavailable', {
          description:
            'Categorization succeeded, but quota info may be outdated. Refreshing...',
        });
      }

      onCategorizeComplete?.(result);

      await refetchQuota();
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Categorization failed';
      setStatus(errorMessage);
      toast.error('Categorization failed', { description: errorMessage });
    } finally {
      setIsCategorizing(false);
    }
  };

  const isLoading = isSyncing || isCategorizing;

  const lastSyncText = syncStatus?.lastSyncAt
    ? formatTimeToNow(syncStatus.lastSyncAt)
    : null;

  const categorizeQuotaText = quota
    ? `${quota.categorize.remaining}/${quota.categorize.limit}`
    : null;

  const isCategorizeQuotaLow = quota ? isQuotaLow(quota.categorize) : false;
  const isCategorizeQuotaExceeded = quota
    ? isQuotaExceeded(quota.categorize)
    : false;

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <div className="flex w-full flex-wrap items-center gap-2">
        <div className="flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleQuickSync}
                disabled={isLoading}
                className="gap-2 rounded-r-none"
              >
                {isSyncing ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <RefreshCWIcon size={16} />
                )}
                <span>Sync</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Sync videos without auto-categorization</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={isLoading}
                className="rounded-l-none border-l border-l-primary-foreground/20 px-2"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleQuickSync} disabled={isLoading}>
                <RefreshCWIcon size={16} className="mr-2" />
                <div>
                  <div className="font-medium">Quick Sync</div>
                  <div className="text-xs text-muted-foreground">
                    Progressive sync, catches new videos
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExtendedSync}
                disabled={isLoading}
              >
                <FastForward className="mr-2 h-4 w-4" />
                <div>
                  <div className="font-medium">Extended Sync</div>
                  <div className="text-xs text-muted-foreground">
                    Deeper sync, catches more older videos
                  </div>
                </div>
              </DropdownMenuItem>
              {isDevelopment && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleFullSync}
                    disabled={isLoading}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    <div>
                      <div className="font-medium">Full Sync (Dev Only)</div>
                      <div className="text-xs text-muted-foreground">
                        Sync all liked videos in background
                      </div>
                    </div>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleCategorize}
              disabled={isLoading || !!isCategorizeQuotaExceeded}
              variant="outline"
              className="gap-2"
            >
              {isCategorizing ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <SparklesIcon size={16} />
              )}
              <span className="hidden sm:inline">Categorize</span>
              {categorizeQuotaText && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'ml-1 h-5 px-1.5 text-xs font-normal',
                    isCategorizeQuotaLow && 'text-amber-500',
                    isCategorizeQuotaExceeded && 'text-destructive'
                  )}
                >
                  {categorizeQuotaText}
                </Badge>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isCategorizeQuotaExceeded
              ? 'Quota exceeded. Resets monthly.'
              : 'Categorize uncategorized videos with AI'}
          </TooltipContent>
        </Tooltip>

        {lastSyncText && !isLoading && (
          <div className="flex w-full basis-full items-center gap-1.5 text-xs text-muted-foreground sm:w-auto sm:basis-auto">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Last sync </span>
              {lastSyncText}
            </span>
          </div>
        )}
      </div>

      {status && (
        <p className="text-sm text-muted-foreground animate-in fade-in slide-in-from-top-1">
          {status}
        </p>
      )}
    </div>
  );
}
