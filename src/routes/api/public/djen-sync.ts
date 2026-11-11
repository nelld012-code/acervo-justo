import { createFileRoute } from "@tanstack/react-router";
import { DJEN_OAB, DJEN_URL, deduplicar, type DjenItem } from "@/lib/djen";

const MAX_PAGINAS = 20;
const dia = (d: Date) => d.toISOString().slice(0, 10);

function autorizado(req: Request) {
  const secret = process.env["DJEN_CRON_SECRET"];
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!secret || got.length !== secret.length) return false;
  let diff = 0; for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/djen-sync")({
  server: { handlers: { POST: async ({ request }) => {
    if (!autorizado(request)) return new Response("Unauthorized", { status: 401 });
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const fim = new Date(); const inicio = new Date(fim.getTime() - 3 * 86400000);
    const itens: DjenItem[] = []; let erro: string | null = null;
    try {
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const q = new URLSearchParams({ ...DJEN_OAB, dataDisponibilizacaoInicio: dia(inicio), dataDisponibilizacaoFim: dia(fim), pagina: String(pagina), itensPorPagina: "100" });
        const res = await fetch(`${DJEN_URL}?${q}`, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`CNJ HTTP ${res.status}`);
        const body = (await res.json()) as { items?: DjenItem[] };
        const page = body.items ?? []; itens.push(...page);
        if (page.length < 100) break;
      }
    } catch (e) { erro = e instanceof Error ? e.message : String(e); }
    const rows = await deduplicar(itens);
    if (dryRun) return Response.json({ dryRun: true, encontrados: itens.length, unicos: rows.length, erro, amostra: rows.slice(0, 2).map(({ payload: _p, ...r }) => r) });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    let inseridos = 0;
    if (!erro && rows.length) {
      const { data, error } = await db.from("intimacoes_djen").upsert(rows, { onConflict: "hash", ignoreDuplicates: true }).select("id");
      if (error) erro = error.message; else inseridos = data?.length ?? 0;
    }
    await db.from("djen_sync_runs").insert({ inicio: dia(inicio), fim: dia(fim), encontrados: itens.length, inseridos, erro, finished_at: new Date().toISOString() });
    return Response.json({ encontrados: itens.length, inseridos, erro }, { status: erro ? 502 : 200 });
  } } },
});
