import { openPrintDocument } from "./print-doc";
// Printable expense voucher (comprovante de despesa) with signature lines.
import { formatBRL } from "@/lib/documents";

export type ExpenseVoucher = {
  descricao: string;
  categoria: string;
  valor: number;
  data_despesa: string;
  responsavel_pagamento?: string | null;
  comprovante_url?: string | null;
};

function esc(v: unknown) {
  return String(v ?? "—").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

function br(d: string) {
  const [y, m, day] = d.split("-");
  return day ? `${day}/${m}/${y}` : d;
}

export function printExpenseVoucher(e: ExpenseVoucher) {
  const isSalario = (e.categoria ?? "").toLowerCase().startsWith("sal");
  const now = new Date().toLocaleString("pt-BR");

  const signatures = `
  <div class="sigs">
    <div class="sig">
      <div class="line"></div>
      <strong>${esc(e.responsavel_pagamento || "Responsável pelo pagamento")}</strong>
      <span>Responsável pelo pagamento</span>
    </div>
    ${
      isSalario
        ? `<div class="sig">
      <div class="line"></div>
      <strong>Quem recebe o pagamento</strong>
      <span>Assinatura do recebedor (Salários)</span>
    </div>`
        : ""
    }
  </div>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Comprovante de Despesa</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:28px}
  .head{text-align:center;border-bottom:1px solid #cbd5e1;padding-bottom:10px;margin-bottom:18px}
  .head span{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#475569}
  .head h1{font-size:20px;margin:6px 0 0}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
  th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}
  th{background:#e2e8f0;width:35%}
  .total{font-size:22px;font-weight:bold}
  p.decl{font-size:12px;line-height:1.6;margin:18px 0 40px}
  .sigs{display:flex;gap:40px;margin-top:50px}
  .sig{flex:1;text-align:center}
  .sig .line{border-top:1px solid #0f172a;margin-bottom:6px}
  .sig strong{display:block;font-size:12px}
  .sig span{display:block;font-size:10px;color:#475569}
  footer{margin-top:36px;font-size:10px;color:#64748b;text-align:center}
  @page{margin:16mm}
</style></head><body>
<div class="head"><span>Sistema de Gestão de Casos e Financeiro</span><h1>COMPROVANTE DE DESPESA</h1></div>
<table>
  <tr><th>Descrição</th><td>${esc(e.descricao)}</td></tr>
  <tr><th>Categoria</th><td>${esc(e.categoria)}</td></tr>
  <tr><th>Data da Despesa</th><td>${esc(br(e.data_despesa))}</td></tr>
  <tr><th>Responsável pelo Pagamento</th><td>${esc(e.responsavel_pagamento)}</td></tr>
  <tr><th>Valor</th><td class="total">${esc(formatBRL(Number(e.valor)))}</td></tr>
</table>
<p class="decl">Declaro para os devidos fins que foi efetuado o pagamento no valor de <strong>${esc(formatBRL(Number(e.valor)))}</strong>, referente a <strong>${esc(e.descricao)}</strong> (${esc(e.categoria)}), na data de <strong>${esc(br(e.data_despesa))}</strong>.${isSalario ? " O recebedor abaixo assinado confirma o recebimento integral do valor." : ""}</p>
${signatures}
<footer>Emitido em ${esc(now)}</footer>
</body></html>`;

  return openPrintDocument(html);
}
