import { Youtube } from 'lucide-react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OAuthButtons } from '~/app/(auth)/signin/oauth-buttons';
import { auth } from '~/lib/auth/server';

export default async function AuthenticationPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
      <div className="flex flex-col items-center space-y-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-600 shadow-lg">
          <Youtube className="h-7 w-7 text-white" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Liked Videos Sorter
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with Google to access and organize your YouTube liked videos
          </p>
        </div>
      </div>
      <div className="grid gap-4">
        <OAuthButtons />
        <p className="text-center text-xs text-muted-foreground">
          We&apos;ll request access to view your YouTube liked videos.
          <br />
          Your data stays private and is never shared.
        </p>
      </div>
    </div>
  );
}
