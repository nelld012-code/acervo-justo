declare const process: { env: Record<string, string | undefined> };

type VercelRequest = { method?: string; query?: Record<string, string | string[] | undefined> };
type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

const CNJ_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const LOOKBACK_DAYS = 7;

function dateInSaoPaulo(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return pick("year") + "-" + pick("month") + "-" + pick("day");
}

function shiftDate(ymd: string, days: number): string {
  const date = new Date(ymd + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Temporary diagnostic available only on Vercel Preview.
// It reads CNJ and calls the Acervo receiver in dryRun mode; no database writes.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (process.env.VERCEL_ENV !== "preview") return res.status(404).json({ error: "Not found" });

  const syncSecret = process.env.DJEN_SYNC_SECRET ?? "";
  const acervoUrl = (process.env.ACERVO_JUSTO_URL ?? "https://acervo-justo.lovable.app").replace(/\/$/, "");
  if (!syncSecret || !acervoUrl) {
    return res.status(200).json({
      ok: false,
      error: "Missing required preview environment variables",
      missing: [!syncSecret ? "DJEN_SYNC_SECRET" : null, !acervoUrl ? "ACERVO_JUSTO_URL" : null].filter(Boolean),
      bancoAlterado: false,
    });
  }

  const runOnce = String(req.query?.runOnce ?? "") === "1";
  const dataFim = dateInSaoPaulo(new Date());
  const dataInicio = shiftDate(dataFim, -LOOKBACK_DAYS);
  const items: unknown[] = [];
  let total = 0;

  try {
    let paginationComplete = false;
    let lastRateLimit: string | null = null;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        numeroOab: "37610",
        ufOab: "MG",
        dataDisponibilizacaoInicio: dataInicio,
        dataDisponibilizacaoFim: dataFim,
        pagina: String(page),
        itensPorPagina: String(PAGE_SIZE),
      });

      let upstream: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        upstream = await fetch(CNJ_URL + "?" + params.toString(), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        lastRateLimit = upstream.headers.get("x-ratelimit-remaining") ?? lastRateLimit;
        if (![429, 500, 502, 503, 504].includes(upstream.status) || attempt === 2) break;
        const retryAfter = Number(upstream.headers.get("retry-after") ?? "");
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10000)
          : (attempt + 1) * 1500;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      if (!upstream || !upstream.ok) {
        return res.status(200).json({
          ok: false,
          stage: "cnj",
          region: process.env.VERCEL_REGION ?? "unknown",
          upstreamStatus: upstream?.status ?? 0,
          rateLimitRemaining: lastRateLimit,
          detail: upstream ? (await upstream.text()).slice(0, 300) : "No response from CNJ",
          bancoAlterado: false,
        });
      }

      const body = await upstream.json() as { count?: number | string; items?: unknown[] };
      if (!Array.isArray(body.items)) {
        return res.status(200).json({
          ok: false, stage: "cnj", error: "CNJ response did not contain an items array",
          bancoAlterado: false,
        });
      }
      const reported = Number(body.count);
      if (Number.isFinite(reported) && reported >= 0) total = reported;
      items.push(...body.items);

      if (body.items.length < PAGE_SIZE || (total > 0 && items.length >= total)) {
        paginationComplete = true;
        break;
      }
    }

    if (!paginationComplete || (total > 0 && items.length < total)) {
      return res.status(200).json({
        ok: false, stage: "pagination", totalCNJ: total, recebidos: items.length,
        limitePaginas: MAX_PAGES, bancoAlterado: false,
      });
    }

    const receiverUrl = acervoUrl + "/api/public/djen-sync" + (runOnce ? "" : "?dryRun=1");
    const receiver = await fetch(receiverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": syncSecret,
      },
      body: JSON.stringify({
        items,
        total,
        dataInicio,
        dataFim,
        origem: runOnce ? "vercel-gru1-initial-import" : "vercel-gru1-dry-run",
        coletadoEm: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const receiverText = await receiver.text();
    let receiverBody: unknown = receiverText.slice(0, 500);
    try { receiverBody = JSON.parse(receiverText); } catch { /* keep short text only */ }

    return res.status(200).json({
      ok: receiver.ok,
      mode: runOnce ? "one-time-import" : "dry-run",
      stage: "receiver",
      region: process.env.VERCEL_REGION ?? "unknown",
      periodo: { inicio: dataInicio, fim: dataFim },
      upstreamStatus: 200,
      rateLimitRemaining: lastRateLimit,
      totalCNJ: total,
      recebidos: items.length,
      receiverStatus: receiver.status,
      receiver: receiverBody,
      bancoAlterado: runOnce && receiver.ok,
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      stage: "exception",
      region: process.env.VERCEL_REGION ?? "unknown",
      error: error instanceof Error ? error.message : String(error),
      bancoAlterado: false,
    });
  }
}
