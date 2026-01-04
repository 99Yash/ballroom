'use client';

import * as React from 'react';

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  percentageUsed: number;
  resetAt: string | null;
}

export interface QuotaState {
  sync: QuotaInfo;
  categorize: QuotaInfo;
}

interface UserContextValue {
  quota: QuotaState | null;
  quotaLoading: boolean;
  quotaError: Error | null;
  refetchQuota: () => Promise<void>;
}

const UserContext = React.createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [quota, setQuota] = React.useState<QuotaState | null>(null);
  const [quotaLoading, setQuotaLoading] = React.useState(true);
  const [quotaError, setQuotaError] = React.useState<Error | null>(null);

  const fetchQuota = React.useCallback(async () => {
    try {
      setQuotaError(null);
      setQuotaLoading(true);
      const response = await fetch('/api/quota');
      if (!response.ok) {
        throw new Error('Failed to fetch quota');
      }
      const data = await response.json();
      setQuota(data);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to fetch quota');
      setQuotaError(error);
    } finally {
      setQuotaLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchQuota();
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

