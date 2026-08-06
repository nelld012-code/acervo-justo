import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl, type Documento } from "@/lib/documents";

function br(date: string | null | undefined) {
  if (!date) return "—";
  const d = new Date(date);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/** Gera um PDF único com o resumo do processo e todos os documentos anexados. */
export async function buildDossierPdf(doc: Documento): Promise<Blob> {
  const { data: related } = await supabase
    .from("documents")
    .select("*")
    .eq("numero_processo", doc.numero_processo)
    .eq("cliente", doc.cliente)
    .order("created_at", { ascending: true });

  const docs = ((related ?? []) as Documento[]).length
    ? ((related ?? []) as Documento[])
    : [doc];

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595.28, 841.89]);
  const margin = 48;
  let y = 841.89 - margin;

  const line = (text: string, size = 10, isBold = false) => {
    if (y < margin + 20) {
      page = pdf.addPage([595.28, 841.89]);
      y = 841.89 - margin;
    }
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: isBold ? bold : font,
      color: rgb(0, 0, 0),
    });
    y -= size + 6;
  };

  line("DOSSIÊ DO PROCESSO", 16, true);
  line(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 9);
  y -= 6;

  const info: [string, string][] = [
    ["Número do Documento", doc.internal_id],
    ["Número do Processo", doc.numero_processo],
    ["Tipo de Documento", doc.tipo_documento],
    ["Cliente", doc.cliente],
    ["Advogado", doc.advogado],
    ["Parte Autora", doc.parte_autora || "—"],
    ["Parte Ré", doc.parte_re || "—"],
    ["Órgão Judicial", doc.orgao_judicial || "—"],
    ["Matéria", doc.materia],
    ["Estado Processual", doc.estado_processual],
    ["Confidencialidade", doc.confidencialidade],
    ["Data do Documento", br(doc.data_documento)],
    ["Data de Ingresso", br(doc.data_ingresso)],
    ["Data do Processo", br(doc.data_processo)],
    ["Palavras-chave", (doc.palavras_chave ?? []).join(", ") || "—"],
  ];
  line("Informações do Processo", 12, true);
  for (const [label, value] of info) line(`${label}: ${value}`, 10);

  y -= 8;
  line("Documentos anexados", 12, true);
  docs.forEach((d, i) => {
    line(`${i + 1}. ${d.tipo_documento} — ${d.file_name} (v${d.current_version}, ${br(d.data_documento)})`, 10);
  });

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
        const p = pdf.addPage([595.28, 841.89]);
        const max = { w: 595.28 - margin * 2, h: 841.89 - margin * 2 };
        const scale = Math.min(max.w / img.width, max.h / img.height, 1);
        p.drawImage(img, {
          x: margin,
          y: 841.89 - margin - img.height * scale,
          width: img.width * scale,
          height: img.height * scale,
        });
      }
    } catch {
      // arquivo não incorporável (ex.: DOCX) — permanece listado no índice
    }
  }

  const out = await pdf.save();
  return new Blob([out as unknown as BlobPart], { type: "application/pdf" });
}