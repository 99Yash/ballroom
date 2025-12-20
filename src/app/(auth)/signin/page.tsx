import { X } from 'lucide-react';
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
    <div className="mx-auto flex w-full max-w-md flex-col items-center space-y-8">
      {/* Logo */}
      <div className="flex flex-col items-center space-y-6">
        <X className="h-8 w-8 text-foreground" strokeWidth={3} />
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome to {siteConfig.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Login or create an account
          </p>
        </div>
      </div>

      {/* OAuth Buttons */}
      <div className="w-full space-y-6">
        <OAuthButtons />

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-muted-foreground">OR</span>
          </div>
        </div>

        {/* Email placeholder (disabled) */}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Your email address"
            disabled
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            disabled
            className="w-full rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Email login coming soon. Please use Google to continue.
          </p>
        </div>
      </div>
    </div>
  );
}
