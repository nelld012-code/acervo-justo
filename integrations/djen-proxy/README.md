# Acervo Justo — DJEN Brazil proxy

This small Vercel project collects the public CNJ Comunica API from a Vercel Function pinned to São Paulo (`gru1`). It forwards the original CNJ items to the protected server-side receiver in Acervo Justo. The UI, database, and Prazos remain in the existing Lovable project.

## Safe test deployment (no production cron)

1. Import GitHub repository `nelld012-code/acervo-justo` into Vercel.
2. Set **Root Directory** to `integrations/djen-proxy`.
3. Keep the Vercel Production Branch on `main`. Deploy `feature/djen-brazil-cron` as a **Preview deployment** only.
4. The included `vercel.json` pins all functions to São Paulo (`gru1`). Vercel documents `gru1` as São Paulo, Brazil.
5. Configure these **Preview** environment variables:
   - `CRON_SECRET`: a long random secret; the function compares it with the incoming `Authorization: Bearer ...` header.
   - `DJEN_SYNC_SECRET`: a second independent random secret; later it must match `DJEN_CRON_SECRET` in Lovable Cloud.
   - `ACERVO_JUSTO_URL`: `https://acervo-justo.lovable.app`.
6. Deploy a Preview and open `/api/health`; the response must report `region: "gru1"`.
7. Invoke `/api/djen-cron?dryRun=1` using a request with the bearer secret. This performs a real CNJ read from São Paulo and asks Acervo Justo's receiver for dry-run mapping only. It must not write to the database. In Windows PowerShell, after saving the two secrets as environment variables (do not paste them into chat), run:
   ```powershell
   $env:CRON_SECRET = Read-Host "CRON_SECRET"
   $env:VERCEL_PREVIEW_URL = Read-Host "Vercel Preview URL"
   Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:CRON_SECRET" } -Uri "$env:VERCEL_PREVIEW_URL/api/djen-cron?dryRun=1"
   ```
8. Do **not** add a Vercel Cron schedule or switch the production branch for this test.

## Production activation (after backup, migration and secret setup)

Only after the Lovable database backup is verified, the new DJEN tables and RLS policies have been applied, the receiver has `DJEN_CRON_SECRET` configured, and a successful dry-run has been observed:

1. Add a Vercel Cron entry in `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/djen-cron", "schedule": "0 9 * * *" }] }
   ```
2. This means 09:00 UTC = 06:00 in Brasília (UTC−3), every day.
3. Merge the tested branch to `main` and deploy production. Vercel Cron Jobs run only on production deployments.
4. Check the first run's result before treating the automation as operational.

## Environment variables and security

- Generate and store secrets in the Vercel and Lovable dashboards. Never paste `service_role`, `CRON_SECRET`, or `DJEN_SYNC_SECRET` in chat, source code, or a URL.
- `CRON_SECRET` is for Vercel's cron invocation. `DJEN_SYNC_SECRET` is the shared secret only between Vercel and the Acervo Justo server receiver.
- The server receiver is the only process that uses Supabase service-role credentials.
- The collector does not calculate procedural deadlines and does not log communication text.

## Endpoints

- `GET /api/health`: non-sensitive service and region check.
- `GET /api/djen-cron`: protected read-and-forward job; never writes to Supabase directly.
- `GET /api/djen-cron?dryRun=1`: protected real CNJ read + dry-run in the receiver; no DB writes.
