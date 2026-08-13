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
  cliente_id?: string | null;
  valor_total_processo?: number | null;
  valor_recebido_total?: number | null;
};

export type Cliente = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string;
  endereco: string | null;
  observacoes: string | null;
  created_at: string;
  data_atendimento?: string | null;
  rg?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  reu_nome?: string | null;
  reu_rg_cnpj?: string | null;
  reu_estado_civil?: string | null;
  reu_profissao?: string | null;
  reu_endereco?: string | null;
  reu_bairro?: string | null;
  reu_cidade?: string | null;
  resumo_atendimento?: string | null;
  tipo_acao?: string | null;
  numero_processo?: string | null;
};

export const ESTADOS_CIVIS = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "União estável",
] as const;

export const METODOS_PAGAMENTO = [
  "PIX",
  "Transferência Bancária",
  "Dinheiro",
  "Cheque",
  "Cartão de Crédito",
] as const;

export const CATEGORIAS_DESPESA = [
  "Salários",
  "Insumos/Escritório",
  "Aluguel",
  "Marketing",
  "Impostos",
  "Outros",
] as const;

export type Expense = {
  id: string;
  user_id: string | null;
  descricao: string;
  categoria: string;
  valor: number;
  data_despesa: string;
  responsavel_pagamento: string | null;
  comprovante_url: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  document_id: string;
  valor: number;
  data_pagamento: string;
  responsavel_recebimento: string;
  metodo_pagamento: string;
  descricao: string | null;
  created_at: string;
};

export function sanitizePhone(phone: string) {
  return phone.replace(/\D+/g, "");
}

export function whatsappLink(phone: string) {
  const digits = sanitizePhone(phone);
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

export function formatBRL(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function sanitize(s: string) {
  return s.replace(/[^\w-]+/g, "_").replace(/_+/g, "_");
}

/** Rótulo seguro para processos sem número cadastrado. */
export const SEM_PROCESSO_LABEL = "Sem número de processo";

export function processoLabel(numero: string | null | undefined) {
  const v = (numero ?? "").trim();
  return v ? v : SEM_PROCESSO_LABEL;
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
  const cliente = sanitize((params.cliente ?? "").trim() || "sem_cliente");
  const rawProcesso = (params.numero_processo ?? "").trim();
  const processo = rawProcesso ? sanitize(rawProcesso) : "sem_processo";
  const folder = `${year}/${cliente}/${processo}`;
  const filename = `PROC_${processo}_${sanitize(params.tipo_documento)}_${dateCompact}.${params.originalExt}`;
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