'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Spinner } from '~/components/ui/spinner';
import { authClient } from '~/lib/auth/client';
import {
  AuthOptionsType,
  getProviderById,
  OAUTH_PROVIDERS,
  OAuthProviderId,
} from '~/lib/constants';
import {
  getErrorMessage,
  getLocalStorageItem,
  setLocalStorageItem,
} from '~/lib/utils';

interface OAuthButtonProps {
  providerId: OAuthProviderId;
}

const OAuthButton: React.FC<OAuthButtonProps> = ({ providerId }) => {
  const [lastAuthMethod, setLastAuthMethod] =
    React.useState<AuthOptionsType | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const provider = getProviderById(providerId);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastAuthMethod = getLocalStorageItem('LAST_AUTH_METHOD');
      setLastAuthMethod(lastAuthMethod ?? null);
    }
  }, []);

  const handleOAuthSignIn = React.useCallback(async () => {
    if (!provider) {
      toast.error('Provider not found');
      return;
    }

    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: providerId,
        callbackURL: '/',
      });

      setLocalStorageItem(
        'LAST_AUTH_METHOD',
        providerId.toUpperCase() as AuthOptionsType
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [provider, providerId]);

  if (!provider) {
    return null;
  }

  const renderIcon = () => {
    if (provider.icon) {
      const IconComponent = provider.icon;
      return <IconComponent className="size-5" />;
    }
    return null;
  };

  const isLastUsed =
    lastAuthMethod === (provider.id.toUpperCase() as AuthOptionsType);

  return (
    <button
      onClick={handleOAuthSignIn}
      disabled={isLoading}
      className="relative flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {renderIcon()}
      <span>
        {isLoading ? 'Signing in…' : `Continue with ${provider.name}`}
      </span>
      {isLoading ? (
        <Spinner className="absolute right-4 bg-white" />
      ) : (
        isLastUsed && (
          <span className="absolute right-4 text-xs text-muted-foreground">
            Last used
          </span>
        )
      )}
    </button>
  );
};

export const OAuthButtons: React.FC = () => {
  return (
    <div className="space-y-2">
      {Object.values(OAUTH_PROVIDERS).map((provider) => (
        <OAuthButton
          key={provider.id}
          providerId={provider.id as OAuthProviderId}
        />
      ))}
    </div>
  );
};

export { OAuthButton };
