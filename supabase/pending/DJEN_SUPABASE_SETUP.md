# DJEN nativo no Supabase — instrucciones de activación

Este flujo sustituye integralmente el colector Vercel. La coleta corre en una Supabase Edge Function; la agenda diaria se ejecuta en el propio Postgres con pg_cron + pg_net; los secretos se guardan en Supabase Vault. Lovable conserva la interfaz y sincroniza el código desde GitHub.

## Estado de esta implementación

- El colector está en supabase/functions/djen-sync/index.ts.
- supabase/config.toml define verify_jwt = false solo para esta función. La función valida obligatoriamente el header x-cron-secret.
- La coleta consulta OAB/MG 37.610 en los últimos 7 días y recorre la paginación. Si la respuesta queda incompleta, aborta sin grabar.
- La función usa `@supabase/supabase-js` y obtiene la clave administrativa desde `SUPABASE_SECRET_KEYS`, variable inyectada por Supabase en el runtime. La clave nunca pasa por el navegador ni se guarda en GitHub o Vault.
- El SQL de tablas, políticas, funciones y vínculo con Prazos permanece en supabase/migrations/20261112150000_djen_intimacoes.sql; aún debe aplicarse a la base de producción.
- No se calcula ninguna fecha límite automáticamente. Cada comunicación crea un borrador sin vencimiento ni recordatorios hasta la revisión humana.

## Orden seguro de activación

### 1. Hacer backup de la base de datos

Antes de aplicar el SQL pendiente, crea/descarga un backup de la base de producción desde el Dashboard de Supabase. La rama backup/djen-supabase-native-before-hardening-20261112 conserva el código anterior en GitHub; no sustituye el backup de los datos del banco.

### 2. Aplicar el SQL del módulo DJEN

En Supabase Dashboard, abre SQL Editor y ejecuta el contenido completo de:

supabase/migrations/20261112150000_djen_intimacoes.sql

Este SQL crea intimacoes_djen, djen_sync_runs, los vínculos de borrador en prazos, las políticas RLS y las funciones djen_ingest / djen_confirmar_prazo.

El script es idempotente: las tablas e índices ya existentes se conservan y las políticas, funciones y permisos se ajustan a la versión actual. Si el SQL devuelve un error, detente y corrige el error antes de volver a intentarlo; no elimines tablas ni filas existentes.

### 3. Publicar la Edge Function

La carpeta supabase/functions/djen-sync debe publicarse en el proyecto cuyo ref está configurado en supabase/config.toml.

Con Supabase CLI instalado y autenticado:

~~~powershell
supabase login
supabase link --project-ref yqvfybcznlpsgoqwzrop
supabase functions deploy djen-sync --project-ref yqvfybcznlpsgoqwzrop
~~~

La configuración verify_jwt = false ya está en supabase/config.toml. No la cambies a true: el endpoint usa autenticación propia mediante el header secreto y no debe llamarse directamente desde el navegador.

### 4. Crear el secreto de la función

Genera un valor aleatorio fuerte localmente en Windows PowerShell (no envíes ese valor por chat ni lo guardes en GitHub):

~~~powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$DJEN_SECRET = [Convert]::ToHexString($bytes)
$DJEN_SECRET | Set-Clipboard
~~~

En Supabase Dashboard, abre Edge Functions → Secrets y agrega:

- Nombre: DJEN_CRON_SECRET
- Valor: pega el secreto generado

No uses el prefijo SUPABASE_ en el nombre del secreto.

### 5. Activar extensiones y guardar los datos de llamada en Vault

En Supabase Dashboard, ve a Database → Extensions y confirma que estén habilitadas:

- pg_cron
- pg_net
- supabase_vault (Vault)

En SQL Editor, ejecuta el bloque siguiente reemplazando los dos marcadores. Usa la clave publishable del proyecto (o la antigua anon si el proyecto aún no tiene clave publishable). Esta clave solo identifica al proyecto; la función exige además el encabezado secreto DJEN_CRON_SECRET, por lo que la clave pública por sí sola no permite ejecutar la coleta.

~~~sql
DO $
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'djen_project_url';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret('https://yqvfybcznlpsgoqwzrop.supabase.co', 'djen_project_url', 'URL do projeto Acervo Justo');
  ELSE
    PERFORM vault.update_secret(v_id, 'https://yqvfybcznlpsgoqwzrop.supabase.co', 'djen_project_url', 'URL do projeto Acervo Justo');
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'djen_publishable_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret('PEGA_AQUI_A_CHAVE_PUBLISHABLE_DO_PROJETO', 'djen_publishable_key', 'Chave pública para identificar o projeto no pg_net');
  ELSE
    PERFORM vault.update_secret(v_id, 'PEGA_AQUI_A_CHAVE_PUBLISHABLE_DO_PROJETO', 'djen_publishable_key', 'Chave pública para identificar o projeto no pg_net');
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'djen_cron_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret('PEGA_AQUI_O_MESMO_DJEN_CRON_SECRET', 'djen_cron_secret', 'Segredo compartilhado entre pg_cron e a Edge Function DJEN');
  ELSE
    PERFORM vault.update_secret(v_id, 'PEGA_AQUI_O_MESMO_DJEN_CRON_SECRET', 'djen_cron_secret', 'Segredo compartilhado entre pg_cron e a Edge Function DJEN');
  END IF;
