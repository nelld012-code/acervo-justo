type ExcelCell = string | number | null;

export type ImportPrazoRow = {
  nome: string;
  numero_processo: string | null;
  parte: string;
  advogado: string | null;
  data_limite: string;
  status: string;
  observacao: string | null;
  data_conclusao: string | null;
  data_publicacao: string | null;
  data_inicio_manifestacao: string | null;
  data_fim_manifestacao: string | null;
  cumprido: boolean | null;
};

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number };

function u16(view: DataView, offset: number) { return view.getUint16(offset, true); }
function u32(view: DataView, offset: number) { return view.getUint32(offset, true); }

function normalizeHeader(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function excelSerialToIso(value: number) {
  if (!Number.isFinite(value)) return "";
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
  return utc.toISOString().slice(0, 10);
}

function normalizeDate(value: ExcelCell) {
  if (value === null || value === "") return null;
  if (typeof value === "number") return excelSerialToIso(value);
  const text = String(value).trim();
  if (!text) return null;
  const br = text.match(/^(\d{1,2})[\\/.\-](\d{1,2})[\\/.\-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

function normalizeBoolean(value: ExcelCell): boolean | null {
  if (value === null || value === "") return null;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (["sim", "s", "yes", "y", "true", "1", "cumprido"].includes(text)) return true;
  if (["nao", "n", "no", "false", "0", "pendente", "nao cumprido"].includes(text)) return false;
  return null;
}

function cellValue(cell: Element, sharedStrings: string[]): ExcelCell {
  const type = cell.getAttribute("t");
  const value = cell.querySelector("v")?.textContent ?? "";
  if (type === "inlineStr") return cell.querySelector("is")?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1" ? 1 : 0;
  if (value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

async function inflateRaw(data: Uint8Array) {
  if (typeof DecompressionStream === "undefined") throw new Error("Este navegador não suporta a leitura direta de arquivos Excel.");
  const stream = new Blob([data.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Arquivo Excel inválido ou corrompido.");

  const count = u16(view, eocd + 10);
  const centralOffset = u32(view, eocd + 16);
  let cursor = centralOffset;
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (u32(view, cursor) !== 0x02014b50) throw new Error("Estrutura ZIP do Excel inválida.");
    const method = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const localOffset = u32(view, cursor + 42);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    entries.push({ name, method, compressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const result = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const local = entry.localOffset;
    if (u32(view, local) !== 0x04034b50) continue;
    const nameLength = u16(view, local + 26);
    const extraLength = u16(view, local + 28);
    const start = local + 30 + nameLength + extraLength;
    const compressed = bytes.slice(start, start + entry.compressedSize);
    result.set(entry.name, entry.method === 0 ? compressed : await inflateRaw(compressed));
  }
  return result;
}

function parseXml(bytes: Uint8Array) {
  return new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
}

function findEntry(entries: Map<string, Uint8Array>, name: string) {
  const bytes = entries.get(name);
  if (!bytes) throw new Error(`Arquivo interno do Excel não encontrado: ${name}`);
  return bytes;
}

export async function parsePrazosExcel(file: File): Promise<ImportPrazoRow[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Selecione um arquivo Excel no formato .xlsx.");

  const entries = await unzip(await file.arrayBuffer());
  const workbook = parseXml(findEntry(entries, "xl/workbook.xml"));
  const rels = parseXml(findEntry(entries, "xl/_rels/workbook.xml.rels"));
  const relation = workbook.querySelector("sheet")?.getAttribute("r:id");
  if (!relation) throw new Error("Não foi possível localizar a planilha do Excel.");

  const relationNode = Array.from(rels.getElementsByTagName("Relationship")).find((node) => node.getAttribute("Id") === relation);
  const target = relationNode?.getAttribute("Target");
  if (!target) throw new Error("Não foi possível localizar a primeira aba do Excel.");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\/?xl\//, "")}`;

  const sharedStrings = entries.has("xl/sharedStrings.xml")
    ? Array.from(parseXml(entries.get("xl/sharedStrings.xml")!).getElementsByTagName("si")).map((si) => si.textContent ?? "")
    : [];

  const sheet = parseXml(findEntry(entries, sheetPath));
  const rows = Array.from(sheet.getElementsByTagName("row")).map((row) => {
    const cells = new Map<number, ExcelCell>();
    Array.from(row.getElementsByTagName("c")).forEach((cell) => {
      const ref = cell.getAttribute("r") ?? "";
      const letters = ref.match(/^[A-Z]+/)?.[0] ?? "";
      let column = 0;
      for (const char of letters) column = column * 26 + char.charCodeAt(0) - 64;
      cells.set(column - 1, cellValue(cell, sharedStrings));
    });
    const max = cells.size ? Math.max(...cells.keys()) : -1;
    return Array.from({ length: max + 1 }, (_, i) => cells.get(i) ?? "");
  });

  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  const aliases: Record<string, string[]> = {
    nome: ["nome"],
    numero_processo: ["numero do processo", "numero processo", "n do processo", "nº do processo", "nº processo", "no processo", "processo"],
    parte: ["parte"],
    advogado: ["advogado"],
    data_limite: ["data limite"],
    data_publicacao: ["data publicacao", "data de publicacao"],
    data_inicio_manifestacao: ["d i manifest", "d.i. manifest", "d.i manifest", "di manifest", "d i manifestacao", "d.i. manifestacao", "d.i. manifest."],
    data_fim_manifestacao: ["d f manifest", "d.f. manifest", "d.f manifest", "df manifest", "d f manifestacao", "d.f. manifestacao", "d.f. manifest."],
    cumprido: ["cumprido"],
    status: ["status"],
    observacao: ["observacao", "observação"],
    data_conclusao: ["data de conclusao", "data de conclusão"],
  };

  const indexes = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((header) => names.includes(header))]));

  // Suporta tanto o formato antigo quanto o novo formato solicitado para Prazos.
  // No novo formato, D.F. MANIFEST. é usado como Data Limite para manter a lógica atual de vencimento.
  const novoFormato = indexes.data_fim_manifestacao >= 0;
  if (novoFormato && indexes.data_limite < 0) indexes.data_limite = indexes.data_fim_manifestacao;

  const missing = ["nome", "numero_processo", "data_limite"].filter((field) => indexes[field] < 0);
  if (missing.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}. Formato aceito: Nome, Nº PROCESSO e Data Limite; ou Nome, Nº PROCESSO e D.F. MANIFEST.`);
  }

  return rows.slice(1).map((row) => {
    const cumprido = indexes.cumprido >= 0 ? normalizeBoolean(row[indexes.cumprido]) : null;
    return {
      nome: String(row[indexes.nome] ?? "").trim(),
      numero_processo: String(row[indexes.numero_processo] ?? "").trim() || null,
      parte: indexes.parte >= 0 ? (String(row[indexes.parte] ?? "").trim() || "Parte Autora") : "Parte Autora",
      advogado: indexes.advogado >= 0 ? (String(row[indexes.advogado] ?? "").trim() || null) : null,
      data_limite: normalizeDate(row[indexes.data_limite]) ?? "",
      status: cumprido === true ? "Concluído" : (indexes.status >= 0 ? String(row[indexes.status] ?? "").trim() || "Em andamento" : "Em andamento"),
      observacao: indexes.observacao >= 0 ? (String(row[indexes.observacao] ?? "").trim() || null) : null,
      data_conclusao: indexes.data_conclusao >= 0 ? (normalizeDate(row[indexes.data_conclusao]) ?? null) : null,
      data_publicacao: indexes.data_publicacao >= 0 ? normalizeDate(row[indexes.data_publicacao]) : null,
      data_inicio_manifestacao: indexes.data_inicio_manifestacao >= 0 ? normalizeDate(row[indexes.data_inicio_manifestacao]) : null,
      data_fim_manifestacao: indexes.data_fim_manifestacao >= 0 ? normalizeDate(row[indexes.data_fim_manifestacao]) : null,
      cumprido,
    };
  }).filter((row) => row.nome || row.numero_processo || row.data_limite);
}
