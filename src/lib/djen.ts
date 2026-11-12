// Mapeamento e deduplicação de comunicações DJEN (CNJ). Sem cálculo de vencimentos.
import { z } from "zod";
export const DJEN_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
export const DJEN_OAB = { numeroOab: "37610", ufOab: "MG" } as const;

export type DjenItem = Record<string, unknown>;
export type IntimacaoRow = {
  hash: string; djen_id: number | null; numero_processo: string | null; sigla_tribunal: string | null;
  orgao: string | null; tipo_comunicacao: string | null; tipo_documento: string | null; meio: string | null;
  data_disponibilizacao: string | null; link: string | null; destinatarios: unknown; advogados: unknown;
  texto: string; payload: DjenItem;
};

const s = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
export const normalizarTexto = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identidade estável: id do CNJ quando existe; senão processo + data + texto normalizado. */
export async function hashComunicacao(i: DjenItem) {
  const id = s(i.id);
  if (id) return sha256(`djen:${id}`);
  return sha256(`p:${s(i.numeroprocessocommascara) ?? s(i.numero_processo) ?? ""}|d:${s(i.data_disponibilizacao) ?? ""}|t:${normalizarTexto(String(i.texto ?? ""))}`);
}

export async function mapearComunicacao(i: DjenItem): Promise<IntimacaoRow> {
  const id = Number(i.id);
  return {
    hash: await hashComunicacao(i),
    djen_id: Number.isFinite(id) ? id : null,
    numero_processo: s(i.numeroprocessocommascara) ?? s(i.numero_processo),
    sigla_tribunal: s(i.siglaTribunal),
    orgao: s(i.nomeOrgao),
    tipo_comunicacao: s(i.tipoComunicacao),
    tipo_documento: s(i.tipoDocumento),
    meio: s(i.meiocompleto) ?? s(i.meio),
    data_disponibilizacao: s(i.data_disponibilizacao)?.slice(0, 10) ?? null,
    link: s(i.link),
    destinatarios: i.destinatarios ?? null,
    advogados: i.destinatarioadvogados ?? null,
    texto: String(i.texto ?? ""),
    payload: i,
  };
}

/** Remove repetições internas da própria resposta. */
export async function deduplicar(itens: DjenItem[]) {
  const vistos = new Set<string>(); const out: IntimacaoRow[] = [];
  for (const it of itens) { const r = await mapearComunicacao(it); if (!vistos.has(r.hash)) { vistos.add(r.hash); out.push(r); } }
  return out;
}

// ---------- Recebimento /api/public/djen-sync ----------

export const SyncPayloadSchema = z.object({
  items: z.array(z.record(z.unknown())).max(5000),
  total: z.number().int().nonnegative(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  origem: z.string().max(80).optional(),
  coletadoEm: z.string().max(40).optional(),
});
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

/** Comparação em tempo constante; sem segredo configurado, nunca autoriza. */
export function segredoValido(secret: string | undefined, got: string | null) {
  if (!secret || !got || got.length !== secret.length) return false;
  let diff = 0; for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** Observação do rascunho: só dados da própria comunicação, sem inventar parte/prazo. */
export function observacaoRascunho(r: IntimacaoRow) {
  const resumo = normalizarTexto(r.texto).slice(0, 280);
  return [`Pendente de revisão — gerado da intimação DJEN de ${r.data_disponibilizacao ?? "data não informada"}`, r.orgao, r.link, resumo ? `Trecho: ${resumo}` : null]
    .filter(Boolean).join(" • ");
}

/** Rascunho de prazo para uma comunicação nova (espelha djen_ingest no banco). */
export function rascunhoPrazo(r: IntimacaoRow) {
  return {
    nome: `DJEN · ${r.tipo_comunicacao ?? "Comunicação"} · ${r.sigla_tribunal ?? "—"}`,
    numero_processo: r.numero_processo, parte: "", advogado: null, data_limite: null,
    observacao: observacaoRascunho(r), lembrete_ativo: false, repetir_alerta_diariamente: false,
    status: "Em andamento", djen_hash: r.hash, revisao_pendente: true, dedupe_key: `djen:${r.hash}`,
  };
}

/** Confirmação humana: sempre atualiza o rascunho vinculado; nunca cria outro prazo. */
export function planoConfirmacao(intimacao: { prazo_id: string | null }, dataLimite: string | null) {
  if (!dataLimite) throw new Error("Informe a data limite revisada.");
  if (!intimacao.prazo_id) throw new Error("Rascunho de prazo vinculado não encontrado.");
  return { acao: "atualizar" as const, prazo_id: intimacao.prazo_id };
}

export type Ingest = (rows: (Omit<IntimacaoRow, never> & { observacao: string })[], p: SyncPayload) => Promise<{ inseridos: number; rascunhos: number }>;

/** Lógica completa do endpoint, isolada para testes. */
export async function processarSync(opts: { secret: string | undefined; header: string | null; body: unknown; dryRun: boolean; ingest: Ingest }) {
  if (!segredoValido(opts.secret, opts.header)) return { status: 401, body: { error: "Unauthorized" } };
  const parsed = SyncPayloadSchema.safeParse(opts.body);
  if (!parsed.success) return { status: 400, body: { error: "Payload inválido", issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".") + ": " + i.message) } };
  const p = parsed.data;
  if (p.items.length !== p.total) return { status: 422, body: { error: "Paginação incompleta; nada foi gravado", total: p.total, recebidos: p.items.length } };
  const rows = (await deduplicar(p.items)).map((r) => ({ ...r, observacao: observacaoRascunho(r) }));
  if (opts.dryRun) return { status: 200, body: { dryRun: true, recebidos: p.items.length, unicos: rows.length, bancoAlterado: false } };
  const res = await opts.ingest(rows, p);
  return { status: 200, body: { recebidos: p.items.length, unicos: rows.length, ...res } };
}
