'use client';

import * as React from 'react';
import {
  clientQuotaStateSchema,
  type ClientQuotaInfo,
  type ClientQuotaState,
} from '~/lib/quota';

// Re-export for convenience
export type { ClientQuotaInfo, ClientQuotaState };

interface UserContextValue {
  quota: ClientQuotaState | null;
  quotaLoading: boolean;
  quotaError: Error | null;
  refetchQuota: () => Promise<void>;
}

const UserContext = React.createContext<UserContextValue | undefined>(
  undefined
);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [quota, setQuota] = React.useState<ClientQuotaState | null>(null);
  const [quotaLoading, setQuotaLoading] = React.useState(true);
  const [quotaError, setQuotaError] = React.useState<Error | null>(null);
  const requestIdRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const fetchQuota = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setQuotaError(null);
      setQuotaLoading(true);
      const response = await fetch('/api/quota');
      if (!response.ok) {
        throw new Error('Failed to fetch quota');
      }
      const data = clientQuotaStateSchema.parse(await response.json());
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setQuota(data);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to fetch quota');
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setQuotaError(error);
    } finally {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setQuotaLoading(false);
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    fetchQuota();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchQuota]);

  const value = React.useMemo(
    () => ({
      quota,
      quotaLoading,
      quotaError,
      refetchQuota: fetchQuota,
    }),
    [quota, quotaLoading, quotaError, fetchQuota]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext(): UserContextValue {
  const context = React.useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
}
