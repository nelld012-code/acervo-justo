// Mapeamento e deduplicação de comunicações DJEN (CNJ). Sem cálculo de vencimentos.
export const DJEN_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
export const DJEN_OAB = { numeroOab: "37610", ufOab: "MG" } as const;

export type DjenItem = Record<string, unknown>;
export type IntimacaoRow = {
  hash: string;
  djen_id: string | null;
  numero_processo: string | null;
  sigla_tribunal: string | null;
  orgao: string | null;
  tipo_comunicacao: string | null;
  tipo_documento: string | null;
  meio: string | null;
  data_disponibilizacao: string | null;
  link: string | null;
  destinatarios: unknown;
  advogados: unknown;
  texto: string;
  payload: DjenItem;
};

const first = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
};

const stringOrNull = (...values: unknown[]) => {
  const value = first(...values);
  return value === null ? null : String(value).trim();
};

export const normalizarTexto = (text: string) =>
  text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

export async function sha256(text: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Prioriza o hash nativo do CNJ; usa o id e, por último, campos normalizados. */
export async function hashComunicacao(item: DjenItem) {
  const cnjHash = stringOrNull(item.hash);
  if (cnjHash) return cnjHash;

  const id = stringOrNull(item.id);
  if (id) return sha256(`djen:${id}`);

  const processo = stringOrNull(
    item.numeroprocessocommascara,
    item.numero_processo,
    item.numeroProcesso,
  ) ?? "";
  const data = stringOrNull(
    item.data_disponibilizacao,
    item.datadisponibilizacao,
    item.dataDisponibilizacao,
  ) ?? "";
  const texto = normalizarTexto(String(item.texto ?? ""));
  return sha256(`p:${processo}|d:${data}|t:${texto}`);
}

export async function mapearComunicacao(item: DjenItem): Promise<IntimacaoRow> {
  const dataDisponibilizacao = stringOrNull(
    item.data_disponibilizacao,
    item.datadisponibilizacao,
    item.dataDisponibilizacao,
  );

  return {
    hash: await hashComunicacao(item),
    djen_id: stringOrNull(item.id),
    numero_processo: stringOrNull(
      item.numeroprocessocommascara,
      item.numero_processo,
      item.numeroProcesso,
    ),
    sigla_tribunal: stringOrNull(item.siglaTribunal, item.sigla_tribunal),
    orgao: stringOrNull(item.nomeOrgao, item.nome_orgao),
    tipo_comunicacao: stringOrNull(item.tipoComunicacao, item.tipo_comunicacao),
    tipo_documento: stringOrNull(item.tipoDocumento, item.tipo_documento),
    meio: stringOrNull(item.meiocompleto, item.meio, item.meiocompleto),
    data_disponibilizacao: dataDisponibilizacao?.slice(0, 10) ?? null,
    link: stringOrNull(item.link),
    destinatarios: first(item.destinatarios, item.destinatario),
    advogados: first(item.destinatarioadvogados, item.advogados),
    texto: String(item.texto ?? ""),
    payload: item,
  };
}

/** Remove repetições internas da resposta e mantém a ordem recebida do CNJ. */
export async function deduplicar(itens: DjenItem[]) {
  const vistos = new Set<string>();
  const resultado: IntimacaoRow[] = [];

  for (const item of itens) {
    const row = await mapearComunicacao(item);
    if (!vistos.has(row.hash)) {
      vistos.add(row.hash);
      resultado.push(row);
    }
  }

  return resultado;
}
