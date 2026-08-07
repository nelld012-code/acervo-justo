import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfWeek, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, CalendarPlus, Check, ChevronLeft, ChevronRight, Printer, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, CARGO_LABELS, type Cargo } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { printReport } from "@/lib/print-report";

const PRIORIDADE_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", concluida: "Concluída", cancelada: "Cancelada" };
const PRIORIDADE_CLASS: Record<string, string> = {
  baixa: "border-slate-500/40 text-slate-300",
  media: "border-indigo-400/50 text-indigo-300",
  alta: "border-rose-500/50 text-rose-300",
};

export function WeeklyAgenda() {
  const queryClient = useQueryClient();
  const { profile, perms } = useProfile();
  const [weekOffset, setWeekOffset] = useState(0);
  const [open, setOpen] = useState(false);

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = format(weekStart, "yyyy-MM-dd");
  const to = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    data_tarefa: format(new Date(), "yyyy-MM-dd"),
    hora_tarefa: "",
    prioridade: "media",
    assigned_to: "",
    lembrar_popup: false,
  });

  const { data: tasks } = useQuery({
    queryKey: ["tasks", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, titulo, descricao, data_tarefa, hora_tarefa, prioridade, status, assigned_to, created_by, lembrar_popup")
        .gte("data_tarefa", from)
        .lte("data_tarefa", to)
        .order("hora_tarefa", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: team } = useQuery({
    queryKey: ["team-profiles"],
    enabled: perms.canAssignTasks,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome, email, cargo").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const teamMap = new Map((team ?? []).map((t) => [t.id, t]));

  type AgendaTask = NonNullable<typeof tasks>[number];

  function responsavel(t: AgendaTask) {
    if (t.assigned_to === profile?.id) return profile?.nome || profile?.email || "Você";
    const m = teamMap.get(t.assigned_to);
    return m?.nome || m?.email || "Equipe";
  }

  function taskRow(t: AgendaTask) {
    return [
      format(parseISO(t.data_tarefa), "dd/MM/yyyy"),
      t.hora_tarefa ? String(t.hora_tarefa).slice(0, 5) : "—",
      t.titulo,
      t.descricao ?? "—",
      PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade,
      STATUS_LABEL[t.status] ?? t.status,
      responsavel(t),
    ];
  }

  const COLUMNS = ["Data", "Hora", "Atividade", "Descrição", "Prioridade", "Status", "Responsável"];

  function printWeek() {
    const list = [...(tasks ?? [])].sort((a, b) =>
      a.data_tarefa === b.data_tarefa
        ? String(a.hora_tarefa ?? "").localeCompare(String(b.hora_tarefa ?? ""))
        : a.data_tarefa.localeCompare(b.data_tarefa),
    );
    const ok = printReport({
      title: "Agenda Semanal",
      subtitle: `${format(weekStart, "dd/MM/yyyy")} a ${format(addDays(weekStart, 6), "dd/MM/yyyy")}`,
      summary: [
        { label: "Atividades", value: String(list.length) },
        { label: "Pendentes", value: String(list.filter((t) => t.status === "pendente").length) },
        { label: "Concluídas", value: String(list.filter((t) => t.status === "concluida").length) },
      ],
      sections: [{ columns: COLUMNS, rows: list.map(taskRow) }],
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  function printDay(day: Date, dayTasks: AgendaTask[]) {
    const ok = printReport({
      title: `Agenda de ${format(day, "dd/MM/yyyy")}`,
      subtitle: format(day, "EEEE", { locale: ptBR }),
      summary: [{ label: "Atividades", value: String(dayTasks.length) }],
      sections: [{ columns: COLUMNS, rows: dayTasks.map(taskRow) }],
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  function printTask(t: AgendaTask) {
    const ok = printReport({
      title: "Atividade da Agenda",
      subtitle: t.titulo,
      sections: [{ columns: COLUMNS, rows: [taskRow(t)] }],
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  const createTask = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Perfil não encontrado");
      const { error } = await supabase.from("tasks").insert({
        titulo: form.titulo,
        descricao: form.descricao || null,
        data_tarefa: form.data_tarefa,
        hora_tarefa: form.hora_tarefa || null,
        prioridade: form.prioridade,
        lembrar_popup: form.lembrar_popup,
        assigned_to: form.assigned_to || profile.id,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atividade adicionada à agenda");
      setOpen(false);
      setForm({ ...form, titulo: "", descricao: "", hora_tarefa: "", lembrar_popup: false });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error("Não foi possível atualizar", { description: e.message }),
  });

  const removeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atividade removida");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error("Não foi possível excluir", { description: e.message }),
  });

  return (
    <Card className="min-w-0">
      <TaskReminders />
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="truncate">Agenda Semanal</CardTitle>
          <p className="text-xs text-muted-foreground">
            {format(weekStart, "dd MMM", { locale: ptBR })} — {format(addDays(weekStart, 6), "dd MMM yyyy", { locale: ptBR })}
            {profile ? ` · ${CARGO_LABELS[(profile.cargo as Cargo) ?? "assistente"]}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>Hoje</Button>
          <Button variant="outline" size="icon" aria-label="Próxima semana" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={printWeek}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir semana
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <CalendarPlus className="mr-2 h-4 w-4" /> Nova Atividade
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nova Atividade</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="t-titulo">Título</Label>
                  <Input id="t-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Protocolar petição" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-desc">Descrição</Label>
                  <Textarea id="t-desc" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="t-data">Data</Label>
                    <Input id="t-data" type="date" value={form.data_tarefa} onChange={(e) => setForm({ ...form, data_tarefa: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="t-hora">Hora</Label>
                    <Input id="t-hora" type="time" value={form.hora_tarefa} onChange={(e) => setForm({ ...form, hora_tarefa: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {perms.canAssignTasks && (
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Select value={form.assigned_to || profile?.id || ""} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(team ?? []).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {(m.nome || m.email || "Usuário") + " · " + CARGO_LABELS[(m.cargo as Cargo) ?? "assistente"]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-md border border-border p-3">
                  <Checkbox
                    id="t-lembrete"
                    checked={form.lembrar_popup}
                    onCheckedChange={(v) => setForm({ ...form, lembrar_popup: v === true })}
                  />
                  <Label htmlFor="t-lembrete" className="cursor-pointer text-sm font-normal">
                    Lembrar com pop-up
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createTask.mutate()} disabled={!form.titulo || createTask.isPending}>
                  {createTask.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 [&>*]:min-w-0">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = (tasks ?? []).filter((t) => t.data_tarefa === key);
            const today = isSameDay(day, new Date());
            return (
              <div key={key} className={`rounded-lg border p-2 ${today ? "border-primary/60 bg-primary/5" : "border-border"}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {format(day, "EEE", { locale: ptBR })}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`text-sm font-bold ${today ? "text-primary" : "text-foreground"}`}>{format(day, "dd")}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label={`Imprimir agenda de ${format(day, "dd/MM")}`}
                      title="Imprimir dia"
                      onClick={() => printDay(day, dayTasks)}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
                <div className="space-y-2">
                  {dayTasks.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                  {dayTasks.map((t) => (
                    <div key={t.id} className={`rounded-md border p-2 text-xs ${t.status === "concluida" ? "opacity-60" : ""}`}>
                      <div className={`font-medium break-words ${t.status === "concluida" ? "line-through" : ""}`}>{t.titulo}</div>
                      {t.hora_tarefa && <div className="text-muted-foreground">{String(t.hora_tarefa).slice(0, 5)}</div>}
                      <Badge variant="outline" className={`mt-1 ${PRIORIDADE_CLASS[t.prioridade] ?? ""}`}>
                        {PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade}
                      </Badge>
                      {perms.canAssignTasks && t.assigned_to !== profile?.id && (
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">
                          {teamMap.get(t.assigned_to)?.nome || teamMap.get(t.assigned_to)?.email || "Equipe"}
                        </div>
                      )}
                      <div className="mt-2 flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Imprimir atividade"
                          title="Imprimir"
                          onClick={() => printTask(t)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={t.status === "concluida" ? "Reabrir" : "Concluir"}
                          onClick={() => toggleStatus.mutate({ id: t.id, status: t.status === "concluida" ? "pendente" : "concluida" })}
                        >
                          {t.status === "concluida" ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        {(t.created_by === profile?.id || perms.isAdmin) && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Excluir" onClick={() => removeTask.mutate(t.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

type ReminderTask = {
  id: string;
  titulo: string;
  descricao: string | null;
  data_tarefa: string;
  hora_tarefa: string | null;
};

const REMINDER_STORAGE_KEY = "agenda-lembretes-exibidos";

function readShown(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function TaskReminders() {
  const { profile } = useProfile();
  const [queue, setQueue] = useState<ReminderTask[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const { data: pending } = useQuery({
    queryKey: ["task-reminders", profile?.id, tick],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, titulo, descricao, data_tarefa, hora_tarefa")
        .eq("lembrar_popup", true)
        .eq("status", "pendente")
        .eq("assigned_to", profile!.id)
        .lte("data_tarefa", format(new Date(), "yyyy-MM-dd"))
        .order("data_tarefa", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReminderTask[];
    },
  });

  useEffect(() => {
    if (!pending) return;
    const shown = readShown();
    const now = new Date();
    const due = pending.filter((t) => {
      if (shown.includes(t.id)) return false;
      const when = new Date(`${t.data_tarefa}T${(t.hora_tarefa ? String(t.hora_tarefa).slice(0, 5) : "00:00")}:00`);
      return when <= now;
    });
    if (due.length === 0) return;
    setQueue((q) => {
      const ids = new Set(q.map((t) => t.id));
      return [...q, ...due.filter((t) => !ids.has(t.id))];
    });
  }, [pending]);

  const current = queue[0];

  function dismiss() {
    if (!current) return;
    try {
      localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify([...readShown(), current.id]));
    } catch {
      /* ignore */
    }
    setQueue((q) => q.slice(1));
  }

  if (!current) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" /> Lembrete de atividade
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">{current.titulo}</p>
          <p className="text-sm text-muted-foreground">
            {format(parseISO(current.data_tarefa), "dd/MM/yyyy", { locale: ptBR })}
            {current.hora_tarefa ? ` · ${String(current.hora_tarefa).slice(0, 5)}` : ""}
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{current.descricao || "Sem observações."}</p>
        </div>
        <DialogFooter>
          <Button onClick={dismiss}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
