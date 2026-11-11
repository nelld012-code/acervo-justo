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
    time: new Date().toISOString(),
  });
}
