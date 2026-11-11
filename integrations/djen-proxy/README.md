# Acervo Justo — DJEN Brazil proxy

This small Vercel project is the scheduled, Brazil-region collector for the public CNJ Comunica API. It is intentionally separate from the Lovable app backend so the CNJ request originates in São Paulo.

## Vercel project setup

1. Import the GitHub repository `nelld012-code/acervo-justo` into Vercel.
2. Set **Root Directory** to `integrations/djen-proxy`.
3. Keep the production branch set to `feature/djen-brazil-cron` during testing. Do not enable the production cron until the Lovable receiver and database migration are ready.
4. The included `vercel.json` pins functions to São Paulo (`gru1`) and declares a daily cron at **09:00 UTC (06:00 in Brasília)**.
5. Configure these Production environment variables:
   - `CRON_SECRET`: a long random secret. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` for each cron invocation.
   - `DJEN_SYNC_SECRET`: a separate long random secret that must match `DJEN_CRON_SECRET` in Lovable Cloud.
   - `ACERVO_JUSTO_URL`: `https://acervo-justo.lovable.app`.
6. Deploy a preview first and test `/api/health`; the `region` field must report `gru1`.
7. Only after the Lovable receiver has its secret configured and the database migration is verified, merge the integration branch to the Vercel production branch and enable the daily cron.

## Endpoints

- `GET /api/health`: non-sensitive region and health check.
- `GET /api/djen-cron`: protected scheduled job. It only accepts Vercel Cron's bearer secret, queries OAB/MG 37610, reads up to 10 pages of 100 items over the previous three days, and POSTs the raw items to the Lovable receiver.

No credentials or CNJ data are written to logs by this project. It does not calculate procedural deadlines.
