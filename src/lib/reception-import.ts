import * as XLSX from "xlsx";

export type ReceptionImportRow = {
  data: string; advogado: string; nome_cliente: string; cpf: string | null; telefone: string; atendente: string;
};
export type ReceptionImportError = { line: number; message: string };

const normalize = (v: unknown) => String(v ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[\r\n\t]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
const compact = (v: unknown) => normalize(v).replace(/[^a-z0-9]/g, "");

function excelDate(v: unknown): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) throw new Error("Data inválida");
    return `${String(d.y).padStart(4,"0")}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}`;
  }
  let s = String(v ?? "").trim();
  if (!s) throw new Error("Data obrigatória");

  // A planilha real contém misturas como 09\\02\\2026, 11/02\\2026 e
  // 17/03 \\2026. Normalizamos barra invertida e espaços antes de validar.
  s = s.replace(/\\/g, "/").replace(/\s+/g, "");

  // Datas brasileiras normais e datas com ano de 3 dígitos (ex.: 28/05/206),
  // que no arquivo real é claramente 2026.
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{3,4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    let year = Number(br[3]);
    if (br[3].length === 3 && year >= 200 && year <= 299) year += 1800;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    }
  }

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;

  // Caso o Excel entregue a data como número armazenado em texto.
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 100000) return excelDate(serial);
  }

  throw new Error("Data inválida (use dd/mm/aaaa)");
}

export async function parseReceptionExcel(file: File) {
  const wb = XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("A planilha não possui uma aba válida.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header:1, defval:"", raw:true });
  if (!matrix.length) throw new Error("A planilha está vazia.");

  const aliases: Record<string,string[]> = {
    data:["data"],
    advogado:["advogado"],
    nome_cliente:["nome do cliente","nome cliente","nome completo do cliente","nome completo cliente","cliente"],
    cpf:["cpf"],
    telefone:["telefone","tel","telefone celular","celular"],
    atendente:["atendente","atendimento por","responsavel","observacao","observação"]
  };

  let headerRow = -1; let idx: Record<string,number> = {};
  for (let r = 0; r < Math.min(matrix.length, 20); r++) {
    const headers = (matrix[r] ?? []).map(normalize);
    const candidate: Record<string,number> = {};
    for (const [k,names] of Object.entries(aliases)) {
      candidate[k] = headers.findIndex(h => names.includes(h) || names.some(n => compact(h) === compact(n)));
    }
    const hasCore = candidate.data >= 0 && candidate.advogado >= 0 && candidate.nome_cliente >= 0 && candidate.telefone >= 0;
    if (hasCore) { headerRow = r; idx = candidate; break; }
  }
  if (headerRow < 0) throw new Error("Cabeçalhos não reconhecidos. O arquivo deve conter Data, Advogado, Nome do cliente (ou Nome completo do cliente) e Telefone.");

  if (idx.atendente < 0) {
    const headers = (matrix[headerRow] ?? []).map(normalize);
    idx.atendente = headers.findIndex(h => h === "observacao");
  }
  if (idx.atendente < 0) throw new Error("Cabeçalho de atendente ausente. Use Atendente ou Observação.");

  const rows: ReceptionImportRow[] = [];
  const errors: ReceptionImportError[] = [];
  let lastData = "";
  let lastAdvogado = "";

  matrix.slice(headerRow + 1).forEach((cells, i) => {
    const line = headerRow + i + 2;
    if (!cells.some(v => String(v ?? "").trim())) return;
    try {
      const get = (k:string) => cells[idx[k]];
      const rawData = get("data");
      const rawAdvogado = String(get("advogado") ?? "").trim();

      let data = "";
      if (String(rawData ?? "").trim()) {
        data = excelDate(rawData);
        lastData = data;
      } else if (lastData) {
        data = lastData;
      } else {
        throw new Error("Data obrigatória");
      }

      const advogado = rawAdvogado || lastAdvogado;
      if (rawAdvogado) lastAdvogado = rawAdvogado;
      if (!advogado) throw new Error("advogado obrigatório");

      const nome_cliente = String(get("nome_cliente") ?? "").trim();
      if (!nome_cliente) throw new Error("nome_cliente obrigatório");

      const cpf = idx.cpf >= 0 ? String(get("cpf") ?? "").trim() || null : null;
      const telefone = String(get("telefone") ?? "").trim() || "SEM NÚMERO";
      const atendente = String(get("atendente") ?? "").trim() || "Não informado";

      rows.push({ data, advogado, nome_cliente, cpf, telefone, atendente });
    } catch (e) {
      errors.push({ line, message: e instanceof Error ? e.message : "Linha inválida" });
    }
  });

  return { rows, errors };
}
