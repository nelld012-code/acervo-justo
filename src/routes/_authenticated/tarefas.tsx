import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ListTodo } from "lucide-react";

/**
 * Compatibilidade para favoritos e URLs antigas:
 * a página antiga de Agenda de tarefas foi substituída pelo Banco de tarefas.
 */
export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({
    meta: [
      { title: "Redirecionando para Banco de tarefas - Acervo Justo" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TarefasRedirect,
});

function TarefasRedirect() {
  useEffect(() => {
    window.location.replace("/banco-tarefas");
  }, []);

  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
      <ListTodo className="h-8 w-8 text-sky-400" />
      <h1 className="text-lg font-semibold">Banco de tarefas</h1>
      <p className="text-sm text-muted-foreground">
        A Agenda de tarefas foi substituída. Redirecionando para o Banco de tarefas…
      </p>
    </div>
  );
}
