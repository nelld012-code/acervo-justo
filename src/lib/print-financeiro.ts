import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatBRL, processoLabel } from "@/lib/documents";

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
  /** Somente entradas (tabela payments) */
  metodo_pagamento?: string | null;
  responsavel_recebimento?: string | null;
  /** Somente saídas (tabela expenses) */
  categoria?: string | null;
  responsavel_pagamento?: string | null;
};

function br(date: string | null | undefined) {
  if (!date) return "—";
  const [y, m, d] = String(date).split("-");
  return d ? `${d}/${m}/${y}` : String(date);
}

/**
 * Gera o PDF do recibo/registro financeiro selecionado.
 * Contém APENAS os dados da transação — nenhum documento jurídico é anexado.
 */
export async function buildFinancialRecordPdf(rec: RegistroFinanceiro): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  const margin = 56;
  const page = pdf.addPage(A4);
  const width = A4[0];
  let y = A4[1] - margin;

  const text = (t: string, size = 10, isBold = false, x = margin) => {
    page.drawText(t, { x, y, size, font: isBold ? bold : font, color: rgb(0.08, 0.09, 0.16) });
    y -= size + 8;
  };

  // Cabeçalho
  page.drawRectangle({ x: 0, y: A4[1] - 96, width, height: 96, color: rgb(0.06, 0.09, 0.16) });
  page.drawText("Sistema de Gestão Judicial", {
    x: margin, y: A4[1] - 44, size: 10, font, color: rgb(0.78, 0.81, 0.9),
  });
  page.drawText(rec.kind === "entrada" ? "RECIBO / REGISTRO FINANCEIRO" : "REGISTRO FINANCEIRO", {
    x: margin, y: A4[1] - 70, size: 17, font: bold, color: rgb(1, 1, 1),
  });
  y = A4[1] - 130;

  text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 9);
  y -= 6;

  const linhas: [string, string][] = [
    ["Nome", rec.nome || "—"],
    ["Número do Processo", processoLabel(rec.numero_processo)],
    ["Tipo", rec.tipo],
    ["Valor", formatBRL(Number(rec.valor))],
    ["Data", br(rec.data)],
    ["Status", rec.status],
  ];
  if (rec.kind === "entrada") {
    if (rec.metodo_pagamento) linhas.push(["Método de pagamento", rec.metodo_pagamento]);
    if (rec.responsavel_recebimento) linhas.push(["Responsável pelo recebimento", rec.responsavel_recebimento]);
  } else {
    if (rec.categoria) linhas.push(["Categoria", rec.categoria]);
    if (rec.responsavel_pagamento) linhas.push(["Responsável pelo pagamento", rec.responsavel_pagamento]);
  }
  linhas.push(["Observação", rec.observacao || "—"]);

  for (const [label, value] of linhas) {
    page.drawText(`${label}:`, { x: margin, y, size: 10, font: bold, color: rgb(0.35, 0.38, 0.45) });
    const val = String(value);
    const max = 70;
    page.drawText(val.length > max ? `${val.slice(0, max)}…` : val, {
      x: margin + 190, y, size: 11, font, color: rgb(0.08, 0.09, 0.16),
    });
    y -= 24;
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y }, end: { x: width - margin, y },
    thickness: 0.8, color: rgb(0.8, 0.82, 0.87),
  });
  y -= 26;

  if (rec.kind === "entrada") {
    text("Recebemos o valor acima informado referente ao registro financeiro deste processo.", 10);
  }

  // Assinatura
  y -= 70;
  const sigW = 240;
  page.drawLine({
    start: { x: margin, y }, end: { x: margin + sigW, y },
    thickness: 0.8, color: rgb(0.2, 0.22, 0.3),
  });
  page.drawText("Assinatura / Responsável", {
    x: margin, y: y - 14, size: 9, font, color: rgb(0.35, 0.38, 0.45),
  });

  const out = await pdf.save();
  return new Blob([out as unknown as BlobPart], { type: "application/pdf" });
}

/** Abre o recibo em nova guia (compatível com desktop, tablet e celular). */
export async function printFinancialRecord(rec: RegistroFinanceiro) {
  const blob = await buildFinancialRecordPdf(rec);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `recibo-financeiro-${rec.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
