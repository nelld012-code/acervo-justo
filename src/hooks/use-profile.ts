import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Cargo = "administrador" | "advogado" | "secretaria" | "assistente";

export const CARGO_LABELS: Record<Cargo, string> = {
  administrador: "Administrador(a)",
  advogado: "Advogado(a)",
  secretaria: "Secretário(a)",
  assistente: "Assistente",
};

export const CARGO_OPTIONS = Object.entries(CARGO_LABELS).map(([value, label]) => ({
  value: value as Cargo,
  label,
}));

export type Permissions = {
  cargo: Cargo;
  isAdmin: boolean;
  isLeadership: boolean;
  canManageClients: boolean;
  canManageDocuments: boolean;
  canAccessFinance: boolean;
  canAssignTasks: boolean;
  canViewAudit: boolean;
};

export function permissionsFor(cargo: Cargo): Permissions {
  const isAdmin = cargo === "administrador";
  const isLeadership = isAdmin || cargo === "advogado";
  return {
    cargo,
    isAdmin,
    isLeadership,
    canManageClients: isLeadership || cargo === "secretaria",
    canManageDocuments: isLeadership || cargo === "secretaria",
    canAccessFinance: isLeadership,
    canAssignTasks: isLeadership,
    canViewAudit: isLeadership,
  };
}

export function useProfile() {
  const query = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, cargo, telefone")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const cargo = (query.data?.cargo ?? "assistente") as Cargo;
  return { ...query, profile: query.data ?? null, cargo, perms: permissionsFor(cargo) };
}
