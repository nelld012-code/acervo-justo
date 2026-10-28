-- Expande os estados de tarefas para o fluxo do Banco de Tarefas.
-- Mantém os estados existentes (pendente, concluida, cancelada) e adiciona
-- em_processo e resposta. Não altera nem remove registros.
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status = ANY (ARRAY[
    'pendente'::text,
    'em_processo'::text,
    'resposta'::text,
    'concluida'::text,
    'cancelada'::text
  ]));

NOTIFY pgrst, 'reload schema';
