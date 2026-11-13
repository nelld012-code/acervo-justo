import runDjenCron from "./djen-cron";

declare const process: { env: Record<string, string | undefined> };

type DiagnosticRequest = { method?: string };
type DiagnosticResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => DiagnosticResponse;
  json: (body: unknown) => void;
};

type InnerRequest = {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
};
type InnerResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => InnerResponse;
  json: (body: unknown) => void;
};

// Temporary protected-preview diagnostic.
// It invokes the real cron handler internally with dryRun=1, so it reads
// CNJ and validates the Acervo receiver but never writes to the database.
export default async function handler(req: DiagnosticRequest, res: DiagnosticResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let innerStatus = 200;
  let innerBody: unknown = null;
  const innerRes: InnerResponse = {
    setHeader: () => {},
    status: (code) => { innerStatus = code; return innerRes; },
    json: (body) => { innerBody = body; },
  };

  const innerReq: InnerRequest = {
    method: "GET",
    headers: { authorization: "Bearer " + (process.env.CRON_SECRET ?? "") },
    query: { dryRun: "1" },
  };

  try {
    await runDjenCron(innerReq, innerRes);
    return res.status(innerStatus).json(innerBody ?? {
      ok: false,
      error: "The DJEN diagnostic did not return a response.",
      bancoAlterado: false,
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      bancoAlterado: false,
    });
  }
}
