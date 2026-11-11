# Integración real de Intimações DJEN (OAB 37610/MG)

## Estado actual verificado
- No existe ningún código "intimacoes"/"djen" en el proyecto: el PR #51 **no está integrado** en main (último commit: #50). Para reutilizar su interfaz hay que fusionarlo en GitHub antes de construir, o la recrearé siguiendo el mismo diseño.
- Backend conectado: el proyecto Lovable Cloud del proyecto (el mismo para vista previa y publicación). Tabla `prazos` con disparador de deduplicación aditiva (nome + processo + data_limite) ya activo.
- `src/start.ts` ya envía el token del usuario a las funciones de servidor.
- **Rama aislada:** esta conversación trabaja sobre una rama de edición que se sincroniza con `main`; los cambios de código **no** quedan aislados del proyecto conectado. Las migraciones afectan la **única base de datos** (vista previa y producción comparten backend). Para aislar el código se puede usar un borrador (draft), que abre un pull request en GitHub; aun así la migración se aplicaría al backend compartido, salvo que el borrador tenga backend aislado.

## Qué se construye
1. **Recogida diaria (servidor):** ruta `src/routes/api/public/djen-sync.ts` (POST). Llama a `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=37610&ufOab=MG&dataDisponibilizacaoInicio=…&dataDisponibilizacaoFim=…&pagina=N`, con paginación y una ventana de 3 días hacia atrás para cubrir días perdidos. Exige el encabezado `x-cron-secret` (comparación de tiempo constante). Guarda con `supabaseAdmin` cargado dentro del manejador, usando `upsert … onConflict: hash, ignoreDuplicates` (solo añade, nunca actualiza).
2. **Página `/intimacoes`** (`src/routes/_authenticated/intimacoes.tsx`, en portugués): lista paginada (8), búsqueda, filtros por estado/fecha/tribunal, ficha con el texto original íntegro, botones "Marcar como revisada", "Criar prazo", "Imprimir ficha", "Imprimir relatório", más un botón "Sincronizar agora" para administrador/advogado.
3. **Crear prazo manual:** abre el formulario de Prazos ya rellenado (nome = parte/destinatario, processo, observação con un resumen + enlace). **`data_limite` queda vacía**: el usuario la escribe; no se calcula ningún vencimiento. Se inserta con el cliente del navegador (respeta RLS), y luego se marca la intimação como `convertida_em_prazo` con `prazo_id`. Si el disparador de deduplicación ignora la inserción, se avisa sin marcar.
4. **Menú:** entrada "Intimações" junto a Prazos.
5. Sin correo ni WhatsApp. No se toca ningún prazo existente.

## Migración (solo cuando lo apruebes)
```text
create table public.intimacoes_djen (
  id uuid pk default gen_random_uuid(),
  hash text not null unique,            -- sha256(id_cnj | numero_processo | data_disponibilizacao | texto normalizado)
  djen_id bigint, numero_processo text, sigla_tribunal text, orgao text,
  tipo_comunicacao text, tipo_documento text, meio text,
  data_disponibilizacao date, link text,
  destinatarios jsonb, advogados jsonb,
  texto text not null, payload jsonb not null,   -- texto original + respuesta completa
  status text not null default 'nova',           -- nova | revisada | convertida_em_prazo (validado por disparador)
  revisada_por uuid, revisada_em timestamptz,
  prazo_id uuid references public.prazos(id) on delete set null,
  created_at, updated_at timestamptz default now()
);
create table public.djen_sync_runs (id, started_at, finished_at, encontrados int, inseridos int, erro text);
```
- GRANT select/update a `authenticated`, all a `service_role`; RLS: lectura para usuarios con sesión (mismo criterio que `prazos`), actualización solo de `status/revisada_*/prazo_id`; sin INSERT/DELETE para usuarios (solo la tarea de servidor). `djen_sync_runs`: lectura para administradores.
- Disparador `updated_at` existente.

## Secrets y tarea programada
- Generar `DJEN_CRON_SECRET` (valor aleatorio, no lo tienes que inventar). La API del CNJ es pública: no requiere clave.
- Activar las llamadas programadas gestionadas y crear **una** tarea diaria (por ejemplo 09:00 UTC = 06:00 en Brasilia, 1 ejecución al día) que haga POST a `https://project--3a20ae50-781d-485b-bf94-455f13c6e988.lovable.app/api/public/djen-sync` con el secret. Funciona sin usuarios conectados. Requiere que la ruta esté **publicada**.
- Riesgo: la API del CNJ a veces bloquea IPs fuera de Brasil o limita peticiones; se registrará el error en `djen_sync_runs` y se probará antes de programar.

## Cómo probar
1. Llamar al endpoint del CNJ desde el entorno de pruebas (solo lectura) para confirmar formato y acceso.
2. Prueba unitaria del cálculo de hash y del mapeo de campos (vitest).
3. Ejecutar la ruta de sincronización dos veces: la segunda debe insertar 0 (idempotencia).
4. Con sesión autenticada en la vista previa: marcar revisada, crear prazo (fecha escrita manualmente), comprobar que `prazos` solo gana 1 fila y ninguna existente cambia (conteo antes/después).
5. Imprimir ficha e informe; build y typecheck limpios.

## Cómo revertir
- **Código:** restaurar desde la rama `backup/pre-djen-alertas-2026-11-11` o desde el historial de versiones de Lovable; los archivos nuevos son independientes.
- **Base de datos:** detener la tarea (`cron.unschedule`), luego `drop table public.djen_sync_runs; drop table public.intimacoes_djen;`. Los prazos creados manualmente quedan intactos (el vínculo es solo desde intimações hacia prazos).
- Borrar el secret `DJEN_CRON_SECRET`.

## Archivos
- Nuevos: `src/routes/api/public/djen-sync.ts`, `src/lib/djen.ts` (cliente, mapeo, hash), `src/lib/djen.test.ts`, `src/routes/_authenticated/intimacoes.tsx`, `src/lib/print-intimacoes.ts`, migración en `supabase/migrations/`.
- Modificados: `src/components/app-sidebar.tsx` (entrada de menú), `src/routes/_authenticated/prazos.tsx` solo si hace falta exportar el formulario para rellenarlo (sin cambiar reglas), tipos generados, `AGENTS.md`.

## Pendiente de tu decisión
- ¿Fusionas el PR #51 en main antes, o recreo la interfaz?
- ¿Quién puede ver Intimações: todos los cargos o solo administrador/advogado?
