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
        <div className="flex min-w-0 flex-1 flex-col min-h-screen">
          <header className="flex min-h-14 items-center gap-2 border-b bg-card px-3 sm:px-4">
            <MobileMenuTrigger />
            <div className="min-w-0 flex flex-col justify-center">
              <h1 className="truncate text-base font-semibold leading-tight text-foreground md:text-lg lg:text-xl md:whitespace-nowrap">
                <span className="md:hidden">Gestão de Documentos Judiciais</span>
                <span className="hidden md:inline">J DIMAS GONÇALVES ESCRITORIO DE ADVOCACIA</span>
              </h1>
              <div className="hidden text-xs leading-tight text-muted-foreground md:block lg:text-sm">
                Sistema de Gestão de Documentos Judiciais
              </div>
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6">
            <Outlet />
          </main>
          <footer className="border-t bg-card px-4 py-3 text-center text-xs text-muted-foreground sm:text-sm">
            © 2026 Desenvolvido por: Michel Antonio Alvarado
          </footer>
        </div>
      </div>
      <PrazoReminders />
    </SidebarProvider>
  );
}
