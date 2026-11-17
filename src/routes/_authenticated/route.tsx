import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { PrazoReminders } from "@/components/prazo-reminders";
import { AudienciaReminder } from "@/routes/_authenticated/audiencias";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Menu, MessageSquare, X, UserCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfile, CARGO_LABELS } from "@/hooks/use-profile";
import { toast } from "sonner";
import { isSystemOwner, shouldBlockSystemAccess } from "@/lib/system-access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase.from("profiles").select("cargo").eq("id", data.user.id).maybeSingle();
    const { data: access, error: accessError } = await supabase
      .from("system_settings")
      .select("is_active")
      .eq("id", "global")
      .maybeSingle();
    if (shouldBlockSystemAccess({ userId: data.user.id, isActive: access?.is_active, accessError: !!accessError })) {
      throw redirect({ to: "/bloqueio" });
    }
    if (profile?.cargo === "secretaria") {
      const allowed = ["/dashboard", "/recepcao", "/mensagens", "/clientes", "/assistentes-juridicos", "/crm", "/financeiro"];
      if (!allowed.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))) {
        throw redirect({ to: "/dashboard" });
      }
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function MobileMenuTrigger() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Abrir menu" className="h-9 w-9 shrink-0 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300">
      <Menu className="h-6 w-6" />
    </Button>
  );
}

type NewMessage = { id: string; sender_id: string; body: string; attachment_name: string | null; attachment_type: string | null };

function NewMessagePopup() {
  const navigate = useNavigate();
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
      channel = supabase.channel(`new-message-popup-${data.user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${data.user.id}` }, async (payload) => {
        const row = payload.new as NewMessage;
        if (!row.id || seenIds.has(row.id)) return;
        seenIds.add(row.id);
        setMessage(row);
        const { data: profile } = await supabase.from("profiles").select("nome").eq("id", row.sender_id).maybeSingle();
        if (profile?.nome) setSenderName(profile.nome); else setSenderName("Usuário");
      }).subscribe();
    });
    return () => { active = false; if (channel) supabase.removeChannel(channel); };
  }, [seenIds]);

  if (!userId || !message || typeof document === "undefined") return null;
  const preview = message.body?.trim();
  const hasAttachment = !!message.attachment_name;
  function closeAndOpenMessages() { setMessage(null); navigate({ to: "/mensagens" }); }

  const popup = (
    <div className="pointer-events-auto fixed inset-0 z-[10000] flex items-start justify-center bg-black/20 p-4 pt-6 sm:items-center sm:pt-4" role="presentation" onClick={(e) => e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-labelledby="new-message-title" className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2"><div className="rounded-full bg-primary/10 p-2 text-primary"><MessageSquare className="h-4 w-4" /></div><div><p id="new-message-title" className="font-semibold">Nova mensagem</p><p className="text-xs text-muted-foreground">Você recebeu uma mensagem interna</p></div></div>
          <Button type="button" variant="ghost" size="icon" onClick={closeAndOpenMessages} aria-label="Fechar"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm font-semibold">De: {senderName}</p>
          {preview && <p className="max-h-24 overflow-hidden rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">{preview}</p>}
          {hasAttachment && <p className="rounded-md border p-3 text-sm text-muted-foreground">📎 Anexo recebido: <span className="font-medium text-foreground">{message.attachment_name}</span></p>}
          {!preview && !hasAttachment && <p className="text-sm text-muted-foreground">Você recebeu uma nova mensagem.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t bg-muted/20 px-4 py-3"><Button type="button" variant="outline" onClick={closeAndOpenMessages}>Fechar</Button><Button type="button" onClick={closeAndOpenMessages}>Abrir mensagem</Button></div>
      </div>
    </div>
  );
  return createPortal(popup, document.body);
}

function HeaderActions() {
  const { profile, cargo } = useProfile();
  const [isOwner, setIsOwner] = useState(false);
  const [systemActive, setSystemActive] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsOwner(isSystemOwner(data.user?.id)));
    let active = true;
    supabase.from("system_settings").select("is_active").eq("id", "global").maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          toast.error("Não foi possível consultar o bloqueio do sistema.");
          setSystemActive(null);
        } else {
          setSystemActive(data?.is_active !== false);
        }
      });
    return () => { active = false; };
  }, []);

  async function toggleSystemAccess() {
    if (!isOwner || systemActive === null) return;
    const next = !systemActive;
    if (!next && !window.confirm("Bloquear o acesso de todos os usuários, mantendo somente sua conta de administrador?")) return;
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("system_settings").update({ is_active: next, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null }).eq("id", "global");
    if (error) {
      toast.error("Não foi possível alterar o acesso.", { description: error.message });
      return;
    }
    setSystemActive(next);
    toast.success(next ? "Sistema reativado para todos." : "Sistema bloqueado para todos, exceto sua conta.");
  }

  async function sair() { await supabase.auth.signOut(); window.location.assign("/auth"); }
  const nome = profile?.nome?.trim() || "Usuário";
  const cargoLabel = CARGO_LABELS[cargo] ?? cargo;
  return (
    <div className="ml-auto flex shrink-0 flex-col items-end">
      <div className="flex items-center gap-1 sm:gap-2">
        {isOwner && systemActive !== null && <Button variant={systemActive ? "outline" : "default"} size="sm" onClick={() => void toggleSystemAccess()} className="h-9 px-2 text-xs sm:px-3">
          {systemActive ? "Bloquear acesso" : "Reativar sistema"}
        </Button>}
        {cargo !== "secretaria" && <Link to="/perfil" className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:px-3" title="Perfil" aria-label="Abrir perfil">
          <UserCircle className="h-4 w-4" /><span>Perfil</span>
        </Link>}
        <Button variant="ghost" size="sm" onClick={() => void sair()} className="h-9 gap-1.5 px-2 text-sm font-medium text-foreground hover:bg-muted sm:px-3" title="Sair" aria-label="Sair do sistema">
          <LogOut className="h-4 w-4" /><span>Sair</span>
        </Button>
      </div>
      <div className="max-w-[16rem] truncate text-right text-[11px] leading-tight text-muted-foreground sm:max-w-[20rem] sm:text-xs" title={`${nome} · ${cargoLabel}`}>
        <span className="font-medium text-foreground/80">{nome}</span>
        <span className="mx-1">·</span>
        <span>{cargoLabel}</span>
      </div>
    </div>
  );
}

