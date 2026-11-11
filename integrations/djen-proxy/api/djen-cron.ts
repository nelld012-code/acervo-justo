const CNJ_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const LOOKBACK_DAYS = 3;

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

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
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function shiftDate(ymd: string, days: number): string {
  const date = new Date(`${ymd}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET ?? "";
  const authorization = String(req.headers?.authorization ?? "");
  if (!safeEqual(authorization, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const syncSecret = process.env.DJEN_SYNC_SECRET ?? "";
  const acervoUrl = (process.env.ACERVO_JUSTO_URL ?? "https://acervo-justo.lovable.app").replace(/\/$/, "");
  if (!cronSecret || !syncSecret || !acervoUrl) {
    return res.status(503).json({ error: "Missing required environment variables" });
  }

  const fim = dateInSaoPaulo(new Date());
  const inicio = shiftDate(fim, -LOOKBACK_DAYS);
  const items: unknown[] = [];
  let total = 0;

  try {
    let paginasEsgotadas = false;
    for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
      const params = new URLSearchParams({
        numeroOab: "37610",
        ufOab: "MG",
        dataDisponibilizacaoInicio: inicio,
        dataDisponibilizacaoFim: fim,
        pagina: String(pagina),
        itensPorPagina: String(PAGE_SIZE),
      });

      const response = await fetch(`${CNJ_URL}?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        return res.status(502).json({
          error: "CNJ request failed",
          upstreamStatus: response.status,
          detail,
          region: process.env.VERCEL_REGION ?? "unknown",
        });
      }

      const body = await response.json() as { count?: number; items?: unknown[] };
      const pageItems = Array.isArray(body.items) ? body.items : [];
      total = Number(body.count ?? total);
      items.push(...pageItems);

      if (pageItems.length < PAGE_SIZE || (total > 0 && items.length >= total)) {
        paginasEsgotadas = true;
        break;
      }
    }

    if (!paginasEsgotadas || total > items.length) {
      return res.status(502).json({
        error: "Pagination limit reached; refusing an incomplete sync",
        total,
        received: items.length,
        maxPages: MAX_PAGES,
      });
    }

    const dryRun = String(req.query?.dryRun ?? "") === "1";
    if (dryRun) {
      const amostras = items.slice(0, 2).map((entry) => {
        const item = entry as Record<string, unknown>;
        const texto = String(item.texto ?? "");
        return {
          id: item.id ?? null,
          hash: item.hash ?? null,
          numeroProcesso: item.numeroprocessocommascara ?? item.numero_processo ?? null,
          siglaTribunal: item.siglaTribunal ?? item.sigla_tribunal ?? null,
          dataDisponibilizacao: item.data_disponibilizacao ?? item.datadisponibilizacao ?? null,
          nomeOrgao: item.nomeOrgao ?? item.nome_orgao ?? null,
          tipoComunicacao: item.tipoComunicacao ?? item.tipo_comunicacao ?? null,
          textoCaracteres: texto.length,
          inicioDoTexto: texto.slice(0, 180),
        };
      });
      return res.status(200).json({
        dryRun: true,
        region: process.env.VERCEL_REGION ?? "unknown",
        oab: "MG 37610",
        dataInicio: inicio,
        dataFim: fim,
        totalCNJ: total,
        recebidos: items.length,
        amostras,
        bancoAlterado: false,
      });
    }

    const sinkUrl = `${acervoUrl}/api/public/djen-sync`;
    const sink = await fetch(sinkUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": syncSecret,
      },
      body: JSON.stringify({
        items,
        total,
        dataInicio: inicio,
        dataFim: fim,
        origem: "vercel-gru1",
        coletadoEm: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(20000),
    });

    const sinkBody = await sink.text();
    if (!sink.ok) {
      return res.status(502).json({
        error: "Acervo Justo rejected the synchronization payload",
        status: sink.status,
        detail: sinkBody.slice(0, 1000),
      });
    }

    let result: unknown;
    try { result = JSON.parse(sinkBody); } catch { result = sinkBody; }
    return res.status(200).json({
      ok: true,
      region: process.env.VERCEL_REGION ?? "unknown",
      dataInicio: inicio,
      dataFim: fim,
      totalCNJ: total,
      recebidos: items.length,
      acervo: result,
    });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : String(error),
      region: process.env.VERCEL_REGION ?? "unknown",
    });
  }
}
