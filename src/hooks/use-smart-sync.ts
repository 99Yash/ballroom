'use client';

import { useCallback, useEffect, useRef } from 'react';

interface SmartSyncOptions {
  /** Called when new content is detected after a poll */
  onNewContent: () => void;
  /** Polling interval in ms (default: 60000) */
  interval?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
}

interface SmartSyncResponse {
  sync: { new: number; existing: number };
  categorized: number;
  playlists: { synced: number; created: number } | null;
  hasNewContent: boolean;
}

/**
 * Polls /api/smart-sync at a regular interval when the tab is visible.
 * Triggers onNewContent when new videos are detected, so the dashboard can refresh.
 */
export function useSmartSync({
  onNewContent,
  interval = 60_000,
  enabled = true,
}: SmartSyncOptions) {
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onNewContentRef = useRef(onNewContent);
  onNewContentRef.current = onNewContent;

  const poll = useCallback(async () => {
    if (inFlightRef.current || document.hidden) return;
    inFlightRef.current = true;

    try {
      const res = await fetch('/api/smart-sync', { method: 'POST' });
      if (!res.ok) return;

      const data: SmartSyncResponse = await res.json();
      if (data.hasNewContent) {
        onNewContentRef.current();
      }
    } catch {
      // Silently ignore — will retry on next interval
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Start interval
    timerRef.current = setInterval(poll, interval);

    // Pause/resume on visibility change
    const handleVisibility = () => {
      if (document.hidden) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } else {
        // Resume polling and do an immediate poll
        poll();
        timerRef.current = setInterval(poll, interval);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [poll, interval, enabled]);
}
