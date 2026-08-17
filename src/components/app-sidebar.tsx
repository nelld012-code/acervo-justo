import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Upload, Search, FolderOpen, ClipboardList, LogOut, Scale, Users, Wallet, UserCog, ConciergeBell, CalendarClock, ChevronDown, FileBarChart2 } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile, CARGO_LABELS, type Cargo } from "@/hooks/use-profile";
import { useEffect, useState } from "react";

const principal = { title: "Recepção", url: "/recepcao", icon: ConciergeBell };

const groups = [
  { title: "Principal", items: [
    { title: "Recepção", url: "/recepcao", icon: ConciergeBell, need: "all" },
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, need: "all" },
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, perms } = useProfile();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Principal: true, Gestão: true, Documentos: true, Relatórios: true });

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      groups.forEach((group) => { if (group.items.some((item) => pathname === item.url)) next[group.title] = true; });
      return next;
    });
  }, [pathname]);

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth", replace: true });
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
                <CollapsibleContent><SidebarMenu className="ml-2 border-l border-sidebar-border pl-2">{visible.map((item) => <SidebarMenuItem key={item.url}><SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}><Link to={item.url}><item.icon className="h-4 w-4" /><span>{item.title}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></CollapsibleContent>
              </SidebarMenuItem></Collapsible>;
          })}
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border"><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === "/perfil"} tooltip="Meu Perfil"><Link to="/perfil"><UserCog className="h-4 w-4" /><span>Meu Perfil</span></Link></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton onClick={handleLogout} tooltip="Sair"><LogOut className="h-4 w-4" /><span>Sair</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarFooter>
    </Sidebar>
  );
}
