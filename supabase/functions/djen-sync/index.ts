import { createClient } from "npm:@supabase/supabase-js@2";

// Supabase Edge Function — DJEN nacional para OAB/MG 37.610.
// Executada pelo Supabase Cron. Cria apenas rascunhos; nunca calcula prazo automaticamente.
// Autenticacao propria: header x-cron-secret (verify_jwt=false em supabase/config.toml).

const CNJ_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const OAB_NUMERO = "37610";
const OAB_UF = "MG";
const PAGE_SIZE = 50; // Limite conservador aceito pela API pública do CNJ.
const MAX_PAGES = 10;
const LOOKBACK_DAYS = 7;

type CnjItem = Record<string, unknown>;
type CnjResponse = { count?: number | string; items?: CnjItem[] };

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result.length ? result : null;
};

function firstText(item: CnjItem, ...keys: string[]): string | null {
  for (const key of keys) {
    const result = asText(item[key]);
    if (result) return result;
  }
  return null;
}

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function communicationHash(item: CnjItem): Promise<string> {
  const id = firstText(item, "id");
  if (id) return await sha256("djen:" + id);

  const processNumber = firstText(item, "numeroprocessocommascara", "numero_processo", "numeroProcesso") ?? "";
  const availableDate = firstText(item, "data_disponibilizacao", "dataDisponibilizacao") ?? "";
  const body = normalizeText(String(item.texto ?? ""));
  return await sha256("p:" + processNumber + "|d:" + availableDate + "|t:" + body);
}

function todayInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (name: string) => parts.find((entry) => entry.type === name)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

function shiftDate(date: string, offsetDays: number): string {
  const value = new Date(date + "T12:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-DJEN-Function-Region": Deno.env.get("SB_REGION") ?? "unknown",
    },
  });
}

