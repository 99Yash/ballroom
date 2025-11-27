'use client';

import { useRouter } from 'next/navigation';
import React from 'react';
import { toast } from 'sonner';
import * as z from 'zod/v4';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { authClient } from '~/lib/auth/client';
import { AuthOptionsType } from '~/lib/constants';
import {
  getErrorMessage,
  getLocalStorageItem,
  setLocalStorageItem,
} from '~/lib/utils';

const schema = z.object({
  email: z.email().max(255, 'Email must be less than 255 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type EmailSignInProps = z.infer<typeof schema>;

export function EmailSignIn() {
  const router = useRouter();
  const [lastAuthMethod, setLastAuthMethod] =
    React.useState<AuthOptionsType | null>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastAuthMethod = getLocalStorageItem('LAST_AUTH_METHOD');
      setLastAuthMethod(lastAuthMethod ?? null);
    }
  }, []);

  const [isLoading, setIsLoading] = React.useState(false);

  const handleSignIn = React.useCallback(
    async ({ email, password }: EmailSignInProps) => {
      setIsLoading(true);
      try {
        await authClient.signIn.email({
          email,
          password,
          callbackURL: '/',
        });

        // Persist last used auth method
        if (typeof window !== 'undefined') {
          setLocalStorageItem('LAST_AUTH_METHOD', 'EMAIL');
        }

        router.push('/');
        toast.success('Successfully signed in!');
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);

    const { success, data, error } = schema.safeParse(
      Object.fromEntries(formData)
    );

    if (!success) {
      toast.error(error.message);
      return;
    }

    await handleSignIn(data);
  }

  return (
    <form className="grid gap-2" onSubmit={handleSubmit}>
      <div className="grid gap-1">
        <Input
          name="email"
          placeholder="name@example.com"
          type="email"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect="off"
          className="bg-background"
          required
        />
      </div>
      <div className="grid gap-1">
        <Input
          name="password"
          placeholder="Enter your password"
          type="password"
          autoComplete="current-password"
          className="bg-background"
          required
        />
      </div>
      <Button disabled={isLoading} type="submit" className="relative">
        {isLoading ? (
          <Spinner className="mr-2 bg-background" />
        ) : (
          'Sign In with Email'
        )}
        {lastAuthMethod === 'EMAIL' && (
          <i className="text-xs absolute right-4 text-muted text-center">
            Last used
          </i>
        )}
      </Button>
    </form>
  );
}
