'use client';

import { RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';

interface SyncButtonProps {
  onSyncComplete?: (result: { synced: number; new: number }) => void;
  onCategorizeComplete?: (result: { categorized: number }) => void;
}

export function SyncButton({
  onSyncComplete,
  onCategorizeComplete,
}: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex gap-2">
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
      </div>

      {status && (
        <p className="text-sm text-muted-foreground animate-in fade-in slide-in-from-top-1">
          {status}
        </p>
      )}
    </div>
  );
}
