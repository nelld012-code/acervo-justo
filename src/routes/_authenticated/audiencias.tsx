import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, isSameDay, parseISO, startOfDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Printer, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StandardPagination } from "@/components/standard-pagination";
import { parseAudienciasExcel, type ImportAudienciaRow, type ImportAudienciaError } from "@/lib/audiencias-import";
import { printReport } from "@/lib/print-report";
import { toast } from "sonner";

type Audiencia = {
  id: string; nome: string; numero_processo: string | null; parte: string | null; advogado: string | null;
  data_audiencia: string; hora_audiencia: string | null; orgao_julgador: string | null; vara: string | null;
  tipo_audiencia: "Civil" | "Criminal" | "Administrativo"; modalidade: "Presencial" | "Virtual";
  local_audiencia: string | null; link_virtual: string | null; observacao: string | null;
  status: "Agendada" | "Realizada" | "Cancelada"; lembrete_5_dias: boolean; lembrete_3_dias: boolean; lembrete_1_dia: boolean; created_by: string | null;
};
const PAGE_SIZE = 8;
const TIPO = ["Civil", "Criminal", "Administrativo"] as const;
const MODALIDADE = ["Presencial", "Virtual"] as const;
const STATUS = ["Agendada", "Realizada", "Cancelada"] as const;
const EMPTY_FORM = {
  nome: "", numero_processo: "", parte: "", advogado: "", data_audiencia: format(new Date(), "yyyy-MM-dd"), hora_audiencia: "",
  orgao_julgador: "", vara: "", tipo_audiencia: "Civil" as (typeof TIPO)[number], modalidade: "Presencial" as (typeof MODALIDADE)[number],
  local_audiencia: "", link_virtual: "", observacao: "", status: "Agendada" as (typeof STATUS)[number],
  lembrete_5_dias: false, lembrete_3_dias: true, lembrete_1_dia: true,
};
const tipoClass: Record<string, string> = { Civil: "border-blue-500/40 text-blue-700 dark:text-blue-300", Criminal: "border-red-500/40 text-red-700 dark:text-red-300", Administrativo: "border-amber-500/40 text-amber-700 dark:text-amber-300" };
function brDate(v: string) { const [y, m, d] = v.split("-"); return d ? d + "/" + m + "/" + y : "—"; }

function printAudiencia(a: Audiencia) {
  printReport({ title: "Registro de Audiência", subtitle: "J DIMAS GONÇALVES · ESCRITORIO DE ADVOCACIA", sections: [{ heading: "Dados da audiência", columns: ["Campo", "Informação"], rows: [
    ["Nome / Cliente", a.nome], ["Número do Processo", a.numero_processo || "—"], ["Parte", a.parte || "—"], ["Advogado", a.advogado || "—"],
    ["Data", brDate(a.data_audiencia)], ["Hora", a.hora_audiencia || "—"], ["Órgão Julgador", a.orgao_julgador || "—"], ["Vara / Unidade", a.vara || "—"],
    ["Tipo", a.tipo_audiencia], ["Modalidade", a.modalidade], ["Local", a.local_audiencia || "—"], ["Link Virtual", a.link_virtual || "—"], ["Status", a.status], ["Observação", a.observacao || "—"],
  ] }] });
}
function printLista(rows: Audiencia[]) {
  printReport({ title: "Audiências — Lista", subtitle: rows.length + " registro(s)", sections: [{ columns: ["Data", "Hora", "Nome", "Processo", "Tipo", "Modalidade", "Advogado", "Status"],
    rows: rows.map(a => [brDate(a.data_audiencia), a.hora_audiencia || "—", a.nome, a.numero_processo || "—", a.tipo_audiencia, a.modalidade, a.advogado || "—", a.status]) }] });
}

export const Route = createFileRoute("/_authenticated/audiencias")({
  head: () => ({ meta: [{ title: "Audiências - Gestão Judicial" }, { name: "description", content: "Agenda de audiências judiciais com lembretes e importação." }] }),
  component: AudienciasPage,
});

function AudienciasPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Audiencia | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Audiencia | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [weekOffset, setWeekOffset] = useState(0);
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [modalidadeFiltro, setModalidadeFiltro] = useState("Todas");
  const [statusFiltro, setStatusFiltro] = useState("Todos");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportAudienciaRow[]>([]);
  const [importErrors, setImportErrors] = useState<ImportAudienciaError[]>([]);
  const [importPage, setImportPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: audiencias = [], isLoading } = useQuery({
    queryKey: ["audiencias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audiencias").select("*").order("data_audiencia", { ascending: true }).order("hora_audiencia", { ascending: true });
      if (error) throw error;
      return data as Audiencia[];
    },
  });
  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return audiencias.filter(a => {
      if (q && ![a.nome, a.numero_processo ?? "", a.parte ?? "", a.advogado ?? "", a.orgao_julgador ?? "", a.vara ?? ""].some(v => v.toLowerCase().includes(q))) return false;
      if (tipoFiltro !== "Todos" && a.tipo_audiencia !== tipoFiltro) return false;
      if (modalidadeFiltro !== "Todas" && a.modalidade !== modalidadeFiltro) return false;
      if (statusFiltro !== "Todos" && a.status !== statusFiltro) return false;
      return true;
    });
  }, [audiencias, busca, tipoFiltro, modalidadeFiltro, statusFiltro]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome / cliente.");
      if (!form.data_audiencia) throw new Error("Informe a data da audiência.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const payload = {
        nome: form.nome.trim(), numero_processo: form.numero_processo.trim() || null, parte: form.parte.trim() || null, advogado: form.advogado.trim() || null,
        data_audiencia: form.data_audiencia, hora_audiencia: form.hora_audiencia || null, orgao_julgador: form.orgao_julgador.trim() || null,
        vara: form.vara.trim() || null, tipo_audiencia: form.tipo_audiencia, modalidade: form.modalidade, local_audiencia: form.local_audiencia.trim() || null,
        link_virtual: form.link_virtual.trim() || null, observacao: form.observacao.trim() || null, status: form.status,
        lembrete_5_dias: form.lembrete_5_dias, lembrete_3_dias: form.lembrete_3_dias, lembrete_1_dia: form.lembrete_1_dia,
      };
      if (editing) {
        const { error } = await supabase.from("audiencias").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("audiencias").insert({ ...payload, created_by: auth.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Audiência atualizada." : "Audiência registrada."); setDialogOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["audiencias"] }); },
    onError: (e: Error) => toast.error("Não foi possível salvar a audiência.", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("audiencias").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Audiência excluída."); setDeleteTarget(null); qc.invalidateQueries({ queryKey: ["audiencias"] }); },
    onError: (e: Error) => toast.error("Não foi possível excluir.", { description: e.message }),
  });

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true); }
  function openEdit(a: Audiencia) {
    setEditing(a);
    setForm({
      nome: a.nome, numero_processo: a.numero_processo ?? "", parte: a.parte ?? "", advogado: a.advogado ?? "",
      data_audiencia: a.data_audiencia, hora_audiencia: a.hora_audiencia ?? "", orgao_julgador: a.orgao_julgador ?? "", vara: a.vara ?? "",
      tipo_audiencia: a.tipo_audiencia, modalidade: a.modalidade, local_audiencia: a.local_audiencia ?? "", link_virtual: a.link_virtual ?? "",
      observacao: a.observacao ?? "", status: a.status, lembrete_5_dias: a.lembrete_5_dias, lembrete_3_dias: a.lembrete_3_dias, lembrete_1_dia: a.lembrete_1_dia,
    });
    setDialogOpen(true);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try { const result = await parseAudienciasExcel(file); setImportRows(result.rows); setImportErrors(result.errors); setImportPage(1); setImportOpen(true); }
    catch (e) { toast.error("Não foi possível ler a planilha.", { description: e instanceof Error ? e.message : "Arquivo inválido" }); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }
  async function confirmImport() {
    if (!importRows.length) return;
    try {
      const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("Sessão expirada");
      const { error } = await supabase.from("audiencias").insert(importRows.map(r => ({ ...r, created_by: auth.user!.id })));
      if (error) throw error;
      toast.success(importRows.length + " audiência(s) importada(s)."); setImportOpen(false); setImportRows([]); setImportErrors([]); qc.invalidateQueries({ queryKey: ["audiencias"] });
    } catch (e) { toast.error("Não foi possível importar.", { description: e instanceof Error ? e.message : "" }); }
  }
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-xl font-semibold sm:text-2xl">Audiências</h1><p className="text-sm text-muted-foreground">Agenda e controle de audiências judiciais.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><Button onClick={() => printLista(filtered)} variant="outline" className="min-h-11 w-full sm:w-auto"><Printer className="mr-2 h-4 w-4" />Imprimir lista</Button><Button variant="outline" onClick={() => fileRef.current?.click()} className="min-h-11 w-full sm:w-auto"><Upload className="mr-2 h-4 w-4" />Importar Excel</Button><Button onClick={openNew} className="min-h-11 w-full sm:w-auto sm:ml-auto"><Plus className="mr-2 h-4 w-4" />Nova audiência</Button><input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => void importFile(e.target.files?.[0])} /></div>
      </div>
      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Agenda Semanal</CardTitle><p className="text-sm text-muted-foreground">{format(weekStart, "dd MMM", { locale: ptBR })} — {format(addDays(weekStart, 4), "dd MMM yyyy", { locale: ptBR })}</p></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>Hoje</Button><Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight className="h-4 w-4" /></Button></div></CardHeader>
        <CardContent><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">{weekDays.map(day => { const key = format(day, "yyyy-MM-dd"); const items = audiencias.filter(a => a.data_audiencia === key).sort((x,y) => String(x.hora_audiencia ?? "").localeCompare(String(y.hora_audiencia ?? ""))); const today = isSameDay(day, new Date()); return <div key={key} className={`min-h-[230px] rounded-lg border p-3 ${today ? "border-primary/60 bg-primary/5" : "border-border"}`}><div className="mb-3 flex items-center justify-between border-b pb-2"><div><div className="text-xs font-semibold uppercase text-muted-foreground">{format(day, "EEEE", { locale: ptBR })}</div><div className="text-lg font-bold">{format(day, "dd")}</div></div><Button variant="ghost" size="icon" className="h-7 w-7" title="Imprimir dia" onClick={() => printLista(items)}><Printer className="h-3.5 w-3.5" /></Button></div><div className="space-y-2">{items.length === 0 ? <p className="text-xs text-muted-foreground">Sem audiências.</p> : items.map(a => <button key={a.id} type="button" onClick={() => openEdit(a)} className="w-full rounded-md border bg-background/70 p-2 text-left transition hover:bg-muted"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold">{a.hora_audiencia || "Sem hora"} · {a.nome}</div><div className="truncate text-xs text-muted-foreground">{a.advogado || "Sem advogado"}</div></div><Badge variant="outline" className={tipoClass[a.tipo_audiencia]}>{a.tipo_audiencia}</Badge></div><div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground"><span>{a.modalidade}</span>{a.numero_processo && <span>· {a.numero_processo}</span>}</div></button>)}</div></div>; })}</div></CardContent>
      </Card>
      <Card><CardContent className="space-y-3 p-4"><Input placeholder="Buscar por nome, processo, parte, advogado, órgão ou vara" value={busca} onChange={e => { setBusca(e.target.value); setPage(1); }} /><div className="flex flex-wrap gap-2">{["Todos", ...TIPO].map(v => <Button key={v} size="sm" variant={tipoFiltro === v ? "default" : "outline"} onClick={() => { setTipoFiltro(v); setPage(1); }}>{v}</Button>)}{["Todas", ...MODALIDADE].map(v => <Button key={v} size="sm" variant={modalidadeFiltro === v ? "default" : "outline"} onClick={() => { setModalidadeFiltro(v); setPage(1); }}>{v}</Button>)}{["Todos", ...STATUS].map(v => <Button key={v} size="sm" variant={statusFiltro === v ? "default" : "outline"} onClick={() => { setStatusFiltro(v); setPage(1); }}>{v}</Button>)}<Button variant="ghost" size="sm" onClick={() => { setBusca(""); setTipoFiltro("Todos"); setModalidadeFiltro("Todas"); setStatusFiltro("Todos"); setPage(1); }}><X className="mr-1 h-4 w-4" />Limpar filtros</Button></div></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Audiências ({filtered.length})</CardTitle></CardHeader><CardContent className="p-0 sm:p-6 sm:pt-0">{isLoading ? <p className="p-4 text-sm text-muted-foreground">Carregando...</p> : filtered.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma audiência encontrada.</p> : <><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="p-2">Data</th><th className="p-2">Hora</th><th className="p-2">Nome</th><th className="p-2">Processo</th><th className="p-2">Tipo</th><th className="p-2">Modalidade</th><th className="p-2">Advogado</th><th className="p-2">Status</th><th className="p-2 text-right">Ações</th></tr></thead><tbody>{paged.map(a => <tr key={a.id} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{brDate(a.data_audiencia)}</td><td className="p-2 whitespace-nowrap">{a.hora_audiencia || "—"}</td><td className="p-2 font-medium">{a.nome}</td><td className="p-2">{a.numero_processo || "—"}</td><td className="p-2"><Badge variant="outline" className={tipoClass[a.tipo_audiencia]}>{a.tipo_audiencia}</Badge></td><td className="p-2">{a.modalidade}</td><td className="p-2">{a.advogado || "—"}</td><td className="p-2">{a.status}</td><td className="p-2"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Imprimir" onClick={() => printAudiencia(a)}><Printer className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Excluir" onClick={() => setDeleteTarget(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>{a.modalidade === "Virtual" && a.link_virtual && <Button size="icon" variant="ghost" title="Abrir link" onClick={() => window.open(a.link_virtual!, "_blank", "noopener,noreferrer")}><ExternalLink className="h-4 w-4" /></Button>}</div></td></tr>)}</tbody></table></div><StandardPagination current={safePage} total={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} /></>}</CardContent></Card>
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}><DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[850px]"><DialogHeader><DialogTitle>{editing ? "Editar audiência" : "Nova audiência"}</DialogTitle><DialogDescription>Preencha os dados completos da audiência.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5 sm:col-span-2"><Label>Nome / Cliente *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div><div className="space-y-1.5"><Label>Número do Processo</Label><Input value={form.numero_processo} onChange={e => setForm({ ...form, numero_processo: e.target.value })} /></div><div className="space-y-1.5"><Label>Parte</Label><Input value={form.parte} onChange={e => setForm({ ...form, parte: e.target.value })} /></div><div className="space-y-1.5"><Label>Advogado</Label><Input value={form.advogado} onChange={e => setForm({ ...form, advogado: e.target.value })} /></div><div className="space-y-1.5"><Label>Órgão Julgador</Label><Input value={form.orgao_julgador} onChange={e => setForm({ ...form, orgao_julgador: e.target.value })} /></div><div className="space-y-1.5"><Label>Vara / Unidade</Label><Input value={form.vara} onChange={e => setForm({ ...form, vara: e.target.value })} /></div><div className="space-y-1.5"><Label>Data da audiência *</Label><Input type="date" value={form.data_audiencia} onChange={e => setForm({ ...form, data_audiencia: e.target.value })} /></div><div className="space-y-1.5"><Label>Hora da audiência</Label><Input type="time" value={form.hora_audiencia} onChange={e => setForm({ ...form, hora_audiencia: e.target.value })} /></div><div className="space-y-1.5"><Label>Tipo de audiência</Label><Select value={form.tipo_audiencia} onValueChange={v => setForm({ ...form, tipo_audiencia: v as (typeof TIPO)[number] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPO.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Modalidade</Label><Select value={form.modalidade} onValueChange={v => setForm({ ...form, modalidade: v as (typeof MODALIDADE)[number] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODALIDADE.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5 sm:col-span-2"><Label>Local da audiência</Label><Input value={form.local_audiencia} onChange={e => setForm({ ...form, local_audiencia: e.target.value })} placeholder="Use para audiência presencial" /></div><div className="space-y-1.5 sm:col-span-2"><Label>Link da audiência virtual</Label><Input value={form.link_virtual} onChange={e => setForm({ ...form, link_virtual: e.target.value })} placeholder="Use para audiência virtual" /></div><div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm({ ...form, status: v as (typeof STATUS)[number] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Observação</Label><Textarea value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} rows={3} /></div><div className="sm:col-span-2 space-y-2 rounded-md border p-3"><p className="text-sm font-medium">Lembretes popup</p><div className="flex flex-wrap gap-4">{[[5,"5 dias antes","lembrete_5_dias"],[3,"3 dias antes","lembrete_3_dias"],[1,"1 dia antes","lembrete_1_dia"]].map(([days,label,key]) => { const field = key as "lembrete_5_dias" | "lembrete_3_dias" | "lembrete_1_dia"; return <label key={String(key)} className="flex items-center gap-2 text-sm"><Checkbox checked={form[field]} onCheckedChange={v => setForm({ ...form, [field]: v === true })} /><span>{label}</span></label>; })}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Salvando..." : editing ? "Salvar alterações" : "Registrar audiência"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="h-[80vh] max-h-[90vh] w-[calc(100vw-2rem)] overflow-hidden sm:max-w-6xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Prévia da importação</DialogTitle><DialogDescription>Use Nome/Cliente e Data da audiência. As outras colunas são opcionais.</DialogDescription></DialogHeader><div className="min-h-0 flex-1 space-y-3 overflow-auto">{importErrors.length > 0 && <div className="rounded-md border p-3 text-sm">{importErrors.map(e => <div key={e.line}>Linha {e.line}: {e.message}</div>)}</div>}<div className="overflow-auto rounded-md border"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Data</th><th className="p-2">Hora</th><th className="p-2">Nome</th><th className="p-2">Processo</th><th className="p-2">Tipo</th><th className="p-2">Modalidade</th><th className="p-2">Advogado</th></tr></thead><tbody>{importRows.slice((importPage-1)*PAGE_SIZE, importPage*PAGE_SIZE).map((r,i)=><tr key={r.nome+i} className="border-b"><td className="p-2">{brDate(r.data_audiencia)}</td><td className="p-2">{r.hora_audiencia||"—"}</td><td className="p-2">{r.nome}</td><td className="p-2">{r.numero_processo||"—"}</td><td className="p-2">{r.tipo_audiencia}</td><td className="p-2">{r.modalidade}</td><td className="p-2">{r.advogado||"—"}</td></tr>)}</tbody></table></div></div><DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><StandardPagination current={importPage} total={Math.max(1, Math.ceil(importRows.length/PAGE_SIZE))} totalItems={importRows.length} pageSize={PAGE_SIZE} onChange={setImportPage} /><div className="flex gap-2"><Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button><Button disabled={!importRows.length} onClick={() => void confirmImport()}>Confirmar importação ({importRows.length})</Button></div></DialogFooter></DialogContent></Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir audiência?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

type ReminderItem = Audiencia & { dias: number };
export function AudienciaReminder() {
  const [tick, setTick] = useState(0);
  const [queue, setQueue] = useState<ReminderItem[]>([]);
  const [shown, setShown] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("audiencias-lembretes-exibidos") ?? "[]") as string[]; } catch { return []; }
  });
  useEffect(() => { const timer = window.setInterval(() => setTick(v => v + 1), 30000); return () => window.clearInterval(timer); }, []);
  const { data: user } = useQuery({ queryKey: ["audiencia-reminder-user"], queryFn: async () => (await supabase.auth.getUser()).data.user });
  const { data: items = [] } = useQuery({
    queryKey: ["audiencia-reminders", user?.id, tick], enabled: !!user?.id,
    queryFn: async () => { const { data, error } = await supabase.from("audiencias").select("*").eq("status", "Agendada"); if (error) throw error; return data as Audiencia[]; },
  });
  useEffect(() => {
    if (!items.length) return;
    const today = startOfDay(new Date());
    const due: ReminderItem[] = [];
    for (const a of items) {
      const days = differenceInCalendarDays(startOfDay(parseISO(a.data_audiencia)), today);
      const should = (days === 5 && a.lembrete_5_dias) || (days === 3 && a.lembrete_3_dias) || (days === 1 && a.lembrete_1_dia);
      const key = a.id + ":" + days;
      if (should && !shown.includes(key)) due.push({ ...a, dias: days });
    }
    if (due.length) setQueue(q => q.length ? q : due);
  }, [items, shown]);
  const current = queue[0];
  function dismiss() {
    if (!current) return;
    const key = current.id + ":" + current.dias;
    const next = [...shown, key];
    setShown(next);
    try { localStorage.setItem("audiencias-lembretes-exibidos", JSON.stringify(next)); } catch {}
    setQueue(q => q.slice(1));
  }
  if (!current) return null;
  return <Dialog open onOpenChange={open => !open && dismiss()}>
    <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Bell className="h-4 w-4 text-primary" />Lembrete de audiência</DialogTitle><DialogDescription>Audiência em {current.dias} {current.dias === 1 ? "dia" : "dias"}.</DialogDescription></DialogHeader>
      <div className="space-y-2"><p className="font-semibold">{current.nome}</p><p className="text-sm text-muted-foreground">{brDate(current.data_audiencia)}{current.hora_audiencia ? " · " + current.hora_audiencia : ""} · {current.tipo_audiencia} · {current.modalidade}</p>{current.numero_processo && <p className="text-sm">Processo: {current.numero_processo}</p>}{current.orgao_julgador && <p className="text-sm">Órgão: {current.orgao_julgador}{current.vara ? " · " + current.vara : ""}</p>}</div>
      <DialogFooter><Button onClick={dismiss}>Entendi</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
