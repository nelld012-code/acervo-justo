import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { PrazoReminders } from "@/components/prazo-reminders";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function MobileMenuTrigger() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      aria-label="Abrir menu"
      className="shrink-0 h-9 w-9 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
    >
      <Menu className="h-6 w-6" />
    </Button>
  );
}

function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2 border-b bg-card px-3 sm:px-4">
            <MobileMenuTrigger />
            <h1 className="truncate text-sm font-semibold text-foreground">Gestão de Documentos Judiciais</h1>
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <PrazoReminders />
    </SidebarProvider>
  );
}