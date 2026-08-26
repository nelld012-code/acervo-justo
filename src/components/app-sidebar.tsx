import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Upload, Search, FolderOpen, ClipboardList, Scale, Users, Wallet, ConciergeBell, CalendarClock, ChevronDown, FileBarChart2, MessagesSquare } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile, CARGO_LABELS, type Cargo } from "@/hooks/use-profile";
import { useEffect, useState } from "react";

const principal = { title: "Recepção", url: "/recepcao", icon: ConciergeBell };

const groups = [
  { title: "Principal", items: [
    { title: "Recepção", url: "/recepcao", icon: ConciergeBell, need: "all" },
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, need: "all" },
    { title: "Mensagens", url: "/mensagens", icon: MessagesSquare, need: "all" },
  ] },
  { title: "Gestão", items: [
    { title: "Clientes", url: "/clientes", icon: Users, need: "all" },
    { title: "Prazos", url: "/prazos", icon: CalendarClock, need: "all" },
    { title: "Financeiro", url: "/financeiro", icon: Wallet, need: "finance" },
  ] },
  { title: "Documentos", items: [
    { title: "Enviar Documento", url: "/upload", icon: Upload, need: "documents" },
    { title: "Buscar Documentos", url: "/search", icon: Search, need: "all" },
    { title: "Meus Documentos", url: "/my-documents", icon: FolderOpen, need: "all" },
  ] },
  { title: "Relatórios", items: [{ title: "Registro de Auditoria", url: "/audit", icon: ClipboardList, need: "audit" }] },
] as const;

function menuItemVisible(item: { need: string }, perms: { canAccessFinance: boolean; canManageDocuments: boolean; canViewAudit: boolean }) {
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Principal: true, Gestão: true, Documentos: true, Relatórios: true });

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
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <Scale className="h-5 w-5 shrink-0 text-sidebar-primary" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate font-semibold text-sidebar-foreground">J DIMAS GONÇALVES</span>
            <span className="block truncate text-xs text-sidebar-foreground/70">ESCRITORIO DE ADVOCACIA</span>
            <span className="mt-0.5 block truncate text-[11px] text-sidebar-foreground/60">Gestão Judicial</span>
            {profile && <span className="mt-1 block truncate text-[11px] text-sidebar-foreground/60">{(profile.nome || profile.email || "") + " · " + CARGO_LABELS[(profile.cargo as Cargo) ?? "assistente"]}</span>}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupLabel>Menu</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          {groups.map((group) => {
            const visible = group.items.filter((item) => menuItemVisible(item, perms));
            if (!visible.length) return null;
            const isActiveGroup = visible.some((item) => pathname === item.url);
            const open = openGroups[group.title] ?? isActiveGroup;
            return <Collapsible key={group.title} open={open} onOpenChange={(value) => setOpenGroups((current) => ({ ...current, [group.title]: value }))} asChild>
              <SidebarMenuItem><CollapsibleTrigger asChild><SidebarMenuButton tooltip={group.title} className="font-medium"><FileBarChart2 className="h-4 w-4" /><span>{group.title}</span><ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></SidebarMenuButton></CollapsibleTrigger>
                <CollapsibleContent><SidebarMenu className="ml-2 border-l border-sidebar-border pl-2">{visible.map((item) => <SidebarMenuItem key={item.url}><SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}><Link to={item.url} onClick={fecharMenuAoNavegar}><item.icon className="h-4 w-4" /><span>{item.title}</span>{item.url === "/mensagens" && naoLidas > 0 && <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold text-sidebar-primary-foreground">{naoLidas}</span>}</Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></CollapsibleContent>
              </SidebarMenuItem></Collapsible>;
          })}
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