END $;
~~~

Si alguno de esos nombres ya existe en Vault, no crees una segunda copia con otro nombre. Actualiza el secreto existente en Vault y conserva exactamente los nombres indicados.

### 6. Probar sin grabar datos

Ejecuta en SQL Editor. Esta llamada consulta el CNJ, pero dryRun=1 impide toda escritura:

~~~sql
select net.http_post(
  url := (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'djen_project_url'
  ) || '/functions/v1/djen-sync?dryRun=1',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'djen_publishable_key'
    ),
    'x-cron-secret', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'djen_cron_secret'
    )
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
) as request_id;
~~~

Copia el request_id devuelto y consulta la respuesta:

~~~sql
select id, status_code, content, timed_out, error_msg, created
from net._http_response
where id = PEGA_AQUI_EL_REQUEST_ID;
~~~

El resultado esperado tiene status_code = 200, dryRun = true y bancoAlterado = false. La función valida DJEN_CRON_SECRET en el header x-cron-secret; la clave publishable no es suficiente para ejecutar la sincronización. `pg_net` es asíncrono: el primer SELECT devuelve un request_id y la respuesta debe consultarse después en net._http_response. Si hay error, no crees el cron todavía.

### 7. Hacer una primera sincronización real

Después de confirmar la prueba, ejecuta la misma llamada del paso 6 quitando ?dryRun=1 del final de la URL. Después verifica:

~~~sql
select *
from public.djen_sync_runs
order by started_at desc
limit 5;

select count(*) as intimacoes
from public.intimacoes_djen;

select count(*) as rascunhos_djen
from public.prazos
where djen_hash is not null
  and revisao_pendente = true;
~~~

Una llamada repetida no debe duplicar comunicaciones: el ID/hash del CNJ se usa para deduplicación.

### 8. Programar la coleta diaria a las 06:00 de Brasilia

Supabase Postgres usa UTC por defecto. Confirma con show timezone;. Si devuelve UTC, 09:00 UTC equivale a 06:00 en Brasilia.

Ejecuta en SQL Editor:

~~~sql
select cron.schedule(
  'djen-sync-daily',
  '0 9 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'djen_project_url'
      ) || '/functions/v1/djen-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'djen_publishable_key'
        ),
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'djen_cron_secret'
        )
      ),
      body := '{"trigger":"supabase-cron"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
~~~

El nombre del job es djen-sync-daily. Si ejecutas de nuevo el agendamiento con el mismo nombre, Supabase Cron actualiza el job existente. `pg_cron` usa el reloj de la base de datos; confirma la zona horaria antes de elegir 09:00 UTC.

Para revisar el historial:

~~~sql
select j.jobname, r.status, r.start_time, r.end_time, r.return_message
from cron.job j
join cron.job_run_details r on r.jobid = j.jobid
where j.jobname = 'djen-sync-daily'
order by r.start_time desc
limit 10;
~~~

## Seguridad y comportamiento

- No guardes la clave secreta del Supabase, DJEN_CRON_SECRET ni secretos de Vault en GitHub, Lovable, un .env público o el navegador.
- La clave publishable enviada por Cron identifica el proyecto; el secreto x-cron-secret protege la invocación. El SDK `@supabase/server` crea el cliente administrativo dentro del runtime; nunca coloques `service_role` ni `sb_secret` en GitHub, Vault, Lovable o el navegador.
- El colector usa por ahora solamente OAB/MG 37.610. Las OAB de otros abogados podrán agregarse después de confirmarlas.
- La búsqueda retrospectiva de 7 días reduce el riesgo de perder publicaciones tras una falla; la deduplicación evita repeticiones.
- El sistema no interpreta ni fija plazos procesales por sí solo. El colaborador revisa el texto de la intimación y confirma la fecha límite en el módulo Intimações DJEN.
- Las comunicaciones y los borradores quedan disponibles en Acervo Justo para consulta e impresión.

## Retirar Vercel

Después de comprobar una sincronización real y al menos una ejecución programada exitosa en Supabase, el proyecto antiguo de Vercel y cualquier cron/variable asociado podrán eliminarse. No lo elimines antes de validar la alternativa para evitar interrumpir la coleta.
