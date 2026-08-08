import { openPrintDocument } from "./print-doc";
// Generic client-side printable report generator (no API/PDF service needed).
export type PrintSection = {
  heading?: string;
  columns: string[];
  rows: (string | number)[][];
};

function esc(v: unknown) {
  return String(v ?? "—").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

export function printReport(opts: {
  title: string;
  subtitle?: string;
  summary?: { label: string; value: string }[];
  sections: PrintSection[];
}) {
  const now = new Date().toLocaleString("pt-BR");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>${esc(opts.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px}
  h1{font-size:20px;margin:0 0 4px}
  .sub{font-size:12px;color:#475569;margin:0 0 16px}
  h2{font-size:14px;margin:20px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#e2e8f0}
  .summary{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px}
  .card{border:1px solid #cbd5e1;padding:8px 12px;min-width:150px}
  .card span{display:block;font-size:10px;color:#475569;text-transform:uppercase}
  .card strong{font-size:15px}
  footer{margin-top:24px;font-size:10px;color:#64748b}
  @page{margin:14mm}
</style></head><body>
<h1>${esc(opts.title)}</h1>
<p class="sub">${opts.subtitle ? esc(opts.subtitle) + " · " : ""}Gerado em ${esc(now)}</p>
${
  opts.summary?.length
    ? `<div class="summary">${opts.summary
        .map((s) => `<div class="card"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`)
        .join("")}</div>`
    : ""
}
${opts.sections
  .map(
    (sec) => `${sec.heading ? `<h2>${esc(sec.heading)}</h2>` : ""}
<table><thead><tr>${sec.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${
      sec.rows.length
        ? sec.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${sec.columns.length}">Nenhum registro.</td></tr>`
    }</tbody></table>`,
  )
  .join("")}
<footer>Sistema de Gestão de Casos e Financeiro</footer>
</body></html>`;

  // Use a hidden iframe: reliable inside embedded previews where window.open is blocked.
  return openPrintDocument(html);
}
