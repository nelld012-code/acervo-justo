import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardCheck, Plus, CheckCircle2, Clock3, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Task = {
  id: string;
  titulo: string;
  descricao: string | null;
  data_tarefa: string;
  hora_tarefa: string | null;
  prioridade: "baixa" | "media" | "alta";
  status: "pendente" | "concluida" | "cancelada";
  assigned_to: string;
  created_by: string | null;
  created_at: string;
};

const today = format(new Date(), "yyyy-MM-dd");
const emptyForm = { titulo: "", descricao: "", data_tarefa: today, hora_tarefa: "", prioridade: "media" as Task["prioridade"] };

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas - Gestão Judicial" }, { name: "description", content: "Agenda de tarefas internas da equipe." }] }),
  component: TarefasPage,
});

function dataBR(value: string) {
  const [y, m, d] = value.split("-");
  return d ? `${d}/${m}/${y}` : value;
}

function TarefasPage() {
  const qc = useQueryClient();
  const { profile, perms } = useProfile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const tasksQuery = useQuery({
    queryKey: ["internal-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("data_tarefa", { ascending: true }).order("hora_tarefa", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
  const tasks = tasksQuery.data ?? [];

  const createTask = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const { error } = await supabase.from("tasks").insert({
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        data_tarefa: form.data_tarefa,
        hora_tarefa: form.hora_tarefa || null,
        prioridade: form.prioridade,
        status: "pendente",
        assigned_to: auth.user.id,
        created_by: auth.user.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["internal-tasks"] });
      setForm({ ...emptyForm });
      setOpen(false);
      toast.success("Tarefa criada e atribuída a você.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível criar a tarefa."),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Task["status"] }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["internal-tasks"] });
      toast.success("Status da tarefa atualizado.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa."),
  });

  const pending = tasks.filter((task) => task.status === "pendente");
  const completed = tasks.filter((task) => task.status === "concluida");
  const cancelled = tasks.filter((task) => task.status === "cancelada");

  function priorityBadge(priority: Task["prioridade"]) {
    if (priority === "alta") return <Badge variant="destructive">Alta</Badge>;
    if (priority === "baixa") return <Badge variant="outline">Baixa</Badge>;
    return <Badge variant="secondary">Média</Badge>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-6 w-6" /> Agenda de tarefas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organize atividades internas sem misturá-las aos prazos judiciais.</p>
        </div>
        <Button onClick={() => { setForm({ ...emptyForm }); setOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Nova tarefa</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-5 w-5 text-amber-500" /><div><p className="text-sm text-muted-foreground">Pendentes</p><p className="text-2xl font-semibold">{pending.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-sm text-muted-foreground">Concluídas</p><p className="text-2xl font-semibold">{completed.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><AlertCircle className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Canceladas</p><p className="text-2xl font-semibold">{cancelled.length}</p></div></CardContent></Card>
      </div>

      {tasksQuery.isLoading ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Carregando tarefas…</CardContent></Card> :
        tasksQuery.isError ? <Card><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar a agenda. Verifique se a tabela tasks existe no banco ativo e se as permissões de acesso estão aplicadas.</CardContent></Card> :
        tasks.length === 0 ? <Card><CardContent className="p-10 text-center"><ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Nenhuma tarefa cadastrada</p><p className="mt-1 text-sm text-muted-foreground">Crie sua primeira tarefa para começar a organizar a rotina.</p></CardContent></Card> :
        <div className="space-y-6">
          {([{ title: "Pendentes", rows: pending }, { title: "Concluídas", rows: completed }, { title: "Canceladas", rows: cancelled }] as const).map((section) => section.rows.length > 0 && (
            <Card key={section.title}>
              <CardHeader className="pb-3"><CardTitle className="text-lg">{section.title} <span className="text-sm font-normal text-muted-foreground">({section.rows.length})</span></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {section.rows.map((task) => (
                  <div key={task.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{task.titulo}</h3>{priorityBadge(task.prioridade)}</div>
                      {task.descricao && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{task.descricao}</p>}
                      <p className="text-sm text-muted-foreground">Data: {dataBR(task.data_tarefa)}{task.hora_tarefa ? ` · ${task.hora_tarefa.slice(0, 5)}` : ""}</p>
                    </div>
                    {task.status === "pendente" && <div className="flex shrink-0 flex-wrap gap-2">
                      <Button size="sm" onClick={() => updateStatus.mutate({ id: task.id, status: "concluida" })} disabled={updateStatus.isPending}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Concluir</Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: task.id, status: "cancelada" })} disabled={updateStatus.isPending}>Cancelar</Button>
                    </div>}
                    {task.status !== "pendente" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: task.id, status: "pendente" })} disabled={updateStatus.isPending}>Reabrir</Button>}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      }

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Nova tarefa</DialogTitle><DialogDescription>A tarefa será atribuída à sua conta nesta primeira versão.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Título *</Label><Input maxLength={180} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: preparar documentos para atendimento" /></div>
            <div className="space-y-1.5"><Label>Descrição</Label><Textarea maxLength={4000} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Detalhes da atividade (opcional)" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Data *</Label><Input type="date" value={form.data_tarefa} onChange={(e) => setForm({ ...form, data_tarefa: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Hora</Label><Input type="time" value={form.hora_tarefa} onChange={(e) => setForm({ ...form, hora_tarefa: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Prioridade</Label><Select value={form.prioridade} onValueChange={(value: Task["prioridade"]) => setForm({ ...form, prioridade: value })}><SelectTrigger><SelectValue placeholder="Selecione a prioridade" /></SelectTrigger><SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="alta">Alta</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => createTask.mutate()} disabled={!form.titulo.trim() || !form.data_tarefa || createTask.isPending}>{createTask.isPending ? "Salvando…" : "Salvar tarefa"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