function SystemAccessWatcher() {
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const start = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!active || auth.user?.id === SYSTEM_OWNER_ID) return;
      const checkAccess = async () => {
        const { data, error } = await supabase
          .from("system_settings")
          .select("is_active")
          .eq("id", "global")
          .maybeSingle();
        if (active && !error && data?.is_active === false) {
          window.location.assign("/bloqueio");
        }
      };
      await checkAccess();
      timer = window.setInterval(() => void checkAccess(), 15000);
    };
    void start();
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, []);
  return null;
}

function AuthenticatedLayout() {
  return <SidebarProvider><div className="flex min-h-screen w-full overflow-x-hidden bg-background"><SystemAccessWatcher /><AppSidebar /><div className="flex min-h-screen min-w-0 flex-1 flex-col"><header className="flex h-14 items-center gap-2 border-b bg-card px-3 sm:px-4"><MobileMenuTrigger /><div className="min-w-0 flex flex-1 items-center"><div className="min-w-0 leading-tight"><p className="truncate text-sm font-semibold text-foreground sm:text-base">J DIMAS GONÇALVES&nbsp;&nbsp; ESCRITORIO DE ADVOCACIA</p><p className="truncate text-xs text-muted-foreground sm:text-sm">Sistema Gestão Judicial</p></div></div><HeaderActions /></header><main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6"><Outlet /></main><footer className="border-t bg-card px-4 py-3 text-center text-xs text-muted-foreground sm:text-sm">© 2026 Desenvolvido por: Michel Antonio Alvarado</footer></div></div><PrazoReminders /><AudienciaReminder /><NewMessagePopup /></SidebarProvider>;
}
