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
  const [isLoading, setIsLoading] = React.useState(false);

  const provider = getProviderById(providerId);

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

  return (
    <button
      onClick={handleOAuthSignIn}
      disabled={isLoading}
      className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-4 text-sm font-medium text-foreground shadow-sm transition-all duration-200 hover:border-ring hover:bg-accent hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card disabled:hover:shadow-sm"
    >
      {isLoading ? (
        <>
          <Spinner className="size-5" />
          <span>Signing in…</span>
        </>
      ) : (
        <>
          {renderIcon()}
          <span>Continue with {provider.name}</span>
        </>
      )}
    </button>
  );
};

export const OAuthButtons: React.FC = () => {
  return (
    <div>
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
