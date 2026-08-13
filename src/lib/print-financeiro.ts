import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, getSignedUrl, processoLabel, type Documento } from "@/lib/documents";

/** Registro financeiro unificado (entrada = pagamento, saída = despesa). */
export type RegistroFinanceiro = {
  kind: "entrada" | "saida";
  id: string;
  nome: string;
  numero_processo: string | null;
  tipo: string;
  valor: number;
  data: string;
  status: string;
  observacao: string | null;
  document_id?: string | null;
};

function br(date: string | null | undefined) {
  if (!date) return "—";
  const [y, m, d] = String(date).split("-");
  return d ? `${d}/${m}/${y}` : String(date);
}

/** Busca todos os documentos anexados relacionados ao registro (mesmo cliente/processo). */
async function fetchRelatedDocs(rec: RegistroFinanceiro): Promise<Documento[]> {
  if (rec.kind !== "entrada") return [];
  const processo = (rec.numero_processo ?? "").trim();
  if (processo) {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("numero_processo", processo)
      .order("created_at", { ascending: true });
    if ((data ?? []).length) return (data ?? []) as Documento[];
  }
  if (rec.document_id) {
    const { data } = await supabase.from("documents").select("*").eq("id", rec.document_id);
    return (data ?? []) as Documento[];
  }
  return [];
}

/** Gera um PDF real do registro financeiro incluindo TODOS os documentos anexados. */
export async function buildFinancialRecordPdf(rec: RegistroFinanceiro): Promise<Blob> {
  const docs = await fetchRelatedDocs(rec);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  const margin = 48;
  let page = pdf.addPage(A4);
  let y = A4[1] - margin;

  const line = (text: string, size = 10, isBold = false) => {
    if (y < margin + 20) {
      page = pdf.addPage(A4);
      y = A4[1] - margin;
    }
    page.drawText(text, { x: margin, y, size, font: isBold ? bold : font, color: rgb(0, 0, 0) });
    y -= size + 6;
  };

  line("REGISTRO FINANCEIRO", 16, true);
  line(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 9);
  y -= 6;

  const info: [string, string][] = [
    ["Nome", rec.nome || "—"],
    ["Número do Processo", processoLabel(rec.numero_processo)],
    ["Tipo", rec.tipo],
    ["Valor", formatBRL(Number(rec.valor))],
    ["Data", br(rec.data)],
    ["Status", rec.status],
    ["Observação", rec.observacao || "—"],
  ];
  for (const [label, value] of info) line(`${label}: ${value}`, 11);

  y -= 8;
  line("Documentos anexados", 12, true);
  if (docs.length === 0) {
    line("Nenhum documento anexado.", 10);
  } else {
    docs.forEach((d, i) => line(`${i + 1}. ${d.tipo_documento} — ${d.file_name} (${br(d.data_documento)})`, 10));
  }

  // Anexa todos os arquivos antes de gerar o PDF final (sem condição de corrida).
  for (const d of docs) {
    try {
      const url = await getSignedUrl(d.file_url);
      const res = await fetch(url);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const name = d.file_name.toLowerCase();
      if (name.endsWith(".pdf")) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await pdf.copyPages(src, src.getPageIndices());
        pages.forEach((p) => pdf.addPage(p));
      } else if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
        const img = name.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const p = pdf.addPage(A4);
        const max = { w: A4[0] - margin * 2, h: A4[1] - margin * 2 };
        const scale = Math.min(max.w / img.width, max.h / img.height, 1);
        p.drawImage(img, {
          x: margin,
          y: A4[1] - margin - img.height * scale,
          width: img.width * scale,
          height: img.height * scale,
        });
      }
    } catch {
      // arquivo não incorporável — permanece listado no índice
    }
  }

  const out = await pdf.save();
  return new Blob([out as unknown as BlobPart], { type: "application/pdf" });
}

/** Abre o PDF em nova guia (compatível com desktop, tablet e celular). */
export async function printFinancialRecord(rec: RegistroFinanceiro) {
  const blob = await buildFinancialRecordPdf(rec);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `registro-financeiro-${rec.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
