'use client';

import type { ClientQuotaInfo, ClientQuotaState } from '~/lib/quota';
import { useUserContext } from '~/contexts/user-context';
import { APP_CONFIG } from '~/lib/constants';

// Re-export client types for consumers
export type { ClientQuotaInfo, ClientQuotaState };

export function useQuota() {
  const { quota, quotaLoading, quotaError, refetchQuota } = useUserContext();
  return {
    quota,
    isLoading: quotaLoading,
    error: quotaError,
    refetch: refetchQuota,
  };
}

export function isQuotaLow(quota: ClientQuotaInfo): boolean {
  return quota.percentageUsed >= APP_CONFIG.quota.warningThreshold;
}

export function isQuotaExceeded(quota: ClientQuotaInfo): boolean {
  return quota.remaining <= 0;
}
