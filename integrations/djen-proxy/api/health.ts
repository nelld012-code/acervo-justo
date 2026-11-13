declare const process: { env: Record<string, string | undefined> };

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

export default function handler(_req: unknown, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "acervo-justo-djen-proxy",
    region: process.env.VERCEL_REGION ?? "unknown",
    environment: process.env.VERCEL_ENV ?? "unknown",
    configuration: {
      cronSecretConfigured: Boolean(process.env.CRON_SECRET),
      syncSecretConfigured: Boolean(process.env.DJEN_SYNC_SECRET),
      acervoUrlConfigured: Boolean(process.env.ACERVO_JUSTO_URL),
    },
    time: new Date().toISOString(),
  });
}
