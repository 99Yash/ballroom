'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  ChevronDown,
  Clock,
  FastForward,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Spinner } from '~/components/ui/spinner';

interface SyncButtonProps {
  onSyncComplete?: (result: { synced: number; new: number }) => void;
  onCategorizeComplete?: (result: { categorized: number }) => void;
}

interface SyncStatus {
  lastSyncAt: string | null;
  totalVideos: number;
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

  const fetchSyncStatus = React.useCallback(async () => {
    try {
      const response = await fetch('/api/sync-status');
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data);
      }
    } catch {
      // Silently fail - sync status is optional
    }
  }, []);

  React.useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  const handleSync = async (limit: number) => {
    setIsSyncing(true);
    setStatus(`Fetching up to ${limit} liked videos...`);

    try {
      const response = await fetch('/api/youtube/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync');
      }

      const result = await response.json();
      setStatus(`Synced ${result.new} new videos`);
      onSyncComplete?.(result);

      await fetchSyncStatus();
      await handleCategorize();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQuickSync = () => handleSync(100);
  const handleExtendedSync = () => handleSync(500);

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

      await response.json();
      toast.success('Full sync started', {
        description:
          'Syncing all your liked videos in the background. This may take a few minutes.',
      });
      setStatus('Full sync running in background...');

      setTimeout(() => {
        setStatus(null);
        fetchSyncStatus();
      }, 5000);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Full sync failed');
      toast.error('Failed to start full sync');
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
      setStatus(`Categorized ${result.categorized} videos`);
      onCategorizeComplete?.(result);

      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Categorization failed'
      );
    } finally {
      setIsCategorizing(false);
    }
  };

  const isLoading = isSyncing || isCategorizing;

  const lastSyncText = syncStatus?.lastSyncAt
    ? formatDistanceToNow(new Date(syncStatus.lastSyncAt), { addSuffix: true })
    : null;

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        {isDevelopment ? (
          <div className="flex">
            <Button
              onClick={handleQuickSync}
              disabled={isLoading}
              className="gap-2 rounded-r-none"
            >
              {isSyncing ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync & Categorize
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
                <DropdownMenuItem
                  onClick={handleQuickSync}
                  disabled={isLoading}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  <div>
                    <div className="font-medium">Quick Sync</div>
                    <div className="text-xs text-muted-foreground">
                      Fetch last 100 videos
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
                      Fetch last 500 videos
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFullSync} disabled={isLoading}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  <div>
                    <div className="font-medium">Full Sync (Dev Only)</div>
                    <div className="text-xs text-muted-foreground">
                      Sync all liked videos (background, rate limited)
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button
            onClick={handleQuickSync}
            disabled={isLoading}
            className="gap-2"
          >
            {isSyncing ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync & Categorize
          </Button>
        )}

        <Button
          onClick={handleCategorize}
          disabled={isLoading}
          variant="outline"
          className="gap-2"
        >
          {isCategorizing ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Re-categorize
        </Button>

        {lastSyncText && !isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Last sync {lastSyncText}</span>
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
