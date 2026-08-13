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
  recebedor_salario?: string | null;
};

export function isSalario(categoria?: string | null) {
  return (categoria ?? "").trim().toLowerCase().startsWith("sal");
}

function br(date: string | null | undefined) {
  if (!date) return "—";
  const [y, m, d] = String(date).split("-");
  return d ? `${d}/${m}/${y}` : String(date);
}

function safe(v: unknown, fallback = "—") {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  if (!s || s === "undefined" || s === "null" || s === "NaN") return fallback;
  return s;
}

/**
 * Gera o PDF do recibo financeiro (modelo único para entradas e saídas).
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
  const salario = rec.kind === "saida" && isSalario(rec.categoria);

  const titulo = salario
    ? "COMPROVANTE DE PAGAMENTO DE SALARIO".replace("SALARIO", "SALÁRIO")
    : rec.kind === "entrada"
      ? "RECIBO DE PAGAMENTO"
      : "COMPROVANTE DE DESPESA";

  // Cabeçalho
  page.drawRectangle({ x: 0, y: A4[1] - 110, width, height: 110, color: rgb(0.06, 0.09, 0.16) });
  page.drawText("Sistema de Gestão Judicial", {
    x: margin, y: A4[1] - 40, size: 10, font, color: rgb(0.78, 0.81, 0.9),
  });
  page.drawText("J DIMAS GONÇALVES", {
    x: margin, y: A4[1] - 60, size: 13, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText(titulo, {
    x: margin, y: A4[1] - 88, size: 15, font: bold, color: rgb(0.72, 0.78, 1),
  });

  let y = A4[1] - 146;
  page.drawText(`Emitido em ${new Date().toLocaleString("pt-BR")}`, {
    x: margin, y, size: 9, font, color: rgb(0.4, 0.43, 0.5),
  });
  y -= 26;

  const linhas: [string, string][] = [];
  if (salario) {
    linhas.push(["Nome do recebedor", safe(rec.recebedor_salario, "Recebedor do salário")]);
  } else {
    linhas.push(["Nome", safe(rec.nome)]);
  }
  if (rec.kind === "entrada") linhas.push(["Número do Processo", processoLabel(rec.numero_processo)]);
  if (rec.kind === "saida") linhas.push(["Categoria", safe(rec.categoria)]);
  linhas.push(["Tipo", safe(rec.tipo)]);
  linhas.push(["Data", br(rec.data)]);
  linhas.push(["Valor", formatBRL(Number(rec.valor) || 0)]);
  linhas.push(["Status", safe(rec.status)]);
  if (rec.kind === "entrada") {
    linhas.push(["Método de pagamento", safe(rec.metodo_pagamento)]);
    linhas.push(["Responsável pelo recebimento", safe(rec.responsavel_recebimento)]);
  } else {
    linhas.push(["Responsável pelo pagamento", safe(rec.responsavel_pagamento)]);
    if (salario) linhas.push(["Recebedor do salário", safe(rec.recebedor_salario)]);
  }
  linhas.push(["Observação", safe(rec.observacao)]);

  // Moldura da tabela de dados
  const boxTop = y + 8;
  for (const [label, value] of linhas) {
    page.drawText(`${label}:`, { x: margin + 10, y, size: 9.5, font: bold, color: rgb(0.35, 0.38, 0.45) });
    const val = String(value);
    const max = 52;
    page.drawText(val.length > max ? `${val.slice(0, max)}…` : val, {
      x: margin + 210, y, size: 11, font, color: rgb(0.08, 0.09, 0.16),
    });
    y -= 24;
  }
  page.drawRectangle({
    x: margin, y: y + 14, width: width - margin * 2, height: boxTop - y - 6,
    borderColor: rgb(0.8, 0.82, 0.87), borderWidth: 0.8,
  });

  y -= 18;
  const decl = salario
    ? `Declaro que recebi a importância de ${formatBRL(Number(rec.valor) || 0)} referente ao pagamento de salário`
    : rec.kind === "entrada"
      ? `Recebemos a importância de ${formatBRL(Number(rec.valor) || 0)} referente ao registro financeiro acima`
      : `Declaro que foi efetuado o pagamento no valor de ${formatBRL(Number(rec.valor) || 0)} referente à despesa acima`;
  page.drawText(`${decl}, na data de ${br(rec.data)}.`, {
    x: margin, y, size: 9.5, font, color: rgb(0.25, 0.27, 0.34),
  });
  y -= 70;

  // Assinaturas — empilhadas verticalmente (legíveis em qualquer tela/impressão)
  const assinaturas: [string, string][] = salario
    ? [
        ["Responsável pelo pagamento", safe(rec.responsavel_pagamento, "Responsável pelo pagamento")],
        ["Recebedor do salário", safe(rec.recebedor_salario, "Recebedor do salário")],
      ]
    : rec.kind === "entrada"
      ? [["Responsável pelo recebimento", safe(rec.responsavel_recebimento, "Responsável pelo recebimento")]]
      : [["Responsável pelo pagamento", safe(rec.responsavel_pagamento, "Responsável pelo pagamento")]];

  const sigW = 300;
  for (const [papel, nome] of assinaturas) {
    page.drawLine({
      start: { x: margin, y }, end: { x: margin + sigW, y },
      thickness: 0.8, color: rgb(0.2, 0.22, 0.3),
    });
    page.drawText(papel, { x: margin, y: y - 14, size: 9, font, color: rgb(0.35, 0.38, 0.45) });
    page.drawText(nome, { x: margin, y: y - 30, size: 11, font: bold, color: rgb(0.08, 0.09, 0.16) });
    y -= 90;
  }

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
