'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
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
  className?: React.ComponentProps<typeof Button>['className'];
}

const OAuthButton: React.FC<OAuthButtonProps> = ({ providerId, className }) => {
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

  return (
    <Button
      variant="outline"
      className={`w-full relative ${className}`}
      onClick={handleOAuthSignIn}
      disabled={isLoading}
    >
      {renderIcon()}
      <span className="text-sm">
        {isLoading ? 'Signing in…' : `Continue with ${provider.name}`}
      </span>
      {isLoading ? (
        <Spinner className="mr-2 bg-background" />
      ) : (
        lastAuthMethod === (provider.id.toUpperCase() as AuthOptionsType) && (
          <i className="text-xs absolute right-4 text-muted-foreground text-center">
            Last used
          </i>
        )
      )}
    </Button>
  );
};

export const OAuthButtons: React.FC<{
  className?: React.ComponentProps<typeof Button>['className'];
}> = ({ className }) => {
  return (
    <div className={`space-y-1 ${className}`}>
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
