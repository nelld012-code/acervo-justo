import { supabase } from "@/integrations/supabase/client";

export const TIPOS_DOCUMENTO = [
  "Petição Inicial",
  "Contestação",
  "Procuração",
  "Contrato",
  "Sentença",
  "Ofício",
  "Comprovante",
] as const;

export const MATERIAS = [
  "Civil",
  "Penal",
  "Trabalhista",
  "Família",
  "Administrativo",
] as const;

export const ESTADOS = ["Aberto", "Em revisão", "Arquivado", "Encerrado"] as const;
export const CONFIDENCIALIDADES = ["Público", "Restrito", "Confidencial"] as const;

export type Documento = {
  id: string;
  internal_id: string;
  advogado: string;
  numero_processo: string;
  data_documento: string;
  data_ingresso: string;
  data_processo: string | null;
  tipo_documento: string;
  cliente: string;
  parte_autora: string | null;
  parte_re: string | null;
  orgao_judicial: string | null;
  materia: string;
  estado_processual: string;
  confidencialidade: string;
  palavras_chave: string[] | null;
  file_url: string;
  file_name: string;
  file_size: number | null;
  current_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function sanitize(s: string) {
  return s.replace(/[^\w-]+/g, "_").replace(/_+/g, "_");
}

export function buildStoragePath(params: {
  cliente: string;
  numero_processo: string;
  tipo_documento: string;
  data_documento: string;
  originalExt: string;
}) {
  const year = new Date().getFullYear();
  const dateCompact = params.data_documento.replaceAll("-", "");
  const folder = `${year}/${sanitize(params.cliente)}/${sanitize(params.numero_processo)}`;
  const filename = `PROC_${sanitize(params.numero_processo)}_${sanitize(params.tipo_documento)}_${dateCompact}.${params.originalExt}`;
  return `${folder}/${filename}`;
}

export async function logAudit(
  documentId: string | null,
  action: "viewed" | "uploaded" | "edited" | "deleted" | "downloaded",
  details?: Record<string, unknown>,
) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("audit_logs").insert({
    user_id: data.user.id,
    document_id: documentId,
    action,
    details: (details ?? null) as never,
  });
}

export async function getSignedUrl(fileUrl: string) {
  const { data, error } = await supabase.storage
    .from("legal_docs")
    .createSignedUrl(fileUrl, 300);
  if (error) throw error;
  return data.signedUrl;
}

export function formatFileSize(sizeKb: number | null) {
  if (!sizeKb) return "—";
  if (sizeKb < 1024) return `${sizeKb} KB`;
  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

export function badgeVariantForStatus(status: string) {
  switch (status) {
    case "Aberto":
      return "default";
    case "Em revisão":
      return "secondary";
    case "Arquivado":
      return "outline";
    case "Encerrado":
      return "destructive";
    default:
      return "outline";
  }
}