function safeEqual(expected: string, received: string): boolean {
  if (!expected || !received || expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}

type AdminDb = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

async function recordSyncFailure(
  admin: AdminDb,
  startDate: string,
  endDate: string,
  reason: string,
  found: number,
): Promise<void> {
  try {
    const { error } = await admin.from("djen_sync_runs").insert({
      inicio: startDate,
      fim: endDate,
      origem: "supabase-edge-cron",
      encontrados: found,
      inseridos: 0,
      rascunhos: 0,
      erro: reason.slice(0, 800),
      finished_at: new Date().toISOString(),
    });
    if (error) console.error("[djen-sync] Nao foi possivel registrar a falha:", error.message);
  } catch {
    // O registro de erro nunca deve encobrir a falha original da coleta.
  }
}

async function djenSyncHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Metodo nao permitido." }, 405);
  }

  const cronSecret = Deno.env.get("DJEN_CRON_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(cronSecret, suppliedSecret)) {
    return json({ error: "Nao autorizado." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}";
  let secretKeys: Record<string, string> = {};
  try {
    secretKeys = JSON.parse(secretKeysRaw) as Record<string, string>;
  } catch {
    return json({ error: "Configuracao de chaves internas do Supabase invalida." }, 503);
  }
  const adminKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !adminKey) {
    return json({ error: "Configuracao interna do Supabase incompleta." }, 503);
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as AdminDb;

  const endDate = todayInSaoPaulo();
  const startDate = shiftDate(endDate, -LOOKBACK_DAYS);
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const collected: CnjItem[] = [];
  let total = 0;

  try {
    let paginationComplete = false;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        numeroOab: OAB_NUMERO,
        ufOab: OAB_UF,
        dataDisponibilizacaoInicio: startDate,
        dataDisponibilizacaoFim: endDate,
        pagina: String(page),
        itensPorPagina: String(PAGE_SIZE),
      });

      // Repetir somente falhas transitórias. HTTP 403 não é contornado: é
      // reportado para diagnóstico de bloqueio/região ou política do CNJ.
      let upstream: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        upstream = await fetch(CNJ_URL + "?" + params.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (![429, 500, 502, 503, 504].includes(upstream.status) || attempt === 2) break;
        const retryAfter = Number(upstream.headers.get("retry-after") ?? "");
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10000)
          : (attempt + 1) * 1500;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      if (!upstream || !upstream.ok) {
        const status = upstream?.status ?? 0;
        const detail = upstream ? (await upstream.text()).slice(0, 400) : "Sem resposta do CNJ";
        const diagnostic = "CNJ HTTP " + status + " | regiao_funcao=" +
          (Deno.env.get("SB_REGION") ?? "unknown") + " | " + detail;
        if (!dryRun) await recordSyncFailure(admin, startDate, endDate, diagnostic, collected.length);
        return json({
          error: "A consulta ao servico do CNJ falhou.",
          upstreamStatus: status,
          functionRegion: Deno.env.get("SB_REGION") ?? "unknown",
          rateLimitRemaining: upstream?.headers.get("x-ratelimit-remaining") ?? null,
          detail,
          bancoAlterado: false,
        }, 502);
      }

      const result = await upstream.json() as CnjResponse;
      if (!Array.isArray(result.items)) {
        if (!dryRun) await recordSyncFailure(admin, startDate, endDate, "Resposta CNJ sem array items", collected.length);
        return json({ error: "O CNJ retornou um formato inesperado; nenhum dado foi gravado.", bancoAlterado: false }, 502);
      }
      const pageItems = result.items;
      if (result.count !== undefined) {
        const reportedTotal = Number(result.count);
        if (!Number.isFinite(reportedTotal) || reportedTotal < 0) {
          if (!dryRun) await recordSyncFailure(admin, startDate, endDate, "CNJ retornou quantidade invalida", collected.length);
          return json({ error: "O CNJ retornou uma quantidade invalida.", bancoAlterado: false }, 502);
        }
        total = reportedTotal;
      }

      collected.push(...pageItems);

      if (pageItems.length < PAGE_SIZE || (total > 0 && collected.length >= total)) {
        paginationComplete = true;
        break;
      }
    }

    if (!paginationComplete || (total > 0 && collected.length < total)) {
      if (!dryRun) await recordSyncFailure(admin, startDate, endDate, "Paginacao CNJ incompleta", collected.length);
      return json({
        error: "A paginacao do CNJ ficou incompleta; nenhum dado foi gravado.",
        totalCNJ: total,
        recebidos: collected.length,
        limitePaginas: MAX_PAGES,
        bancoAlterado: false,
      }, 502);
    }

    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for (const item of collected) {
      const hash = await communicationHash(item);
      if (seen.has(hash)) continue;
      seen.add(hash);

      const processNumber = firstText(item, "numeroprocessocommascara", "numero_processo", "numeroProcesso");
      const tribunal = firstText(item, "siglaTribunal", "sigla_tribunal");
      const organ = firstText(item, "nomeOrgao", "nome_orgao");
      const communicationType = firstText(item, "tipoComunicacao", "tipo_comunicacao");
      const documentType = firstText(item, "tipoDocumento", "tipo_documento");
      const communicationDate = firstText(item, "data_disponibilizacao", "dataDisponibilizacao");
      const link = firstText(item, "link");
      const bodyText = String(item.texto ?? "");
      const rawId = firstText(item, "id");
      const numericId = rawId && /^\d+$/.test(rawId) && Number.isSafeInteger(Number(rawId))
        ? Number(rawId)
        : null;

      const excerpt = normalizeText(bodyText).slice(0, 280);
      const observation = [
        "Pendente de revisao — gerado da intimacao DJEN de " + (communicationDate?.slice(0, 10) ?? "data nao informada"),
        organ,
        link,
        excerpt ? "Trecho: " + excerpt : null,
      ].filter(Boolean).join(" • ");

      rows.push({
        hash,
        djen_id: numericId,
        numero_processo: processNumber,
        sigla_tribunal: tribunal,
        orgao: organ,
        tipo_comunicacao: communicationType,
        tipo_documento: documentType,
        meio: firstText(item, "meiocompleto", "meio"),
        data_disponibilizacao: communicationDate?.slice(0, 10) ?? null,
        link,
        destinatarios: item.destinatarios ?? null,
        advogados: item.destinatarioadvogados ?? item.advogados ?? null,
        texto: bodyText,
        payload: item,
        observacao: observation,
      });
    }

    if (dryRun) {
      return json({
        dryRun: true,
        oab: OAB_UF + " " + OAB_NUMERO,
        functionRegion: Deno.env.get("SB_REGION") ?? "unknown",
        pageSize: PAGE_SIZE,
        dataInicio: startDate,
        dataFim: endDate,
        totalCNJ: total,
        recebidos: collected.length,
        unicos: rows.length,
        amostras: rows.slice(0, 3).map((row) => ({
          numero_processo: row.numero_processo,
          sigla_tribunal: row.sigla_tribunal,
          orgao: row.orgao,
          data_disponibilizacao: row.data_disponibilizacao,
          tipo_comunicacao: row.tipo_comunicacao,
          texto_caracteres: String(row.texto).length,
        })),
        bancoAlterado: false,
      });
    }

    const { data: ingest, error: ingestError } = await admin.rpc("djen_ingest", {
      p_items: rows,
      p_inicio: startDate,
      p_fim: endDate,
      p_origem: "supabase-edge-cron",
    });

    if (ingestError) {
      if (!dryRun) await recordSyncFailure(admin, startDate, endDate, "RPC djen_ingest: " + ingestError.message, collected.length);
      return json({
        error: "O banco recusou a importacao DJEN.",
        detail: ingestError.message.slice(0, 800),
        bancoAlterado: false,
      }, 502);
    }

    return json({
      ok: true,
      oab: OAB_UF + " " + OAB_NUMERO,
      dataInicio: startDate,
      dataFim: endDate,
      totalCNJ: total,
      recebidos: collected.length,
      unicos: rows.length,
      bancoAlterado: true,
      ingest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dryRun) await recordSyncFailure(admin, startDate, endDate, message, collected.length);
    return json({
      error: message,
      bancoAlterado: false,
    }, 502);
  }
}
Deno.serve(async (request: Request) => {
  try {
    return await djenSyncHandler(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[djen-sync] Erro nao tratado:", message);
    return json({ error: "Falha interna ao executar a sincronizacao DJEN." }, 500);
  }
});
