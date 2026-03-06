'use client';

import * as React from 'react';

export interface LinkedAccount {
  providerId: string;
  accountId: string;
  createdAt: string | null;
}

export interface ConnectedAccountsState {
  accounts: LinkedAccount[];
  xConfigured: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  /** Whether the user has an X/Twitter account linked. */
  hasX: boolean;
}

export function useConnectedAccounts(): ConnectedAccountsState {
  const [accounts, setAccounts] = React.useState<LinkedAccount[]>([]);
  const [xConfigured, setXConfigured] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const requestIdRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const fetchAccounts = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setError(null);
      setIsLoading(true);
      const response = await fetch('/api/accounts');
      if (!response.ok) {
        throw new Error('Failed to fetch connected accounts');
      }
      const data = await response.json();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setAccounts(data.accounts ?? []);
      setXConfigured(data.xConfigured ?? false);
    } catch (err) {
      const fetchError =
        err instanceof Error
          ? err
          : new Error('Failed to fetch connected accounts');
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(fetchError);
    } finally {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    fetchAccounts();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchAccounts]);

  const hasX = React.useMemo(
    () => accounts.some((a) => a.providerId === 'twitter'),
    [accounts]
  );

  return { accounts, xConfigured, isLoading, error, refetch: fetchAccounts, hasX };
}
