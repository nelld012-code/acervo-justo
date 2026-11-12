// Supabase Edge Function — DJEN nacional para OAB/MG 37.610.
// Executada pelo Supabase Cron. Cria apenas rascunhos; nunca calcula prazo automaticamente.
// Autenticacao propria: header x-cron-secret (verify_jwt=false em supabase/config.toml).

const CNJ_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const OAB_NUMERO = "37610";
const OAB_UF = "MG";
const PAGE_SIZE = 100;
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

function getDatabaseSecretKey(): string {
  // Supabase 2026: prefere a chave secreta nomeada; mantem compatibilidade com service_role legado.
  const namedKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      throw new Error("SUPABASE_SECRET_KEYS nao contem JSON valido.");
    }
  }

  return Deno.env.get("SUPABASE_SECRET_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? "";
}

function databaseHeaders(databaseSecretKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: databaseSecretKey,
  };
  if (databaseSecretKey.startsWith("eyJ")) {
    headers.Authorization = "Bearer " + databaseSecretKey;
  }
  return headers;
}

async function recordSyncFailure(
  supabaseUrl: string,
  databaseSecretKey: string,
  startDate: string,
  endDate: string,
  reason: string,
  found: number,
): Promise<void> {
  try {
    const endpoint = supabaseUrl.replace(/\/+$/, "") + "/rest/v1/djen_sync_runs";
    await fetch(endpoint, {
      method: "POST",
      headers: {
        ...databaseHeaders(databaseSecretKey),
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        inicio: startDate,
        fim: endDate,
        origem: "supabase-edge-cron",
        encontrados: found,
        inseridos: 0,
        rascunhos: 0,
        erro: reason.slice(0, 800),
        finished_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // O registro de erro nunca deve encobrir a falha original da coleta.
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Metodo nao permitido." }, 405);
  }

  const cronSecret = Deno.env.get("DJEN_CRON_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(cronSecret, suppliedSecret)) {
    return json({ error: "Nao autorizado." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const databaseSecretKey = getDatabaseSecretKey();
  if (!supabaseUrl || !databaseSecretKey) {
    return json({ error: "Configuracao interna do Supabase incompleta." }, 503);
  }

  const endDate = todayInSaoPaulo();
  const startDate = shiftDate(endDate, -LOOKBACK_DAYS);
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

      const upstream = await fetch(CNJ_URL + "?" + params.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!upstream.ok) {
        await recordSyncFailure(supabaseUrl, databaseSecretKey, startDate, endDate, "CNJ HTTP " + upstream.status, collected.length);
        return json({
          error: "A consulta ao servico do CNJ falhou.",
          upstreamStatus: upstream.status,
          detail: (await upstream.text()).slice(0, 400),
          bancoAlterado: false,
        }, 502);
      }

      const result = await upstream.json() as CnjResponse;
      const pageItems = Array.isArray(result.items) ? result.items : [];
      if (result.count !== undefined) {
        const reportedTotal = Number(result.count);
        if (!Number.isFinite(reportedTotal) || reportedTotal < 0) {
          await recordSyncFailure(supabaseUrl, databaseSecretKey, startDate, endDate, "CNJ retornou quantidade invalida", collected.length);
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
      await recordSyncFailure(supabaseUrl, databaseSecretKey, startDate, endDate, "Paginacao CNJ incompleta", collected.length);
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

    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    if (dryRun) {
      return json({
        dryRun: true,
        oab: OAB_UF + " " + OAB_NUMERO,
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

    const headers = databaseHeaders(databaseSecretKey);
    const rpcUrl = supabaseUrl.replace(/\/+$/, "") + "/rest/v1/rpc/djen_ingest";
    const rpc = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_items: rows,
        p_inicio: startDate,
        p_fim: endDate,
        p_origem: "supabase-edge-cron",
      }),
      signal: AbortSignal.timeout(60000),
    });

    const responseText = await rpc.text();
    if (!rpc.ok) {
      await recordSyncFailure(supabaseUrl, databaseSecretKey, startDate, endDate, "RPC djen_ingest HTTP " + rpc.status, collected.length);
      return json({
        error: "O banco recusou a importacao DJEN.",
        status: rpc.status,
        detail: responseText.slice(0, 800),
        bancoAlterado: false,
      }, 502);
    }

    let ingest: unknown;
    try {
      ingest = JSON.parse(responseText);
    } catch {
      ingest = responseText;
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
    await recordSyncFailure(supabaseUrl, databaseSecretKey, startDate, endDate, message, collected.length);
    return json({
      error: message,
      bancoAlterado: false,
    }, 502);
  }
});
