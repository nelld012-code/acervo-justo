export default function handler(_req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "acervo-justo-djen-proxy",
    region: process.env.VERCEL_REGION ?? "unknown",
    time: new Date().toISOString(),
  });
}
