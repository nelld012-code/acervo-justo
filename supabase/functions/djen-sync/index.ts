// Supabase Edge Function — DJEN nacional para OAB/MG 37.610.
// Não calcula prazos: cria somente rascunhos sem parte, vencimento ou lembretes.
// Protegida por DJEN_CRON_SECRET (header x-cron-secret).
const CNJ_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const LOOKBACK_DAYS = 3;

type Item = Record<string, unknown>;
const str = (v: unknown): string | null => v == null || String(v).trim() === "" ? null : String(v).trim();
const normalize = (v: string) => v.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim().toLowerCase();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function itemHash(item: Item): Promise<string> {
  const id = str(item.id);
  if (id) return await sha256(`djen:${id}`);
  return await sha256(`p:${str(item.numeroprocessocommascara) ?? str(item.numero_processo) ?? ""}|d:${str(item.data_disponibilizacao) ?? ""}|t:${normalize(String(item.texto ?? ""))}`);
}
function todaySP(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function shiftDate(day: string, offset: number): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("DJEN_CRON_SECRET") ?? "";
  if (!safeEqual(secret, req.headers.get("x-cron-secret") ?? "")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Missing Supabase environment configuration" }, 503);

  const end = todaySP();
  const start = shiftDate(end, -LOOKBACK_DAYS);
  const collected: Item[] = [];
  let total = 0;
  try {
    let exhausted = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        numeroOab: "37610", ufOab: "MG",
        dataDisponibilizacaoInicio: start, dataDisponibilizacaoFim: end,
        pagina: String(page), itensPorPagina: String(PAGE_SIZE),
      });
      const upstream = await fetch(`${CNJ_URL}?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) return json({ error: "CNJ request failed", upstreamStatus: upstream.status, detail: (await upstream.text()).slice(0, 500) }, 502);
      const result = await upstream.json() as { count?: number; items?: Item[] };
      const pageItems = Array.isArray(result.items) ? result.items : [];
      total = Number(result.count ?? total);
      collected.push(...pageItems);
      if (pageItems.length < PAGE_SIZE || (total > 0 && collected.length >= total)) {
        exhausted = true;
        break;
      }
    }
    if (!exhausted || total > collected.length) {
      return json({ error: "Pagination incomplete; database was not changed", totalCNJ: total, received: collected.length, maxPages: MAX_PAGES }, 502);
    }

    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const item of collected) {
      const hash = await itemHash(item);
      if (seen.has(hash)) continue;
      seen.add(hash);
      const processNumber = str(item.numeroprocessocommascara) ?? str(item.numero_processo);
      const tribunal = str(item.siglaTribunal);
      const organ = str(item.nomeOrgao);
      const type = str(item.tipoComunicacao);
      const date = str(item.data_disponibilizacao)?.slice(0, 10) ?? null;
      const link = str(item.link);
      const text = String(item.texto ?? "");
      const summary = normalize(text).slice(0, 280);
      const observation = [
        `Pendente de revisão — gerado da intimação DJEN de ${date ?? "data não informada"}`,
        organ, link, summary ? `Trecho: ${summary}` : null,
      ].filter(Boolean).join(" • ");
      rows.push({
        hash,
        djen_id: item.id != null && /^\\d+$/.test(String(item.id)) ? Number(item.id) : null,
        numero_processo: processNumber,
        sigla_tribunal: tribunal,
        orgao: organ,
        tipo_comunicacao: type,
        tipo_documento: str(item.tipoDocumento),
        meio: str(item.meiocompleto) ?? str(item.meio),
        data_disponibilizacao: date,
        link,
        destinatarios: item.destinatarios ?? null,
        advogados: item.destinatarioadvogados ?? null,
        texto: text,
        payload: item,
        observacao: observation,
      });
    }

    const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
    if (dryRun) return json({
      dryRun: true, oab: "MG 37610", dataInicio: start, dataFim: end,
      totalCNJ: total, recebidos: collected.length, unicos: rows.length,
      amostras: rows.slice(0, 2).map((r) => ({
        numero_processo: r.numero_processo, sigla_tribunal: r.sigla_tribunal,
        data_disponibilizacao: r.data_disponibilizacao, tipo_comunicacao: r.tipo_comunicacao,
        texto_caracteres: String(r.texto).length,
      })),
      bancoAlterado: false,
    });

    const rpc = await fetch(`${supabaseUrl.replace(/\\/$/, "")}/rest/v1/rpc/djen_ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_items: rows, p_inicio: start, p_fim: end, p_origem: "supabase-edge-cron" }),
      signal: AbortSignal.timeout(30000),
    });
    const responseText = await rpc.text();
    if (!rpc.ok) return json({ error: "Database ingest failed", status: rpc.status, detail: responseText.slice(0, 1000) }, 502);
    let ingest: unknown;
    try { ingest = JSON.parse(responseText); } catch { ingest = responseText; }
    return json({ ok: true, oab: "MG 37610", dataInicio: start, dataFim: end, totalCNJ: total, recebidos: collected.length, unicos: rows.length, bancoAlterado: true, ingest });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), bancoAlterado: false }, 502);
  }
});
