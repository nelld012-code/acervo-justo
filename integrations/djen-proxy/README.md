# Acervo Justo — DJEN Brazil proxy

This small Vercel project collects the public CNJ Comunica API from a Vercel Function pinned to São Paulo (`gru1`). It forwards the original CNJ items to the protected server-side receiver in Acervo Justo. The UI, database, and Prazos remain in the existing Lovable project.

## Verified test deployment and production schedule

1. Import GitHub repository `nelld012-code/acervo-justo` into Vercel.
2. Set **Root Directory** to `integrations/djen-proxy`.
3. Keep the Vercel Production Branch on `main`. Deploy `feature/djen-proxy-isolated` as a **Preview deployment** only.
4. The included `vercel.json` pins all functions to São Paulo (`gru1`). Vercel documents `gru1` as São Paulo, Brazil.
5. Configure these environment variables for **Preview and Production**:
   - `CRON_SECRET`: a long random secret; the function compares it with the incoming `Authorization: Bearer ...` header.
   - `DJEN_SYNC_SECRET`: a second independent random secret; later it must match `DJEN_CRON_SECRET` in Lovable Cloud.
   - `ACERVO_JUSTO_URL`: `https://acervo-justo.lovable.app`.
6. Deploy a Preview and open `/api/health`; the response must report `region: "gru1"`.
7. Invoke `/api/djen-cron?dryRun=1` using a request with the bearer secret. This performs a real CNJ read from São Paulo and validates the Acervo receiver in dry-run mode. It must not write to the database. In Windows PowerShell, after entering the secret locally (do not paste it into chat), run:
   ```powershell
   $env:CRON_SECRET = Read-Host "CRON_SECRET"
   $env:VERCEL_PREVIEW_URL = Read-Host "Vercel Preview URL"
   Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:CRON_SECRET" } -Uri "$env:VERCEL_PREVIEW_URL/api/djen-cron?dryRun=1"
   ```
8. The validated production configuration schedules `/api/djen-cron` daily at `09:00 UTC` (06:00 in Brasília). The cron route is protected by `CRON_SECRET`; it forwards with `DJEN_SYNC_SECRET` and creates only review-pending drafts. It never calculates procedural deadlines.

## Production activation (after backup, migration and secret setup)

Before production scheduling, verify a successful end-to-end dry-run, the three environment variables are set for Production, and the database tables/RLS policies exist. Merge the reviewed proxy folder to `main` and deploy its production build. Vercel runs this daily schedule only for production deployments. Verify the first scheduled invocation before treating the automation as operational.

## Environment variables and security

- Generate and store secrets in the Vercel and Lovable dashboards. Never paste `service_role`, `CRON_SECRET`, or `DJEN_SYNC_SECRET` in chat, source code, or a URL.
- `CRON_SECRET` is for Vercel's cron invocation. `DJEN_SYNC_SECRET` is the shared secret only between Vercel and the Acervo Justo server receiver.
- The server receiver is the only process that uses Supabase service-role credentials.
- `dryRun=1` forwards to the receiver's dry-run path and does not write records.
- A normal cron invocation calls `djen_ingest`, creating review-pending records in `intimacoes_djen` and linked draft entries in `prazos`; no procedural deadline is calculated.
- The collector does not log communication text.

## Endpoints

- `GET /api/health`: non-sensitive service and region check.
- `GET /api/djen-cron`: protected read-and-forward job; never writes to Supabase directly.
- `GET /api/djen-cron?dryRun=1`: protected real CNJ read + dry-run in the receiver; no DB writes.
