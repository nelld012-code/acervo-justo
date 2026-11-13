declare const process: { env: Record<string, string | undefined> };

type VercelRequest = { method?: string };
type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

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

// Temporary read-only diagnostic. It never forwards or stores CNJ items.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const fim = dateInSaoPaulo(new Date());
  const inicio = shiftDate(fim, -7);
  const params = new URLSearchParams({
    numeroOab: "37610",
    ufOab: "MG",
    dataDisponibilizacaoInicio: inicio,
    dataDisponibilizacaoFim: fim,
    pagina: "1",
    itensPorPagina: "50",
  });

  try {
    const response = await fetch("https://comunicaapi.pje.jus.br/api/v1/comunicacao?" + params.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    let count: number | null = null;
    let receivedItems: number | null = null;
    try {
      const body = JSON.parse(raw) as { count?: number | string; items?: unknown[] };
      const parsedCount = Number(body.count);
      count = Number.isFinite(parsedCount) ? parsedCount : null;
      receivedItems = Array.isArray(body.items) ? body.items.length : null;
    } catch {
      // Preserve only a short error excerpt below; never return case data.
    }

    return res.status(200).json({
      ok: response.ok,
      service: "djen-cnj-read-only-diagnostic",
      region: process.env.VERCEL_REGION ?? "unknown",
      periodo: { inicio, fim },
      upstreamStatus: response.status,
      contentType: response.headers.get("content-type"),
      rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
      totalCNJ: count,
      itemsPagina1: receivedItems,
      errorDetail: response.ok ? null : raw.slice(0, 300),
      bancoAlterado: false,
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      service: "djen-cnj-read-only-diagnostic",
      region: process.env.VERCEL_REGION ?? "unknown",
      error: error instanceof Error ? error.message : String(error),
      bancoAlterado: false,
    });
  }
}
