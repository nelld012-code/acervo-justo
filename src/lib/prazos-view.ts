export type Prazo = {
  id: string;
  nome: string;
  numero_processo: string | null;
  parte: string;
  advogado: string | null;
  data_limite: string;
  observacao: string | null;
  lembrete_ativo: boolean;
  antecedencia_dias: number;
  repetir_alerta_diariamente: boolean;
  status: string;
  data_conclusao: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PARTES = ["Parte Autora", "Parte Ré"] as const;
export const STATUS_PRAZO = ["Em andamento", "Concluído"] as const;

export const ANTECEDENCIA_DIAS_OPTIONS = [6, 5, 4, 3, 2, 1].map((d) => ({
  value: d,
  label: `${d} ${d === 1 ? "dia antes" : "dias antes"}`,
}));

export type Situacao = "normal" | "atencao" | "critico" | "hoje" | "vencido" | "concluido";

export const SITUACAO_LABEL: Record<Situacao, string> = {
  normal: "Normal",
  atencao: "Atenção",
  critico: "Crítico",
  hoje: "Vence Hoje",
  vencido: "Prazo Vencido",
  concluido: "Concluído",
};

export const SITUACAO_CLASS: Record<Situacao, string> = {
  normal: "border-emerald-500/40 text-emerald-400",
  atencao: "border-amber-500/40 text-amber-400",
  critico: "border-red-500/40 text-red-400",
  hoje: "border-red-500/60 text-red-300",
  vencido: "border-red-600/70 text-red-300",
  concluido: "border-slate-500/40 text-slate-300",
};

/** Dias restantes calculados dinamicamente (nunca persistidos). */
export function diasRestantes(dataLimite: string, hoje = new Date()) {
  const [y, m, d] = dataLimite.split("-").map(Number);
  const limite = new Date(y, (m ?? 1) - 1, d ?? 1);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((limite.getTime() - base.getTime()) / 86400000);
}

export function situacaoDoPrazo(p: Prazo, hoje = new Date()): Situacao {
  if (p.status === "Concluído") return "concluido";
  const dias = diasRestantes(p.data_limite, hoje);
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoje";
  if (dias <= 3) return "critico";
  if (dias <= 6) return "atencao";
  return "normal";
}

export function textoDiasRestantes(dias: number) {
  if (dias < 0) return `Vencido há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`;
  if (dias === 0) return "Vence hoje";
  return `Faltam ${dias} ${dias === 1 ? "dia" : "dias"} para o prazo.`;
}

/** Um prazo está em alerta quando o lembrete está ativo e já entrou na janela de antecedência. */
export function prazoEmAlerta(p: Prazo, hoje = new Date()) {
  if (!p.lembrete_ativo || p.status === "Concluído") return false;
  const dias = diasRestantes(p.data_limite, hoje);
  if (dias > p.antecedencia_dias) return false;
  if (dias < 0) return p.repetir_alerta_diariamente;
  if (dias < p.antecedencia_dias && !p.repetir_alerta_diariamente) {
    // Sem repetição diária, o alerta vale apenas a partir da data de antecedência.
    return true;
  }
  return true;
}

export function processoOuTraco(numero: string | null | undefined) {
  const v = (numero ?? "").trim();
  return v ? v : "Sem número de processo";
}
