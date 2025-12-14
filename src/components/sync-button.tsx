'use client';

import { formatDistanceToNow } from 'date-fns';
import { Clock, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';

interface SyncButtonProps {
  onSyncComplete?: (result: { synced: number; new: number }) => void;
  onCategorizeComplete?: (result: { categorized: number }) => void;
}

interface SyncStatus {
  lastSyncAt: string | null;
  totalVideos: number;
}

export function SyncButton({
  onSyncComplete,
  onCategorizeComplete,
}: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const fetchSyncStatus = useCallback(async () => {
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

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  const handleSync = async () => {
    setIsSyncing(true);
    setStatus('Fetching liked videos from YouTube...');

    try {
      const response = await fetch('/api/youtube/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync');
      }

      const result = await response.json();
      setStatus(`Synced ${result.new} new videos`);
      onSyncComplete?.(result);

      // Refresh sync status
      await fetchSyncStatus();

      // Auto-categorize after sync
      await handleCategorize();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed');
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

      // Clear status after a delay
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
        <Button onClick={handleSync} disabled={isLoading} className="gap-2">
          {isSyncing ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sync & Categorize
        </Button>

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
