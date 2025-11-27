import { CommandIcon } from 'lucide-react';
import Link from 'next/link';
import { siteConfig } from '~/lib/site';

export default function AuthLayout(props: { children: React.ReactNode }) {
  return (
    <>
      <div className="relative grid min-h-full grid-cols-1 md:grid-cols-3 lg:grid-cols-2">
        <div className="relative overflow-hidden lg:rounded-tl-md lg:rounded-bl-md">
          <div
            className="absolute inset-0 bg-cover"
            style={{
              backgroundImage:
                'url(https://images.unsplash.com/photo-1584351583369-6baf055b51a7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1854&q=80)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-background/60 md:to-background/40" />
          <Link
            href="/"
            className="absolute left-8 top-8 z-20 flex items-center text-lg font-bold tracking-tight"
          >
            <CommandIcon className="mr-2 h-6 w-6" />
            <span>{siteConfig.name}</span>
          </Link>
        </div>

        <div className="container flex items-center justify-center md:static md:col-span-2 lg:col-span-1 min-h-full py-4">
          {props.children}
        </div>
      </div>
    </>
  );
}
