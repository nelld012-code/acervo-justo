import * as XLSX from "xlsx";

export type ReceptionImportRow = {
  data: string;
  advogado: string;
  nome_cliente: string;
  cpf: string | null;
  telefone: string;
  atendente: string;
};

export type ReceptionImportError = { line: number; message: string };

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function excelDate(value: unknown): string {
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) throw new Error("Data inválida");
    return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  if (!text) throw new Error("Data obrigatória");
  const br = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  throw new Error("Data inválida (use dd/mm/aaaa)");
}

export async function parseReceptionExcel(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("A planilha não possui uma aba válida.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  if (!matrix.length) throw new Error("A planilha está vazia.");

  const headers = (matrix[0] ?? []).map(normalize);
  const aliases: Record<string, string[]> = {
    data: ["data"], advogado: ["advogado"], nome_cliente: ["nome do cliente", "nome cliente"],
    cpf: ["cpf"], telefone: ["telefone", "tel"], atendente: ["atendente"],
  };
  const index: Record<string, number> = {};
  for (const [key, names] of Object.entries(aliases)) {
    index[key] = headers.findIndex((h) => names.includes(h));
  }
  const required = ["data", "advogado", "nome_cliente", "telefone", "atendente"];
  const missing = required.filter((k) => index[k] < 0);
  if (missing.length) throw new Error(`Cabeçalhos obrigatórios ausentes: ${missing.join(", ")}`);

  const rows: ReceptionImportRow[] = [];
  const errors: ReceptionImportError[] = [];
  matrix.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    if (!cells.some((v) => String(v ?? "").trim())) return;
    try {
      const get = (key: string) => cells[index[key]];
      const row = {
        data: excelDate(get("data")), advogado: String(get("advogado") ?? "").trim(),
        nome_cliente: String(get("nome_cliente") ?? "").trim(), cpf: index.cpf >= 0 ? String(get("cpf") ?? "").trim() || null : null,
        telefone: String(get("telefone") ?? "").trim(), atendente: String(get("atendente") ?? "").trim(),
      };
      for (const key of required) if (!row[key as keyof ReceptionImportRow]) throw new Error(`${key} obrigatório`);
      rows.push(row);
    } catch (e) { errors.push({ line, message: e instanceof Error ? e.message : "Linha inválida" }); }
  });
  return { rows, errors };
}
