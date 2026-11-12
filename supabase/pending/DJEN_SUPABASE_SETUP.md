# DJEN nativo no Supabase — instrucciones de activación

Este flujo sustituye el colector Vercel por una Edge Function alojada en el backend Supabase administrado por Lovable. El proyecto de la aplicación es `Arquivo Jurídico Central` (ID de proyecto Lovable `3a20ae50-781d-485b-bf94-455f13c6e988`). El `project_id = yqvfybcznlpsgoqwzrop` de `supabase/config.toml` es la referencia técnica corta usada por Supabase; no es el ID UUID de Lovable. No crees otro proyecto ni conectes esta integración a una base externa. El código se mantiene en GitHub; la base, secretos y funciones pertenecen al backend existente de Lovable.

## Estado de esta implementación

- El colector está en supabase/functions/djen-sync/index.ts.
- supabase/config.toml define verify_jwt = false solo para esta función. La función valida obligatoriamente el header x-cron-secret.
- La coleta consulta OAB/MG 37.610 en los últimos 7 días y recorre la paginación. Si la respuesta queda incompleta, aborta sin grabar.
- La función usa `@supabase/supabase-js` y obtiene la clave administrativa exclusivamente del entorno del backend (`SUPABASE_SECRET_KEYS` o, como compatibilidad con el backend integrado, `SUPABASE_SERVICE_ROLE_KEY`). La clave nunca pasa por el navegador ni se guarda en GitHub o Vault.
- La lectura de solo consulta del 12/11/2026 confirmó: 581 filas en `public.prazos`; tablas `intimacoes_djen` y `djen_sync_runs` creadas pero vacías; columnas DJEN de `prazos` y funciones DJEN existentes; `pg_cron` y Vault instalados; `pg_net` ausente; ningún job DJEN programado.
- Por ello, **no ejecutes a ciegas la migración completa**: compara primero el esquema real y aplica solo lo que falte. La integración de GitHub no ejecuta automáticamente todas las migraciones al fusionar el PR.
- No se calcula ninguna fecha límite automáticamente. Cada comunicación crea un borrador sin vencimiento ni recordatorios hasta la revisión humana.

## Orden seguro de activación

### 1. Hacer backup de la base de datos

Antes de cualquier escritura, exporta la base del proyecto Lovable existente:

1. Abre el proyecto **Arquivo Jurídico Central**.
2. En la barra del proyecto entra en **More → Database → Manage → Settings**.
3. En **Export project data**, pulsa **Export data**; en la tarjeta **Database**, pulsa **Export → Start export**.
4. Lovable avisará por correo cuando el archivo esté listo y también lo guardará en **More → Storage**. Descárgalo y guárdalo fuera de Lovable.

La exportación contiene estructura y datos completos de PostgreSQL, incluidas cuentas de usuario y hashes de contraseñas. No contiene archivos de Storage, código de Edge Functions, secretos, ajustes de proveedores de inicio de sesión ni claves API. Descarga esos archivos de Storage por separado si necesitas un respaldo integral. Lovable mantiene backups automáticos diarios, pero no permite crear un punto de restauración inmediato a demanda.

La rama `backup/djen-supabase-native-before-hardening-20261112` conserva código anterior en GitHub; no sustituye este respaldo de la base de datos.

### 2. Aplicar el SQL del módulo DJEN

En el proyecto Lovable abre **More → Database → Manage → SQL editor**. No pegues todavía el archivo completo de la migración: la lectura actual demuestra que las tablas DJEN, los campos y las funciones principales ya existen y que las 581 filas de `prazos` deben conservarse. Primero compara la definición exacta de columnas, índices, triggers, funciones, políticas RLS y permisos con `supabase/migrations/20261112150000_djen_intimacoes.sql`. Luego ejecuta solamente las sentencias faltantes, comenzando por instalar `pg_net` con:

~~~sql
CREATE EXTENSION IF NOT EXISTS pg_net;
~~~

En la configuración estándar de Supabase, esta extensión crea el esquema `net`, que es donde viven `net.http_post` y `net._http_response`. No la instales en el esquema `extensions`. La migración de GitHub fue corregida para reflejarlo. Si alguna sentencia falla, detente y consulta el estado antes de reintentarlo; no elimines ni recrees tablas, ni modifiques los 581 registros manuales existentes.

