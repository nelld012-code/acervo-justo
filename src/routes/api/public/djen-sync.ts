import { createFileRoute } from "@tanstack/react-router";
import { deduplicar, type DjenItem } from "@/lib/djen";

function autorizado(request: Request) {
  const secret = process.env.DJEN_CRON_SECRET ?? "";
  const recebido = request.headers.get("x-cron-secret") ?? "";
  if (!secret || !recebido || secret.length !== recebido.length) return false;

  let diff = 0;
  for (let index = 0; index < secret.length; index++) {
    diff |= secret.charCodeAt(index) ^ recebido.charCodeAt(index);
  }
  return diff === 0;
}

export const Route = createFileRoute("/api/public/djen-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!autorizado(request)) return new Response("Unauthorized", { status: 401 });

        let body: {
          items?: DjenItem[];
          total?: number;
          dataInicio?: string;
          dataFim?: string;
          origem?: string;
          coletadoEm?: string;
        };

        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (!Array.isArray(body.items) || body.items.length > 1000) {
          return Response.json({ error: "Expected an items array with at most 1000 entries" }, { status: 400 });
        }

        const rows = await deduplicar(body.items);
        const rawCount = Number(body.total ?? body.items.length);
        const total = Number.isFinite(rawCount) && rawCount >= 0 ? rawCount : body.items.length;

        // Dry-run is available only to the trusted Brazil-region collector.
        if (new URL(request.url).searchParams.get("dryRun") === "1") {
          return Response.json({
            dryRun: true,
            recebidos: body.items.length,
            unicos: rows.length,
            totalCNJ: total,
            periodo: { inicio: body.dataInicio ?? null, fim: body.dataFim ?? null },
            amostra: rows.slice(0, 3).map(({ payload: _payload, ...row }) => row),
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as unknown as {
          from: (table: string) => {
            upsert: (values: unknown[], options: { onConflict: string; ignoreDuplicates: boolean }) => {
              select: (columns: string) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
            };
            insert: (value: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
          };
        };

        let inserted = 0;
        let errorMessage: string | null = null;

        if (rows.length > 0) {
          const { data, error } = await db
            .from("intimacoes_djen")
            .upsert(rows, { onConflict: "hash", ignoreDuplicates: true })
            .select("id");

          if (error) errorMessage = error.message;
          else inserted = data?.length ?? 0;
        }

        const logError = await db.from("djen_sync_runs").insert({
          inicio: body.dataInicio ?? null,
          fim: body.dataFim ?? null,
          encontrados: body.items.length,
          total_cnj: total,
          inseridos: inserted,
          erro: errorMessage,
          origem: body.origem ?? "vercel-gru1",
          finished_at: new Date().toISOString(),
        });

        if (logError.error && !errorMessage) errorMessage = logError.error.message;

        return Response.json(
          {
            ok: errorMessage === null,
            recebidos: body.items.length,
            unicos: rows.length,
            totalCNJ: total,
            inseridos: inserted,
            erro: errorMessage,
          },
          { status: errorMessage ? 502 : 200 },
        );
      },
    },
  },
});
