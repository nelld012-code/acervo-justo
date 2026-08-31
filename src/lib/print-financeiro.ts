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


export type AtestadoComparecimento = {
  nome: string;
  cpf?: string | null;
  data: string;
  horaInicio?: string | null;
  horaFim?: string | null;
  assunto?: string | null;
};

export async function printAtestadoComparecimento(atestado: AtestadoComparecimento) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  const margin = 56;
  const page = pdf.addPage(A4);
  const width = A4[0];
  const brLocal = (d: string) => { const parts = String(d || "").split("-"); return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : String(d || ""); };
  const safeLocal = (v: string | null | undefined, fallback = "—") => { const x = String(v ?? "").trim(); return x || fallback; };
  const nome = safeLocal(atestado.nome);
  const cpf = safeLocal(atestado.cpf);
  const data = brLocal(atestado.data);
  const inicio = safeLocal(atestado.horaInicio, "___:___");
  const fim = safeLocal(atestado.horaFim, "___:___");
  const assunto = safeLocal(atestado.assunto, "atendimento profissional");
  const periodo = "de " + inicio + " às " + fim;
  page.drawRectangle({ x: 0, y: A4[1] - 110, width, height: 110, color: rgb(0.06, 0.09, 0.16) });
  page.drawText("Sistema de Gestão Judicial", { x: margin, y: A4[1] - 40, size: 10, font, color: rgb(0.78, 0.81, 0.9) });
  page.drawText("J DIMAS GONÇALVES", { x: margin, y: A4[1] - 60, size: 13, font: bold, color: rgb(1, 1, 1) });
  page.drawText("ATESTADO DE COMPARECIMENTO", { x: margin, y: A4[1] - 88, size: 15, font: bold, color: rgb(0.72, 0.78, 1) });
  let y = A4[1] - 146;
  const linhas: [string, string][] = [["Documento", "Comparecimento"], ["Nome", nome], ["CPF", cpf], ["Data", data], ["Horário", periodo], ["Assunto", assunto]];
  const boxTop = y + 8;
  for (const [label, value] of linhas) {
    page.drawText(label + ":", { x: margin + 10, y, size: 9.5, font: bold, color: rgb(0.35, 0.38, 0.45) });
    const val = value.length > 52 ? value.slice(0, 52) + "…" : value;
    page.drawText(val, { x: margin + 210, y, size: 11, font, color: rgb(0.08, 0.09, 0.16) });
    y -= 24;
  }
  page.drawRectangle({ x: margin, y: y + 14, width: width - margin * 2, height: boxTop - y - 6, borderColor: rgb(0.8, 0.82, 0.87), borderWidth: 0.8 });
  y -= 28;
  const declaracao = "Atestamos, para os devidos fins, que " + nome + (cpf !== "—" ? ", inscrito(a) no CPF sob nº " + cpf : "") + ", compareceu a este escritório de advocacia no dia " + data + ", permanecendo nas dependências no período " + periodo + ", para tratar de assuntos relacionados a " + assunto + ".";
  const maxWidth = width - margin * 2;
  const fontSize = 10.5;
  const palavras = declaracao.split(/\s+/);
  const linhasDeclaracao: string[] = [];
  let linha = "";
  for (const palavra of palavras) {
    const teste = linha ? linha + " " + palavra : palavra;
    if (font.widthOfTextAtSize(teste, fontSize) > maxWidth && linha) {
      linhasDeclaracao.push(linha);
      linha = palavra;
    } else {
      linha = teste;
    }
  }
  if (linha) linhasDeclaracao.push(linha);
  linhasDeclaracao.forEach((texto, index) => {
    const isLast = index === linhasDeclaracao.length - 1;
    if (isLast) {
      page.drawText(texto, { x: margin, y, size: fontSize, font, color: rgb(0.16, 0.18, 0.23) });
    } else {
      const words = texto.split(" ");
      const textWidth = font.widthOfTextAtSize(texto, fontSize);
      const extra = words.length > 1 ? (maxWidth - textWidth) / (words.length - 1) : 0;
      let x = margin;
      words.forEach((word) => {
        page.drawText(word, { x, y, size: fontSize, font, color: rgb(0.16, 0.18, 0.23) });
        x += font.widthOfTextAtSize(word, fontSize) + extra;
      });
    }
    y -= 16;
  });
  y -= 10;
  page.drawText("Por ser verdade, firmamos o presente atestado.", { x: margin, y, size: 10.5, font, color: rgb(0.16, 0.18, 0.23) });
  y -= 48;
  page.drawText("Belo Horizonte/MG, " + new Date().toLocaleDateString("pt-BR") + ".", { x: margin, y, size: 10.5, font, color: rgb(0.16, 0.18, 0.23) });
  y -= 72;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 300, y }, thickness: 0.8, color: rgb(0.2, 0.22, 0.3) });
  page.drawText("J DIMAS GONÇALVES", { x: margin, y: y - 16, size: 11, font: bold, color: rgb(0.08, 0.09, 0.16) });
  page.drawText("ESCRITÓRIO DE ADVOCACIA", { x: margin, y: y - 32, size: 9, font, color: rgb(0.35, 0.38, 0.45) });
  const bytes = await pdf.save();
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open("about:blank", "_blank");
  if (win && !win.closed) { win.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); return true; }
  const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = "atestado-comparecimento.pdf"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); return true;
}
/** Abre o recibo em nova guia. O alvo é criado ANTES do await para evitar bloqueio de popup em celulares. */
export async function printFinancialRecord(rec: RegistroFinanceiro) {
  const win = window.open("about:blank", "_blank");

  if (win) {
    win.document.write(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparando impressão…</title><style>html,body{margin:0;width:100%;height:100%;background:#fff;color:#222;font-family:Arial,sans-serif}main{height:100%;display:grid;place-items:center;font-size:15px}</style></head><body><main>Preparando impressão…</main></body></html>`);
    win.document.close();
  }

  try {
    const blob = await buildFinancialRecordPdf(rec);
    const url = URL.createObjectURL(blob);

    if (win && !win.closed) {
      win.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return true;
    }

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.download = `recibo-financeiro-${rec.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (error) {
    if (win && !win.closed) {
      win.document.body.innerHTML = `<main style="height:100%;display:grid;place-items:center;padding:24px;text-align:center;font-family:Arial,sans-serif"><div><strong>Não foi possível preparar a impressão.</strong><br><small>Feche esta janela e tente novamente.</small></div></main>`;
    }
    console.error("Erro ao gerar recibo financeiro", error);
    return false;
  }
}
