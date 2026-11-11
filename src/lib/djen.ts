// Mapeamento e deduplicação de comunicações DJEN (CNJ). Sem cálculo de vencimentos.
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
