import { ArrowRight, Sparkles, Zap, FolderTree } from 'lucide-react';
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Subtle background gradient */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20"
        aria-hidden="true"
      />
      
      {/* Decorative elements */}
      <div
        className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-brand/5 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-brand/5 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/3 blur-3xl"
        aria-hidden="true"
      />

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="flex min-h-screen flex-col items-center justify-center px-6 py-24 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-6xl">
            {/* Logo/Brand */}
            <div className="mb-20 flex items-center justify-center">
              <div className="group relative">
                <div
                  className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-brand/20 via-brand/30 to-brand/20 opacity-0 blur transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden="true"
                />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand/80 shadow-lg shadow-brand/20 transition-transform group-hover:scale-105">
                  <Sparkles className="h-8 w-8 text-brand-foreground" />
                </div>
              </div>
            </div>

            {/* Main Heading */}
            <div className="mb-16 text-center">
              <h1 className="heading-serif heading-xl mb-8 text-balance">
                <span className="bg-gradient-to-br from-foreground via-foreground/95 to-foreground/80 bg-clip-text text-transparent">
                  {siteConfig.name}
                </span>
              </h1>
              <p className="mx-auto max-w-3xl text-balance text-xl leading-relaxed text-muted-foreground sm:text-2xl lg:text-3xl">
                <span className="text-serif italic text-foreground/90">
                  Never lose a video again.
                </span>{' '}
                Find exactly what you're looking for in{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 font-semibold text-foreground">
                    seconds, not hours
                  </span>
                  <span
                    className="absolute -bottom-1 left-0 right-0 h-3 bg-gradient-to-r from-brand/20 via-brand/30 to-brand/20 blur-sm"
                    aria-hidden="true"
                  />
                </span>
              </p>
            </div>

            {/* Description */}
            <div className="mb-20 text-center">
              <p className="mx-auto max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
                You've liked hundreds—maybe thousands—of videos. That perfect
                tutorial, that song you loved, that recipe you wanted to try.{' '}
                <span className="font-medium text-foreground">
                  They're all buried in your likes, lost forever.
                </span>{' '}
                Until now. Ballroom uses AI to organize your YouTube likes into
                smart categories, so you can find what matters in an instant.
              </p>
            </div>

            {/* CTA Button */}
            <div className="mb-20 flex flex-col items-center gap-6">
              <Link
                href="/signin"
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'group relative overflow-hidden bg-brand px-10 py-6 text-lg font-semibold tracking-tight text-brand-foreground shadow-lg shadow-brand/20 transition-all duration-300 hover:scale-105 hover:bg-brand/90 hover:shadow-xl hover:shadow-brand/30'
                )}
              >
                <span className="relative z-10 flex items-center gap-2">
                  Organize My Videos
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </span>
                <span
                  className="absolute inset-0 -z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"
                  aria-hidden="true"
                />
              </Link>
              <p className="text-sm text-muted-foreground">
                Free to start. Connect with Google in seconds.
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={<Zap className="h-6 w-6" />}
                title="Instant Organization"
                description="AI understands context, not just keywords. Your cooking videos go to Cooking, your coding tutorials to Tech—automatically, accurately, instantly."
              />
              <FeatureCard
                icon={<FolderTree className="h-6 w-6" />}
                title="Your Categories, Your Way"
                description="Create categories that make sense to you. Music, Fitness, Design, whatever you need. AI learns your preferences and organizes accordingly."
              />
              <FeatureCard
                icon={<Sparkles className="h-6 w-6" />}
                title="Set It and Forget It"
                description="One sync, endless organization. New likes automatically find their place. No manual work, no maintenance—just results."
                className="sm:col-span-2 lg:col-span-1"
              />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative z-10 border-t border-border/50 bg-background/50 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8 lg:px-12">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} {siteConfig.name}. All rights
                reserved.
              </p>
              <div className="flex gap-6">
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Privacy
                </Link>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-8 backdrop-blur-sm transition-all duration-300 hover:border-border hover:bg-card hover:shadow-lg hover:shadow-brand/5',
        className
      )}
    >
      {/* Subtle gradient overlay on hover */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-brand/0 via-brand/0 to-brand/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      />
      
      <div className="relative z-10">
        <div
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand transition-all duration-300 group-hover:scale-110 group-hover:bg-brand/15"
          aria-hidden="true"
        >
          {icon}
        </div>
        <h3 className="mb-3 text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
