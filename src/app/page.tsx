import { Youtube } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonVariants } from '~/components/ui/button';
import { getSession } from '~/lib/auth/session';
import { siteConfig } from '~/lib/site';
import { cn } from '~/lib/utils';

export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-background">
      <main className="relative z-10 flex w-full max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand shadow-lg shadow-brand/30">
          <Youtube className="h-10 w-10 text-brand-foreground" />
        </div>

        <div className="mb-12">
          <h1 className="heading-xl mb-6 text-balance text-foreground">
            {siteConfig.name}
          </h1>
          <p className="text-balance text-xl text-muted-foreground sm:text-2xl lg:text-3xl">
            <span className="text-emphasis">AI-powered</span> organization for
            your <span className="text-highlight">YouTube liked videos</span>
          </p>
        </div>

        <div className="mb-12 max-w-2xl">
          <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
            Stop scrolling through hundreds of liked videos.{' '}
            <span className="font-semibold text-foreground">
              Let AI automatically categorize them
            </span>{' '}
            into custom categories like Music, Tech, Gaming, and more. Find what
            you want, when you want it.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/signin"
            className={cn(
              buttonVariants({ variant: 'link', size: 'lg' }),
              'group bg-brand px-8 py-4 text-lg font-semibold tracking-tight text-brand-foreground shadow-lg shadow-brand/20 transition-all hover:bg-brand/90 hover:shadow-xl hover:shadow-brand/30'
            )}
          >
            Get Started with Google
            <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Sign in with your Google account to access your YouTube liked videos
        </p>
      </main>
    </div>
  );
}
