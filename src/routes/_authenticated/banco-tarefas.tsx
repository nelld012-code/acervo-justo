import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Filter,
  ListTodo,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type TaskStatus = "pendente" | "em_processo" | "resposta" | "concluida" | "cancelada";
type TaskPriority = "baixa" | "media" | "alta";

type Task = {
  id: string;
  titulo: string;
  descricao: string | null;
  data_tarefa: string;
  hora_tarefa: string | null;
  prioridade: TaskPriority;
  status: TaskStatus;
  assigned_to: string;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
};

type Stage = {
  value: Exclude<TaskStatus, "cancelada">;
  label: string;
  hint: string;
  dot: string;
  border: string;
  background: string;
  text: string;
  icon: typeof CircleDashed;
};

const STAGES: Stage[] = [
  {
    value: "pendente",
    label: "Por realizar",
    hint: "Tarefas aguardando início",
    dot: "bg-sky-400",
    border: "border-sky-400/25",
    background: "bg-sky-500/5",
    text: "text-sky-300",
    icon: CircleDashed,
  },
  {
    value: "em_processo",
    label: "Em andamento",
    hint: "Tarefas em execução",
    dot: "bg-blue-400",
    border: "border-blue-400/25",
    background: "bg-blue-500/5",
    text: "text-blue-300",
    icon: Clock3,
  },
  {
    value: "resposta",
    label: "Aguardando resposta",
    hint: "Dependem de retorno",
    dot: "bg-amber-400",
    border: "border-amber-400/25",
    background: "bg-amber-500/5",
    text: "text-amber-300",
    icon: MessageCircle,
  },
  {
    value: "concluida",
    label: "Terminada",
    hint: "Tarefas finalizadas",
    dot: "bg-emerald-400",
    border: "border-emerald-400/25",
    background: "bg-emerald-500/5",
    text: "text-emerald-300",
    icon: CheckCircle2,
  },
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  pendente: "Por realizar",
  em_processo: "Em andamento",
  resposta: "Aguardando resposta",
  concluida: "Terminada",
  cancelada: "Cancelada",
};

const PRIORIDADE_LABEL: Record<TaskPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

const today = format(new Date(), "yyyy-MM-dd");
const emptyForm = {
  titulo: "",
  descricao: "",
  data_tarefa: today,
  hora_tarefa: "",
  prioridade: "media" as TaskPriority,
};

export const Route = createFileRoute("/_authenticated/banco-tarefas")({
  head: () => ({
    meta: [
      { title: "Banco de tarefas - Acervo Justo" },
      { name: "description", content: "Organize o fluxo de tarefas da equipe em quatro etapas." },
    ],
  }),
  component: BancoTarefasPage,
});

function dataBR(value: string) {
  const [year, month, day] = value.split("-");
  return day ? `${day}/${month}/${year}` : value;
}

function prioridadeBadge(priority: TaskPriority) {
  if (priority === "alta") return <Badge variant="destructive">Alta prioridade</Badge>;
  if (priority === "baixa") return <Badge variant="outline">Baixa</Badge>;
  return <Badge variant="secondary">Prioridade média</Badge>;
}

function BancoTarefasPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("Todas");
  const [showCancelled, setShowCancelled] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const tasksQuery = useQuery({
    queryKey: ["internal-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("data_tarefa", { ascending: true })
        .order("hora_tarefa", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
  const tasks = tasksQuery.data ?? [];

  const filtradas = useMemo(() => {
    const query = busca.trim().toLocaleLowerCase("pt-BR");
    return tasks.filter((task) => {
      if (task.status === "cancelada") return false;
      const matchText =
        !query ||
        [task.titulo, task.descricao ?? ""].some((value) =>
          value.toLocaleLowerCase("pt-BR").includes(query),
        );
      const matchPriority = filtroPrioridade === "Todas" || task.prioridade === filtroPrioridade;
      return matchText && matchPriority;
    });
  }, [tasks, busca, filtroPrioridade]);

  const cancelled = useMemo(() => {
    const query = busca.trim().toLocaleLowerCase("pt-BR");
    return tasks.filter((task) => {
      if (task.status !== "cancelada") return false;
      const matchText =
        !query ||
        [task.titulo, task.descricao ?? ""].some((value) =>
          value.toLocaleLowerCase("pt-BR").includes(query),
        );
      const matchPriority = filtroPrioridade === "Todas" || task.prioridade === filtroPrioridade;
      return matchText && matchPriority;
    });
  }, [tasks, busca, filtroPrioridade]);

  const counts = {
    pendente: tasks.filter((task) => task.status === "pendente").length,
    em_processo: tasks.filter((task) => task.status === "em_processo").length,
    resposta: tasks.filter((task) => task.status === "resposta").length,
    concluida: tasks.filter((task) => task.status === "concluida").length,
    cancelada: tasks.filter((task) => task.status === "cancelada").length,
  };

  const createTask = useMutation({
    mutationFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
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
      toast.success("Tarefa adicionada ao banco.");
    },
    onError: (error) =>
      toast.error("Não foi possível criar a tarefa.", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["internal-tasks"] });
      toast.success("Etapa da tarefa atualizada.");
    },
    onError: (error) =>
      toast.error("Não foi possível atualizar a tarefa.", {
        description: error instanceof Error ? error.message : "Verifique suas permissões.",
      }),
  });

  const activeStages = STAGES.map((stage) => ({
    ...stage,
    rows: filtradas.filter((task) => task.status === stage.value),
    totalValue: filtradas.filter((task) => task.status === stage.value).length,
  }));

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-5 shadow-xl shadow-slate-950/25 sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-20 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
              <ListTodo className="h-3.5 w-3.5" /> Organização da equipe
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Banco de tarefas</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Acompanhe cada atividade desde o início até a conclusão, sem perder os retornos pendentes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                <strong className="text-white">{tasks.length - counts.cancelada}</strong> tarefas ativas
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                <strong className="text-white">{counts.resposta}</strong> aguardando resposta
              </span>
            </div>
          </div>
          <Button
            onClick={() => {
              setForm({ ...emptyForm });
              setOpen(true);
            }}
            className="shrink-0 bg-sky-400 font-semibold text-slate-950 hover:bg-sky-300"
          >
            <Plus className="mr-2 h-4 w-4" /> Nova tarefa
          </Button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        {STAGES.map((stage) => {
          const Icon = stage.icon;
          return (
            <Card key={stage.value} className={`border-slate-700/70 bg-slate-900/65 shadow-sm ${stage.border}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-xl border border-white/5 bg-slate-950/60 p-3 ${stage.text}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted-foreground">{stage.label}</p>
                  <p className="text-2xl font-semibold">{counts[stage.value]}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <section className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          <Filter className="h-3.5 w-3.5" /> Pesquisar e filtrar
        </div>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar pelo título ou descrição..."
              className="h-10 border-slate-700 bg-slate-950/60 pl-9"
            />
          </div>
          <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
            <SelectTrigger className="h-10 w-full border-slate-700 bg-slate-950/60 md:w-48">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas as prioridades</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setBusca("");
              setFiltroPrioridade("Todas");
            }}
            className="h-10 shrink-0 text-slate-400 hover:text-white"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Limpar
          </Button>
        </div>
      </section>

      {tasksQuery.isLoading ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Carregando banco de tarefas…</CardContent></Card>
      ) : tasksQuery.isError ? (
        <Card>
          <CardContent className="space-y-2 p-6">
            <p className="font-medium">Não foi possível carregar as tarefas.</p>
            <p className="text-sm text-muted-foreground">Verifique sua conexão e as permissões de acesso à agenda de tarefas.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex min-w-0 gap-3 overflow-x-auto pb-4 [scrollbar-color:#475569_transparent] [scrollbar-width:thin]">
            {activeStages.map((stage) => {
              const Icon = stage.icon;
              return (
                <section
                  key={stage.value}
                  className={`flex w-[300px] min-w-[300px] shrink-0 flex-col rounded-xl border p-3 ${stage.border} ${stage.background}`}
                >
                  <div className="mb-3 h-1 rounded-full bg-slate-800">
                    <div className={`h-1 w-2/5 rounded-full ${stage.dot}`} />
                  </div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                      <span className={`h-2 w-2 rounded-full ${stage.dot}`} /> {stage.label}
                    </h2>
                    <Badge variant="outline" className="border-slate-700 bg-slate-950/50 text-slate-200">
                      {stage.rows.length}
                    </Badge>
                  </div>
                  <p className="mb-3 text-xs text-slate-400">{stage.hint}</p>
                  <div className="flex-1 space-y-3">
                    {stage.rows.map((task) => (
                      <Card key={task.id} className="overflow-hidden border-slate-700/70 bg-slate-950/80 shadow-sm transition-all hover:border-slate-500 hover:shadow-lg">
                        <CardHeader className="space-y-2 p-3 pb-2">
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 rounded-md bg-slate-800 p-1.5 ${stage.text}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <CardTitle className="min-w-0 flex-1 break-words text-sm text-slate-100">{task.titulo}</CardTitle>
                          </div>
                          {prioridadeBadge(task.prioridade)}
                        </CardHeader>
                        <CardContent className="space-y-3 p-3 pt-1">
                          {task.descricao && <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">{task.descricao}</p>}
                          <div className="space-y-1.5 text-xs text-slate-400">
                            <p className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5 shrink-0" /> {dataBR(task.data_tarefa)}</p>
                            {task.hora_tarefa && <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 shrink-0" /> {task.hora_tarefa.slice(0, 5)}</p>}
                          </div>
                          <div className="border-t border-slate-800 pt-2">
                            <Label className="mb-1.5 block text-[11px] text-slate-400">Mover para</Label>
                            <Select
                              value={task.status}
                              onValueChange={(value: TaskStatus) => updateStatus.mutate({ id: task.id, status: value })}
                              disabled={updateStatus.isPending}
                            >
                              <SelectTrigger className="h-8 border-slate-700 bg-slate-900 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STAGES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                <SelectItem value="cancelada">Cancelada</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {stage.rows.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-700/70 p-5 text-center">
                        <Icon className="mx-auto mb-2 h-5 w-5 text-slate-500" />
                        <p className="text-xs text-slate-400">Nenhuma tarefa nesta etapa.</p>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {counts.cancelada > 0 && (
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/40">
              <button
                type="button"
                onClick={() => setShowCancelled((current) => !current)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
                aria-expanded={showCancelled}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <X className="h-4 w-4" /> Tarefas canceladas
                  <Badge variant="outline">{cancelled.length}</Badge>
                </span>
                <span className="text-xs text-slate-400">{showCancelled ? "Ocultar" : "Mostrar"}</span>
              </button>
              {showCancelled && (
                <div className="grid gap-3 border-t border-slate-800 p-3 sm:grid-cols-2 xl:grid-cols-3">
                  {cancelled.map((task) => (
                    <Card key={task.id} className="border-slate-700/70 bg-slate-950/70">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="break-words text-sm font-medium text-slate-200">{task.titulo}</p>
                          {prioridadeBadge(task.prioridade)}
                        </div>
                        <p className="text-xs text-slate-400">{dataBR(task.data_tarefa)}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus.mutate({ id: task.id, status: "pendente" })}
                          disabled={updateStatus.isPending}
                        >
                          Reabrir tarefa <ArrowRight className="ml-2 h-3.5 w-3.5" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {cancelled.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma tarefa cancelada corresponde aos filtros.</p>}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Cadastre uma atividade. Ela entrará em “Por realizar” e ficará atribuída à sua conta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input maxLength={180} value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} placeholder="Ex.: preparar documentos para atendimento" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea maxLength={4000} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} placeholder="Detalhes, providências ou retorno necessário..." />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={form.data_tarefa} onChange={(event) => setForm({ ...form, data_tarefa: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Hora</Label>
                <Input type="time" value={form.hora_tarefa} onChange={(event) => setForm({ ...form, hora_tarefa: event.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={(value: TaskPriority) => setForm({ ...form, prioridade: value })}>
                <SelectTrigger><SelectValue placeholder="Selecione a prioridade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createTask.mutate()} disabled={!form.titulo.trim() || !form.data_tarefa || createTask.isPending}>
              {createTask.isPending ? "Salvando…" : "Salvar tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