### 3. Publicar la Edge Function

El archivo está en `supabase/functions/djen-sync/index.ts`. Como el backend pertenece a Lovable, no utilices otra organización o proyecto desde el panel personal de Supabase ni intentes desplegar sobre uno de los otros proyectos que aparecen en tu cuenta.

En Lovable, abre **More → Database → Manage → Edge functions** para comprobar las funciones y sus logs. La documentación de Lovable indica que la creación, edición y publicación de una Edge Function se realiza desde el chat del proyecto. Después de sincronizar el código aprobado desde GitHub, pide que publique **solo** `djen-sync`, sin cambios adicionales en la interfaz ni en otras funciones. La vista Edge functions permite comprobar que la función aparece, revisar invocaciones y abrir sus logs.

La configuración `verify_jwt = false` debe conservarse para esta función, porque el endpoint valida obligatoriamente el header secreto `x-cron-secret`. Nunca debe ser llamada sin esa autenticación propia.

### 4. Crear el secreto de la función

Genera un valor aleatorio fuerte localmente en Windows PowerShell (no envíes ese valor por chat ni lo guardes en GitHub):

~~~powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$DJEN_SECRET = [Convert]::ToHexString($bytes)
$DJEN_SECRET | Set-Clipboard
~~~

En el proyecto Lovable abre **More → Settings → Secrets** y agrega:

- Nombre: `DJEN_CRON_SECRET`
- Valor: pega el secreto generado

Lovable inyecta los secretos en el runtime de las Edge Functions y no vuelve a mostrar el valor después de guardarlo. Conserva una copia segura porque el mismo valor debe guardarse en Vault para que pg_cron pueda invocar la función. No uses el prefijo reservado `SUPABASE_`.

### 5. Activar extensiones y guardar los datos de llamada en Vault

En **More → Database → Manage → SQL editor** del mismo proyecto Lovable, confirma las extensiones con una consulta de solo lectura:

~~~sql
select extname, extversion from pg_extension where extname in ('pg_cron', 'pg_net', 'supabase_vault');
~~~

La comprobación del 12/11/2026 encontró `pg_cron` y `supabase_vault`, pero no `pg_net`. Si aún no aparece, aplica primero `CREATE EXTENSION IF NOT EXISTS pg_net;` después de completar el backup del paso 1. Luego ejecuta el bloque siguiente reemplazando los dos marcadores. La URL base confirmada en el `.env` del repositorio es `https://yqvfybcznlpsgoqwzrop.supabase.co`; copia la clave `VITE_SUPABASE_PUBLISHABLE_KEY` desde el `.env` del proyecto. La clave publishable identifica el proyecto; la función exige además el header secreto `x-cron-secret`, por lo que la clave pública por sí sola no permite ejecutar la coleta. No pegues valores secretos en el chat ni los cometas en GitHub.

~~~sql
DO $$
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
END $$7667

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
- La clave publishable enviada por Cron identifica el proyecto; el secreto x-cron-secret protege la invocación. `@supabase/supabase-js` usa la variable reservada `SUPABASE_SECRET_KEYS` que Supabase inyecta solo en el runtime; nunca coloques `service_role` ni `sb_secret` en GitHub, Vault, Lovable o el navegador.
- El colector usa por ahora solamente OAB/MG 37.610. Las OAB de otros abogados podrán agregarse después de confirmarlas.
- La búsqueda retrospectiva de 7 días reduce el riesgo de perder publicaciones tras una falla; la deduplicación evita repeticiones.
- El sistema no interpreta ni fija plazos procesales por sí solo. El colaborador revisa el texto de la intimación y confirma la fecha límite en el módulo Intimações DJEN.
- Las comunicaciones y los borradores quedan disponibles en Acervo Justo para consulta e impresión.

## Retirar Vercel

Después de comprobar una sincronización real y al menos una ejecución programada exitosa en Supabase, el proyecto antiguo de Vercel y cualquier cron/variable asociado podrán eliminarse. No lo elimines antes de validar la alternativa para evitar interrumpir la coleta.
