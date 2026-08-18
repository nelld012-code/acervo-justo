-- Corrige o schema de Prazos para o modelo real de importação.
-- A coluna Parte pode conter o nome da parte, não apenas "Parte Autora"/"Parte Ré".
ALTER TABLE public.prazos DROP CONSTRAINT IF EXISTS prazos_parte_check;

-- Mantém o status interno do módulo limitado aos dois estados usados pela aplicação.
-- Valores externos do Excel são normalizados no importador.
