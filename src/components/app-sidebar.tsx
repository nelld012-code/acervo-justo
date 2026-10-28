import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Upload, Search, FolderOpen, ClipboardList, Scale, Users, Wallet, ConciergeBell, CalendarClock, ListTodo, ChevronDown, FileBarChart2, MessagesSquare, Gavel, FileText, Handshake } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile, CARGO_LABELS, type Cargo } from "@/hooks/use-profile";
import { useEffect, useState } from "react";

const principal = { title: "Recepção", url: "/recepcao", icon: ConciergeBell };

const groups = [
  { title: "Início", items: [
    { title: "Meu Painel", url: "/dashboard", icon: LayoutDashboard, need: "all" },
    { title: "Recepção", url: "/recepcao", icon: ConciergeBell, need: "all" },
    { title: "Mensagens", url: "/mensagens", icon: MessagesSquare, need: "all" },
  ] },
  { title: "Relacionamento", items: [
    { title: "CRM", url: "/crm", icon: Handshake, need: "crm" },
    { title: "Contatos", url: "/clientes", icon: Users, need: "all" },
    { title: "Distribuição", url: "/distribuicao", icon: FileText, need: "distribution" },
  ] },
  { title: "Agenda e tarefas", items: [
    { title: "Audiências", url: "/audiencias", icon: Gavel, need: "all" },
    { title: "Banco de tarefas", url: "/banco-tarefas", icon: ClipboardList, need: "all" },
    { title: "Prazos", url: "/prazos", icon: CalendarClock, need: "all" },
  ] },
  { title: "Gestão", items: [
    { title: "Financeiro", url: "/financeiro", icon: Wallet, need: "finance" },
  ] },
  { title: "Documentos", items: [
    { title: "Enviar Documento", url: "/upload", icon: Upload, need: "documents" },
    { title: "Buscar Documentos", url: "/search", icon: Search, need: "all" },
    { title: "Meus Documentos", url: "/my-documents", icon: FolderOpen, need: "all" },
  ] },
  { title: "Sistema", items: [
    { title: "Auditoria", url: "/audit", icon: ClipboardList, need: "audit" },
    { title: "Meu Perfil", url: "/perfil", icon: Scale, need: "all" },
  ] },
] as const;

function menuItemVisible(item: { need: string }, perms: { isAdmin: boolean; cargo: string; canAccessFinance: boolean; canManageDocuments: boolean; canViewAudit: boolean }) {
  if (item.need === "admin") return perms.isAdmin;
  if (item.need === "distribution") return perms.isAdmin;
  if (item.need === "crm") return ["administrador", "advogado", "secretaria", "assistente"].includes(perms.cargo);
  if (item.need === "finance") return perms.canAccessFinance;
  if (item.need === "documents") return perms.canManageDocuments;
  if (item.need === "audit") return perms.canViewAudit;
  return true;
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const queryClient = useQueryClient();
  const { profile, perms } = useProfile();
  const { isMobile, setOpenMobile } = useSidebar();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Início: true, Relacionamento: true, "Agenda e tarefas": true, Gestão: true, Documentos: true, Sistema: true });

  const naoLidasQuery = useQuery({
    queryKey: ["messages-unread-count"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const meuId = auth.user?.id;
      if (!meuId) return 0;
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", meuId)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });
  const naoLidas = naoLidasQuery.data ?? 0;

  useEffect(() => {
    const channel = supabase
      .channel("mensageria-sidebar")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages-unread-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      groups.forEach((group) => { if (group.items.some((item) => pathname === item.url)) next[group.title] = true; });
      return next;
    });
  }, [pathname]);

  function fecharMenuAoNavegar() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-800/80 shadow-xl">
      <SidebarHeader className="h-[88px] border-b border-slate-800/80 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="flex h-full items-center gap-3 px-2 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sky-300 shadow-inner shadow-sky-900/30">
            <Scale className="h-5 w-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-[13px] font-bold tracking-[0.12em] text-white">ACERVO JUSTO</span>
            <span className="mt-0.5 block truncate text-xs font-medium text-sky-200/90">Gestão Judicial</span>
            <span className="mt-1 block truncate text-[10px] text-slate-400">J Dimas Gonçalves</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-2 py-3">
        <SidebarGroup className="p-0"><SidebarGroupLabel className="px-3 pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/40">Navegação</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1">
          {groups.map((group) => {
            const visible = group.items.filter((item) => menuItemVisible(item, perms));
            if (!visible.length) return null;
            const isActiveGroup = visible.some((item) => pathname === item.url);
            const open = openGroups[group.title] ?? isActiveGroup;
            return <Collapsible key={group.title} open={open} onOpenChange={(value) => setOpenGroups((current) => ({ ...current, [group.title]: value }))} asChild>
              <SidebarMenuItem><CollapsibleTrigger asChild><SidebarMenuButton tooltip={group.title} className="h-9 rounded-lg px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/60 hover:bg-slate-800/60 hover:text-slate-100"><FileBarChart2 className="h-4 w-4" /><span>{group.title}</span><ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></SidebarMenuButton></CollapsibleTrigger>
                <CollapsibleContent><SidebarMenu className="ml-2 gap-1 border-l border-slate-700/70 pl-2">{visible.map((item) => <SidebarMenuItem key={item.url}><SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title} className="h-10 rounded-lg px-3 text-[13px] transition-colors hover:bg-slate-800/70 data-[active=true]:bg-sky-500/15 data-[active=true]:font-semibold data-[active=true]:text-sky-300"><Link to={item.url} onClick={fecharMenuAoNavegar}><item.icon className="h-4 w-4" /><span>{item.title}</span>{item.url === "/mensagens" && naoLidas > 0 && <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold text-sidebar-primary-foreground">{naoLidas}</span>}</Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></CollapsibleContent>
              </SidebarMenuItem></Collapsible>;
          })}
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
