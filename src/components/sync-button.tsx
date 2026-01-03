'use client';

import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, Clock, FastForward, RotateCcw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
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
import { APP_CONFIG } from '~/lib/constants';

interface SyncButtonProps {
  onSyncComplete?: (result: { synced: number; new: number }) => void;
  onCategorizeComplete?: (result: { categorized: number }) => void;
}

interface SyncStatus {
  lastSyncAt: string | null;
  totalVideos: number;
}

interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  percentageUsed: number;
  resetAt: string | null;
}

interface QuotaState {
  sync: QuotaInfo;
  categorize: QuotaInfo;
}

const isDevelopment = process.env.NODE_ENV === 'development';

export function SyncButton({
  onSyncComplete,
  onCategorizeComplete,
}: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isCategorizing, setIsCategorizing] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus | null>(null);
  const [quota, setQuota] = React.useState<QuotaState | null>(null);

  const fetchSyncStatus = React.useCallback(async () => {
    try {
      const response = await fetch('/api/sync-status');
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data);
      }
    } catch {
      // Sync status is optional
    }
  }, []);

  const fetchQuota = React.useCallback(async () => {
    try {
      const response = await fetch('/api/quota');
      if (response.ok) {
        const data = await response.json();
        setQuota(data);
      }
    } catch {
      // Quota is optional
    }
  }, []);

  React.useEffect(() => {
    fetchSyncStatus();
    fetchQuota();
  }, [fetchSyncStatus, fetchQuota]);

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
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync');
      }

      const result = await response.json();

      if (result.quota) {
        setQuota(result.quota);
      }

      const message =
        result.new > 0
          ? `Synced ${result.new} new videos`
          : 'No new videos found';

      setStatus(message);
      toast.success('Sync complete', { description: message });
      onSyncComplete?.(result);

      await fetchSyncStatus();
      await handleCategorize();
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
        fetchQuota();
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to categorize');
      }

      const result = await response.json();

      if (result.quota) {
        setQuota(result.quota);
      }

      const message =
        result.categorized > 0
          ? `Categorized ${result.categorized} videos`
          : 'All videos already categorized';

      setStatus(message);
      toast.success('Categorization complete', { description: message });
      onCategorizeComplete?.(result);

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
    ? formatDistanceToNow(new Date(syncStatus.lastSyncAt), { addSuffix: true })
    : null;

  const categorizeQuotaText = quota
    ? `${quota.categorize.remaining}/${quota.categorize.limit}`
    : null;

  const isCategorizeQuotaLow =
    quota && quota.categorize.percentageUsed >= APP_CONFIG.quota.warningThreshold;
  const isCategorizeQuotaExceeded = quota && quota.categorize.remaining <= 0;

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <div className="flex w-full flex-wrap items-center gap-2">
        <div className="flex">
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
            <span className="hidden sm:inline">
              Sync Videos (no auto-categorization)
            </span>
            <span className="sm:hidden">Sync Only</span>
          </Button>
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
                <span
                  className={`text-xs ${
                    isCategorizeQuotaLow
                      ? 'text-amber-500'
                      : 'text-muted-foreground'
                  }`}
                >
                  ({categorizeQuotaText})
                </span>
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
