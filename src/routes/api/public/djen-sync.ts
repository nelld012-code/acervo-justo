import { createFileRoute } from "@tanstack/react-router";
import { processarSync } from "@/lib/djen";

// Recebe o lote coletado pelo proxy (busca nacional OAB 37610/MG). Tudo ou nada via djen_ingest.
export const Route = createFileRoute("/api/public/djen-sync")({
  server: { handlers: { POST: async ({ request }) => {
    let body: unknown = null;
    try { body = await request.json(); } catch { body = null; }
    const r = await processarSync({
      secret: process.env["DJEN_CRON_SECRET"],
      header: request.headers.get("x-cron-secret"),
      body,
      dryRun: new URL(request.url).searchParams.get("dryRun") === "1",
      ingest: async (rows, p) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: { inseridos?: number; rascunhos?: number } | null; error: { message: string } | null }> };
        const { data, error } = await db.rpc("djen_ingest", { p_items: rows, p_inicio: p.dataInicio, p_fim: p.dataFim, p_origem: p.origem ?? null });
        if (error) throw new Error(error.message);
        return { inseridos: Number(data?.inseridos ?? 0), rascunhos: Number(data?.rascunhos ?? 0) };
      },
    }).catch((e) => ({ status: 502, body: { error: e instanceof Error ? e.message : String(e) } }));
    return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  } } },
});
