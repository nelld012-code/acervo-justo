import * as XLSX from "xlsx";

export type ReceptionImportRow = {
  data: string; advogado: string; nome_cliente: string; cpf: string | null; telefone: string; atendente: string;
};
export type ReceptionImportError = { line: number; message: string };

const normalize = (v: unknown) => String(v ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\r\n\t]+/g, " ")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

const compact = (v: unknown) => normalize(v).replace(/[^a-z0-9]/g, "");

function excelDate(v: unknown): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) throw new Error("Data inválida");
    return `${String(d.y).padStart(4,"0")}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const s = String(v ?? "").trim();
  if (!s) throw new Error("Data obrigatória");
  const br = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2,"0")}-${br[1].padStart(2,"0")}`;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  throw new Error("Data inválida (use dd/mm/aaaa)");
}

export async function parseReceptionExcel(file: File) {
  const wb = XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("A planilha não possui uma aba válida.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header:1, defval:"", raw:true });
  if (!matrix.length) throw new Error("A planilha está vazia.");

  const aliases: Record<string,string[]> = {
    data:["data"], advogado:["advogado"], nome_cliente:["nome do cliente","nome cliente"],
    cpf:["cpf"], telefone:["telefone","tel"], atendente:["atendente"]
  };
  const required = ["data","advogado","nome_cliente","telefone","atendente"];

  // Excel files exported by other systems may contain a title/blank row before the real header.
  // Find the first row that contains the expected column names instead of assuming row 1.
  let headerRow = -1;
  let idx: Record<string,number> = {};
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const headers = (matrix[r] ?? []).map(normalize);
    const candidate: Record<string,number> = {};
    for (const [k,names] of Object.entries(aliases)) {
      candidate[k] = headers.findIndex(h => names.includes(h) || names.some(n => compact(h) === compact(n)));
    }
    const found = required.filter(k => candidate[k] >= 0).length;
    if (found >= 4 && (candidate.data >= 0 || candidate.nome_cliente >= 0)) {
      headerRow = r;
      idx = candidate;
      break;
    }
  }

  if (headerRow < 0) {
    throw new Error("Cabeçalhos não reconhecidos. Use: Data | Advogado | Nome do cliente | CPF | Telefone | Atendente");
  }

  const missing = required.filter(k => idx[k] < 0);
  if (missing.length) throw new Error(`Cabeçalhos obrigatórios ausentes: ${missing.join(", ")}`);

  const rows: ReceptionImportRow[] = [];
  const errors: ReceptionImportError[] = [];
  matrix.slice(headerRow + 1).forEach((cells, i) => {
    const line = headerRow + i + 2;
    if (!cells.some(v => String(v ?? "").trim())) return;
    try {
      const get=(k:string)=>cells[idx[k]];
      const row:ReceptionImportRow={
        data:excelDate(get("data")),
        advogado:String(get("advogado")??"").trim(),
        nome_cliente:String(get("nome_cliente")??"").trim(),
        cpf:idx.cpf>=0?String(get("cpf")??"").trim()||null:null,
        telefone:String(get("telefone")??"").trim(),
        atendente:String(get("atendente")??"").trim()
      };
      for (const k of required) if (!row[k as keyof ReceptionImportRow]) throw new Error(`${k} obrigatório`);
      rows.push(row);
    } catch(e) {
      errors.push({line,message:e instanceof Error?e.message:"Linha inválida"});
    }
  });
  return {rows,errors};
}
