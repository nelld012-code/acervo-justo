import * as XLSX from "xlsx";

export type ImportAudienciaRow = {
  nome: string;
  numero_processo: string | null;
  parte: string | null;
  advogado: string | null;
  data_audiencia: string;
  hora_audiencia: string | null;
  orgao_julgador: string | null;
  vara: string | null;
  tipo_audiencia: "Civil" | "Criminal" | "Administrativo";
  modalidade: "Presencial" | "Virtual";
  local_audiencia: string | null;
  link_virtual: string | null;
  observacao: string | null;
};

export type ImportAudienciaError = { line: number; message: string };

const normalize = (v: unknown) => String(v ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[\r\n\t]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");

function dateValue(v: unknown) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }

  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) throw new Error("Data inválida");
    return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }

  let s = String(v ?? "").trim();
  if (!s) throw new Error("Data da audiência obrigatória");

  s = s.replace(/\\/g, "/").replace(/\s+/g, "");

  // Aceita datas brasileiras, ISO e valores ISO completos vindos do Excel.
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:T.*)?$/);
  if (m) {
    const day = Number(m[1]); const month = Number(m[2]); const year = Number(m[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // Excel às vezes retorna a data formatada como texto numérico.
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 100000) {
      const d = XLSX.SSF.parse_date_code(serial);
      if (d) return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }

  // Último recurso para formatos reconhecidos pelo JavaScript.
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  throw new Error("Data inválida (use dd/mm/aaaa)");
}

export async function parseAudienciasExcel(file: File) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("A planilha não possui uma aba válida.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const aliases: Record<string, string[]> = {
    nome: ["nome", "cliente", "nome do cliente", "parte"],
    numero_processo: ["numero do processo", "número do processo", "processo"],
    parte: ["parte", "parte autora", "parte interessada"],
    advogado: ["advogado", "responsavel", "responsável"],
    data_audiencia: ["data", "data da audiencia", "data da audiência"],
    hora_audiencia: ["hora", "horario", "horário", "hora da audiencia", "hora da audiência"],
    orgao_julgador: ["orgao julgador", "órgão julgador", "tribunal"],
    vara: ["vara", "unidade", "foro"],
    tipo_audiencia: ["tipo", "tipo de audiencia", "tipo de audiência"],
    modalidade: ["modalidade", "virtual ou presencial", "presencial ou virtual"],
    local_audiencia: ["local", "local da audiencia", "local da audiência"],
    link_virtual: ["link", "link virtual", "sala virtual"],
    observacao: ["observacao", "observação", "obs"],
  };
  let headerRow = -1; let idx: Record<string, number> = {};
  for (let r = 0; r < Math.min(matrix.length, 20); r++) {
    const headers = (matrix[r] ?? []).map(normalize);
    const candidate: Record<string, number> = {};
    for (const [k, names] of Object.entries(aliases)) candidate[k] = headers.findIndex(h => names.some(n => h === n || h.replace(/[^a-z0-9]/g, "") === n.replace(/[^a-z0-9]/g, "")));
    if (candidate.nome >= 0 && candidate.data_audiencia >= 0) { headerRow = r; idx = candidate; break; }
  }
  if (headerRow < 0) throw new Error("Cabeçalhos não reconhecidos. Use ao menos Nome/Cliente e Data da audiência.");
  const rows: ImportAudienciaRow[] = []; const errors: ImportAudienciaError[] = [];
  matrix.slice(headerRow + 1).forEach((cells, i) => {
    const line = headerRow + i + 2;
    if (!cells.some(v => String(v ?? "").trim())) return;
    try {
      const get = (k: string) => idx[k] >= 0 ? cells[idx[k]] : "";
      const tipoRaw = normalize(get("tipo_audiencia"));
      const modRaw = normalize(get("modalidade"));
      const tipo = tipoRaw.includes("criminal") ? "Criminal" : tipoRaw.includes("administr") ? "Administrativo" : "Civil";
      const modalidade = modRaw.includes("virtual") ? "Virtual" : "Presencial";
      rows.push({
        nome: String(get("nome") ?? "").trim(),
        numero_processo: String(get("numero_processo") ?? "").trim() || null,
        parte: String(get("parte") ?? "").trim() || null,
        advogado: String(get("advogado") ?? "").trim() || null,
        data_audiencia: dateValue(get("data_audiencia")),
        hora_audiencia: String(get("hora_audiencia") ?? "").trim() || null,
        orgao_julgador: String(get("orgao_julgador") ?? "").trim() || null,
        vara: String(get("vara") ?? "").trim() || null,
        tipo_audiencia: tipo,
        modalidade,
        local_audiencia: String(get("local_audiencia") ?? "").trim() || null,
        link_virtual: String(get("link_virtual") ?? "").trim() || null,
        observacao: String(get("observacao") ?? "").trim() || null,
      });
    } catch (e) { errors.push({ line, message: e instanceof Error ? e.message : "Linha inválida" }); }
  });
  return { rows, errors };
}
