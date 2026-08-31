import * as XLSX from "xlsx";

type ExcelCell = string | number | boolean | Date | null;

export type ImportPrazoRow = {
  nome: string;
  numero_processo: string | null;
  parte: string;
  advogado: string | null;
  data_limite: string | null;
  status: string;
  observacao: string | null;
  data_conclusao: string | null;
  data_publicacao: string | null;
  data_inicio_manifestacao: string | null;
  data_fim_manifestacao: string | null;
  cumprido: boolean | null;
};

/** Remove acentos, espaços extras, pontuação e caixa para comparar cabeçalhos. */
function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[.:;]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function excelSerialToIso(value: number) {
  if (!Number.isFinite(value)) return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  const iso = `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  return iso;
}

function normalizeDate(value: ExcelCell): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") return excelSerialToIso(value);
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+([.,]\d+)?$/.test(text)) {
    const serial = Number(text.replace(",", "."));
    if (serial > 20000 && serial < 90000) return excelSerialToIso(serial);
  }
  const br = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

function normalizeBoolean(value: ExcelCell): boolean | null {
  if (value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (["sim", "s", "yes", "y", "true", "1", "cumprido"].includes(text)) return true;
  if (["nao", "n", "no", "false", "0", "pendente", "nao cumprido"].includes(text)) return false;
  return null;
}

function normalizeStatus(value: ExcelCell, cumprido: boolean | null) {
  if (cumprido === true) return "Concluído";
  const text = String(value ?? "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (["concluido", "concluida", "cumprido", "cumprida", "finalizado", "finalizada", "feito", "feita", "arquivado"].includes(text)) return "Concluído";
  return "Em andamento";
}

function text(value: ExcelCell) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return normalizeDate(value) ?? "";
  return String(value).trim();
}

const ALIASES: Record<string, string[]> = {
  nome: ["nome", "nome do prazo", "titulo"],
  numero_processo: [
    "expediente", "numero do processo", "numero processo", "n do processo",
    "no do processo", "no processo", "n processo", "processo", "numero", "nº do processo",
  ],
  parte: ["parte", "partes", "parte interessada"],
  advogado: ["advogado", "advogada", "responsavel"],
  data_limite: ["data limite", "data final", "data fim", "prazo final", "data do prazo"],
  data_publicacao: ["data inicial", "data publicacao", "data de publicacao", "data inicio", "data de inicio"],
  data_inicio_manifestacao: ["d i manifest", "di manifest", "d i manifestacao", "d i manifest ", "d i manifesta"],
  data_fim_manifestacao: ["d f manifest", "df manifest", "d f manifestacao", "d f manifesta"],
  cumprido: ["cumprido"],
  status: ["status", "situacao"],
  observacao: ["observacao", "observacoes", "obs"],
  data_conclusao: ["data de conclusao", "data conclusao"],
};

/** Cabeçalhos ignorados: valores recalculados pelo sistema. */
const IGNORED = ["dias restantes"];

export function parsePrazosRows(matrix: ExcelCell[][]): ImportPrazoRow[] {
  if (!matrix.length) return [];
  const headerIndex = matrix.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "nome"));
  const start = headerIndex >= 0 ? headerIndex : 0;
  const headers = (matrix[start] ?? []).map(normalizeHeader);

  const indexes: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    indexes[field] = headers.findIndex(
      (header) => header !== "" && !IGNORED.includes(header) && names.includes(header),
    );
  }
  if (indexes.data_limite < 0 && indexes.data_fim_manifestacao >= 0) {
    indexes.data_limite = indexes.data_fim_manifestacao;
  }
  if (indexes.nome < 0) throw new Error("Coluna obrigatória ausente: Nome.");
  if (indexes.data_limite < 0) throw new Error("Coluna obrigatória ausente: Data Limite.");

  const pick = (row: ExcelCell[], field: string): ExcelCell => {
    const i = indexes[field];
    return i >= 0 ? (row[i] ?? "") : "";
  };

  return matrix
    .slice(start + 1)
    .map((row) => {
      const cumprido = indexes.cumprido >= 0 ? normalizeBoolean(pick(row, "cumprido")) : null;
      return {
        nome: text(pick(row, "nome")),
        numero_processo: text(pick(row, "numero_processo")) || null,
        parte: text(pick(row, "parte")) || "Parte Autora",
        advogado: text(pick(row, "advogado")) || null,
        data_limite: normalizeDate(pick(row, "data_limite")) ?? "",
        status: normalizeStatus(pick(row, "status"), cumprido),
        observacao: text(pick(row, "observacao")) || null,
        data_conclusao: normalizeDate(pick(row, "data_conclusao")),
        data_publicacao: normalizeDate(pick(row, "data_publicacao")),
        data_inicio_manifestacao: normalizeDate(pick(row, "data_inicio_manifestacao")),
        data_fim_manifestacao: normalizeDate(pick(row, "data_fim_manifestacao")),
        cumprido,
      };
    })
    .filter((row) => row.nome || row.numero_processo || row.data_limite);
}

export async function parsePrazosExcel(file: File): Promise<ImportPrazoRow[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Selecione um arquivo Excel no formato .xlsx.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("Não foi possível localizar a planilha do Excel.");
  const matrix = XLSX.utils.sheet_to_json<ExcelCell[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  return parsePrazosRows(matrix);
}

export type ImportRecepcaoRow = {
  data: string;
  advogado: string;
  nome_cliente: string;
  cpf: string | null;
  telefone: string;
  atendente: string;
};

export type ImportRecepcaoResult = {
  validos: ImportRecepcaoRow[];
  invalidos: { linha: number; motivo: string }[];
};

const RECEPCAO_ALIASES: Record<string, string[]> = {
  data: ["data", "data atendimento", "data do atendimento"],
  advogado: ["advogado", "advogada"],
  nome_cliente: ["nome do cliente", "nome cliente", "cliente", "nome"],
  cpf: ["cpf", "cpf cnpj", "cpf/cnpj"],
  telefone: ["telefone", "celular", "fone", "whatsapp"],
  atendente: ["atendente", "recepcionista"],
};

/** Mantém CPF/telefone como texto (preserva zeros à esquerda). */
function textDigitsSafe(value: ExcelCell) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

export function parseRecepcaoRows(matrix: ExcelCell[][]): ImportRecepcaoResult {
  if (!matrix.length) return { validos: [], invalidos: [] };
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => RECEPCAO_ALIASES.nome_cliente.includes(normalizeHeader(cell))),
  );
  const start = headerIndex >= 0 ? headerIndex : 0;
  const headers = (matrix[start] ?? []).map(normalizeHeader);

  const indexes: Record<string, number> = {};
  for (const [field, names] of Object.entries(RECEPCAO_ALIASES)) {
    indexes[field] = headers.findIndex((header) => header !== "" && names.includes(header));
  }
  const missing = (["data", "advogado", "nome_cliente", "telefone", "atendente"] as const).filter(
    (f) => indexes[f] < 0,
  );
  if (missing.length) {
    throw new Error(
      "Colunas obrigatórias ausentes: Data, Advogado, Nome do cliente, Telefone, Atendente. Verifique o cabeçalho da planilha.",
    );
  }

  const pick = (row: ExcelCell[], field: string): ExcelCell => {
    const i = indexes[field];
    return i >= 0 ? (row[i] ?? "") : "";
  };

  const validos: ImportRecepcaoRow[] = [];
  const invalidos: { linha: number; motivo: string }[] = [];

  matrix.slice(start + 1).forEach((row, i) => {
    const linha = start + 2 + i;
    const nome_cliente = text(pick(row, "nome_cliente"));
    const advogado = text(pick(row, "advogado"));
    const atendente = text(pick(row, "atendente"));
    const telefone = textDigitsSafe(pick(row, "telefone"));
    const cpf = textDigitsSafe(pick(row, "cpf"));
    const data = normalizeDate(pick(row, "data"));
    const vazia = !nome_cliente && !advogado && !atendente && !telefone && !cpf && !data;
    if (vazia) return;

    const faltando: string[] = [];
    if (!data) faltando.push("Data");
    if (!advogado) faltando.push("Advogado");
    if (!nome_cliente) faltando.push("Nome do cliente");
    if (!telefone) faltando.push("Telefone");
    if (!atendente) faltando.push("Atendente");
    if (faltando.length) {
      invalidos.push({ linha, motivo: `Campos ausentes/inválidos: ${faltando.join(", ")}` });
      return;
    }
    validos.push({ data: data!, advogado, nome_cliente, cpf: cpf || null, telefone, atendente });
  });

  return { validos, invalidos };
}

export async function parseRecepcaoExcel(file: File): Promise<ImportRecepcaoResult> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Selecione um arquivo Excel no formato .xlsx.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("Não foi possível localizar a planilha do Excel.");
  const matrix = XLSX.utils.sheet_to_json<ExcelCell[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  return parseRecepcaoRows(matrix);
}

/* ============================ CLIENTES ============================ */

export type ImportClienteRow = {
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  rg: string | null;
  estado_civil: string | null;
  profissao: string | null;
  observacoes: string | null;
  data_atendimento: string | null;
  reu_nome: string | null;
  reu_rg_cnpj: string | null;
  reu_estado_civil: string | null;
  reu_profissao: string | null;
  reu_endereco: string | null;
  reu_bairro: string | null;
  reu_cidade: string | null;
  tipo_acao: string | null;
  numero_processo: string | null;
  resumo_atendimento: string | null;
};

export type ImportClienteResult = {
  validos: { linha: number; dados: ImportClienteRow }[];
  invalidos: { linha: number; motivo: string }[];
};

const CLIENTE_ALIASES: Record<keyof ImportClienteRow, string[]> = {
  nome: ["nome", "nome do cliente", "cliente", "nome completo", "nome do autor"],
  cpf_cnpj: ["cpf cnpj", "cpf/cnpj", "cpf", "cnpj", "cpf ou cnpj", "documento"],
  email: ["email", "e mail", "e-mail"],
  telefone: ["telefone", "celular", "fone", "whatsapp", "contato"],
  endereco: ["endereco", "endereco do autor", "logradouro"],
  bairro: ["bairro"],
  cidade: ["cidade", "municipio"],
  rg: ["rg", "registro geral", "identidade"],
  estado_civil: ["estado civil"],
  profissao: ["profissao"],
  observacoes: ["observacoes", "observacao", "obs"],
  data_atendimento: ["data do atendimento", "data atendimento", "data"],
  reu_nome: ["nome do reu", "reu", "reu nome"],
  reu_rg_cnpj: ["rg cnpj do reu", "rg/cnpj do reu", "rg cnpj reu", "documento do reu", "cpf cnpj do reu"],
  reu_estado_civil: ["estado civil do reu", "estado civil reu"],
  reu_profissao: ["profissao do reu", "profissao reu"],
  reu_endereco: ["endereco do reu", "endereco reu"],
  reu_bairro: ["bairro do reu", "bairro reu"],
  reu_cidade: ["cidade do reu", "cidade reu"],
  tipo_acao: ["tipo de acao", "tipo de acao / proposta", "tipo de acao proposta", "tipo acao", "proposta"],
  numero_processo: ["numero do processo", "numero processo", "processo", "n do processo", "expediente"],
  resumo_atendimento: ["resumo do atendimento", "resumo", "resumo atendimento"],
};

const CLIENTE_CAMPOS = Object.keys(CLIENTE_ALIASES) as (keyof ImportClienteRow)[];

export function parseClientesRows(matrix: ExcelCell[][]): ImportClienteResult {
  if (!matrix.length) return { validos: [], invalidos: [] };
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => CLIENTE_ALIASES.nome.includes(normalizeHeader(cell))),
  );
  const start = headerIndex >= 0 ? headerIndex : 0;
  const headers = (matrix[start] ?? []).map(normalizeHeader);

  const indexes = {} as Record<keyof ImportClienteRow, number>;
  const usados = new Set<number>();
  for (const campo of CLIENTE_CAMPOS) {
    const i = headers.findIndex(
      (header, idx) => header !== "" && !usados.has(idx) && CLIENTE_ALIASES[campo].includes(header),
    );
    indexes[campo] = i;
    if (i >= 0) usados.add(i);
  }
  if (indexes.nome < 0 || indexes.telefone < 0) {
    throw new Error("Colunas obrigatórias ausentes: Nome e Telefone. Verifique o cabeçalho da planilha.");
  }

  const pick = (row: ExcelCell[], campo: keyof ImportClienteRow): ExcelCell => {
    const i = indexes[campo];
    return i >= 0 ? (row[i] ?? "") : "";
  };
  const opcional = (row: ExcelCell[], campo: keyof ImportClienteRow) =>
    textDigitsSafe(pick(row, campo)).trim() || null;

  const validos: ImportClienteResult["validos"] = [];
  const invalidos: ImportClienteResult["invalidos"] = [];

  matrix.slice(start + 1).forEach((row, i) => {
    const linha = start + 2 + i;
    const preenchida = CLIENTE_CAMPOS.some((campo) => textDigitsSafe(pick(row, campo)).trim() !== "");
    if (!preenchida) return;

    const nome = text(pick(row, "nome"));
    const telefone = textDigitsSafe(pick(row, "telefone")).trim();
    const faltando: string[] = [];
    if (!nome) faltando.push("Nome");
    if (!telefone) faltando.push("Telefone");
    if (faltando.length) {
      invalidos.push({ linha, motivo: `Campos obrigatórios ausentes: ${faltando.join(", ")}` });
      return;
    }

    validos.push({
      linha,
      dados: {
        nome,
        telefone,
        cpf_cnpj: opcional(row, "cpf_cnpj"),
        email: opcional(row, "email"),
        endereco: opcional(row, "endereco"),
        bairro: opcional(row, "bairro"),
        cidade: opcional(row, "cidade"),
        rg: opcional(row, "rg"),
        estado_civil: opcional(row, "estado_civil"),
        profissao: opcional(row, "profissao"),
        observacoes: opcional(row, "observacoes"),
        data_atendimento: normalizeDate(pick(row, "data_atendimento")),
        reu_nome: opcional(row, "reu_nome"),
        reu_rg_cnpj: opcional(row, "reu_rg_cnpj"),
        reu_estado_civil: opcional(row, "reu_estado_civil"),
        reu_profissao: opcional(row, "reu_profissao"),
        reu_endereco: opcional(row, "reu_endereco"),
        reu_bairro: opcional(row, "reu_bairro"),
        reu_cidade: opcional(row, "reu_cidade"),
        tipo_acao: opcional(row, "tipo_acao"),
        numero_processo: opcional(row, "numero_processo"),
        resumo_atendimento: opcional(row, "resumo_atendimento"),
      },
    });
  });

  return { validos, invalidos };
}

export async function parseClientesExcel(file: File): Promise<ImportClienteResult> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Selecione um arquivo Excel no formato .xlsx.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("Não foi possível localizar a planilha do Excel.");
  const matrix = XLSX.utils.sheet_to_json<ExcelCell[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  return parseClientesRows(matrix);
}
