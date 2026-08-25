import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { PrazoReminders } from "@/components/prazo-reminders";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Menu, MessageSquare, X } from "lucide-react";
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

type NewMessage = {
  id: string;
  sender_id: string;
  body: string;
  attachment_name: string | null;
  attachment_type: string | null;
};

function NewMessagePopup() {
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<NewMessage | null>(null);
  const [senderName, setSenderName] = useState("Usuário");
  const [seenIds] = useState(() => new Set<string>());

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      setUserId(data.user.id);

      channel = supabase
        .channel(`new-message-popup-${data.user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${data.user.id}` },
          async (payload) => {
            const row = payload.new as NewMessage;
            if (!row.id || seenIds.has(row.id)) return;
            seenIds.add(row.id);
            setMessage(row);

            const { data: profile } = await supabase
              .from("profiles")
              .select("nome")
              .eq("id", row.sender_id)
              .maybeSingle();
            if (profile?.nome) setSenderName(profile.nome);
            else setSenderName("Usuário");
          },
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [seenIds]);

  if (!userId || !message) return null;

  const preview = message.body?.trim();
  const hasAttachment = !!message.attachment_name;

  function closeAndOpenMessages() {
    setMessage(null);
    window.location.assign("/mensagens");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/20 p-4 pt-6 sm:items-center sm:pt-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-message-title"
        className="w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p id="new-message-title" className="font-semibold">Nova mensagem</p>
              <p className="text-xs text-muted-foreground">Você recebeu uma mensagem interna</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={closeAndOpenMessages} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-sm font-semibold">De: {senderName}</p>
          {preview && <p className="max-h-24 overflow-hidden rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">{preview}</p>}
          {hasAttachment && (
            <p className="rounded-md border p-3 text-sm text-muted-foreground">
              📎 Anexo recebido: <span className="font-medium text-foreground">{message.attachment_name}</span>
            </p>
          )}
          {!preview && !hasAttachment && <p className="text-sm text-muted-foreground">Você recebeu uma nova mensagem.</p>}
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/20 px-4 py-3">
          <Button variant="outline" onClick={closeAndOpenMessages}>Fechar</Button>
          <Button onClick={closeAndOpenMessages}>Abrir mensagem</Button>
        </div>
      </div>
    </div>
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
      <NewMessagePopup />
    </SidebarProvider>
  );
}
