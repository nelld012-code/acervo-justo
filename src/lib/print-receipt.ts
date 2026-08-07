// Standalone printable receipt (2 vias per A4, black & white) rendered in a hidden iframe.
import { formatBRL } from "@/lib/documents";

export type ReceiptPrintData = {
  numero_processo: string;
  cliente: string;
  data_pagamento: string;
  valor: number;
  metodo_pagamento: string;
  responsavel_recebimento: string;
  descricao?: string | null;
};

function esc(v: unknown) {
  return String(v ?? "—").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

function brDate(value: string) {
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
  const [y, m, day] = String(value).split("-");
  return day ? `${day}/${m}/${y}` : String(value);
}

function via(data: ReceiptPrintData, label: string, emitido: string) {
  const valor = formatBRL(Number(data.valor));
  const dataPg = brDate(data.data_pagamento);
  return `<section class="via">
  <header>
    <span class="sys">Sistema de Gestão Judicial</span>
    <h1>RECIBO DE PAGAMENTO</h1>
    <span class="sys">${esc(label)}</span>
  </header>
  <table>
    <tr><th>Número do Processo</th><td>${esc(data.numero_processo)}</td>
        <th>Cliente</th><td>${esc(data.cliente)}</td></tr>
    <tr><th>Data do Pagamento</th><td>${esc(dataPg)}</td>
        <th>Forma de Pagamento</th><td>${esc(data.metodo_pagamento)}</td></tr>
    <tr><th>Valor Recebido</th><td colspan="3" class="total">${esc(valor)}</td></tr>
    <tr><th>Descrição</th><td colspan="3">${esc(data.descricao || "—")}</td></tr>
  </table>
  <p class="decl">Declaro para os devidos fins que recebi a importância de <strong>${esc(valor)}</strong>,
  referente ao processo nº <strong>${esc(data.numero_processo)}</strong>, pago pelo(a) cliente
  <strong>${esc(data.cliente)}</strong> na data de <strong>${esc(dataPg)}</strong>.</p>
  <div class="sigs">
    <div class="sig"><div class="line"></div><strong>${esc(data.responsavel_recebimento)}</strong><span>Recebi(emos) o valor acima descrito</span></div>
    <div class="sig"><div class="line"></div><strong>${esc(data.cliente)}</strong><span>Paguei(amos) o valor acima descrito</span></div>
  </div>
  <footer>Emitido em ${esc(emitido)}</footer>
</section>`;
}

export function printReceipt(data: ReceiptPrintData) {
  const emitido = new Date().toLocaleString("pt-BR");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Recibo de Pagamento</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;color:#000}
  body{font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .via{border:1px solid #000;padding:6mm 7mm;margin:0 0 4mm;page-break-inside:avoid;break-inside:avoid}
  .via header{text-align:center;border-bottom:1px solid #000;padding-bottom:5px;margin-bottom:10px}
  .via header .sys{display:block;font-size:9px;letter-spacing:1.5px;text-transform:uppercase}
  .via header h1{font-size:16px;margin:4px 0}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #000;padding:5px 6px;text-align:left;vertical-align:top}
  th{width:18%;font-weight:bold;background:#fff}
  td{width:32%}
  .total{font-size:16px;font-weight:bold}
  .decl{font-size:11px;line-height:1.5;margin:10px 0 0}
  .sigs{display:flex;gap:24px;margin-top:16mm}
  .sig{flex:1;text-align:center}
  .sig .line{border-top:1px solid #000;margin-bottom:4px}
  .sig strong{display:block;font-size:11px}
  .sig span{display:block;font-size:9px}
  footer{margin-top:8px;font-size:9px;text-align:center}
  @page{size:A4 portrait;margin:8mm}
  @media print{ .via{page-break-inside:avoid;break-inside:avoid} }
</style></head><body>
${via(data, "1ª via — Escritório", emitido)}
${via(data, "2ª via — Cliente", emitido)}
</body></html>`;

  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.srcdoc = html;
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.focus();
      win.print();
      setTimeout(() => iframe.remove(), 60000);
    };
    document.body.appendChild(iframe);
    return true;
  } catch {
    return false;
  }
}
