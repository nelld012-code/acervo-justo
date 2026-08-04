import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Upload, Search, FolderOpen, ClipboardList, LogOut, Scale, Users, Wallet, UserCog } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile, CARGO_LABELS, type Cargo } from "@/hooks/use-profile";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, need: "all" },
  { title: "Clientes", url: "/clientes", icon: Users, need: "all" },
  { title: "Financeiro", url: "/financeiro", icon: Wallet, need: "finance" },
  { title: "Enviar Documento", url: "/upload", icon: Upload, need: "documents" },
  { title: "Buscar Documentos", url: "/search", icon: Search, need: "all" },
  { title: "Meus Documentos", url: "/my-documents", icon: FolderOpen, need: "all" },
  { title: "Registro de Auditoria", url: "/audit", icon: ClipboardList, need: "audit" },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, perms } = useProfile();

  const visibleItems = items.filter((item) => {
    if (item.need === "finance") return perms.canAccessFinance;
    if (item.need === "documents") return perms.canManageDocuments;
    if (item.need === "audit") return perms.canViewAudit;
    return true;
  });

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
          <Scale className="h-5 w-5 text-sidebar-primary" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate font-semibold text-sidebar-foreground">Gestão Judicial</span>
            {profile && (
              <span className="block truncate text-xs text-sidebar-foreground/70">
                {(profile.nome || profile.email || "") + " · " + CARGO_LABELS[(profile.cargo as Cargo) ?? "assistente"]}
              </span>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/perfil"} tooltip="Meu Perfil">
              <Link to="/perfil">
                <UserCog className="h-4 w-4" />
                <span>Meu Perfil</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Sair">
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}