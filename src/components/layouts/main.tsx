import { SidebarProvider } from '~/components/ui/sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarProvider>
      <div className="h-svh relative lg:p-2 w-full flex flex-col overflow-hidden">
        <div className="lg:border lg:rounded-md flex flex-col bg-background w-full h-full">
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}
