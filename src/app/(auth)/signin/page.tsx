import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OAuthButtons } from '~/app/(auth)/signin/oauth-buttons';
import { auth } from '~/lib/auth/server';
import { siteConfig } from '~/lib/site';

export default async function AuthenticationPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center">
      {/* Header */}
      <div className="mb-12 flex flex-col items-center space-y-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Welcome to {siteConfig.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to organize your YouTube liked videos with AI
        </p>
      </div>

      {/* OAuth Button */}
      <div className="w-full">
        <OAuthButtons />
      </div>
    </div>
  );
}
