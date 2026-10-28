import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { whatsappLink } from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, CheckCircle2, CircleDollarSign, Clock3, Filter, Handshake, Mail, MessageCircle, Pencil, Phone, Plus, RotateCcw, Search, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({ meta: [{ title: "CRM - Acervo Justo" }, { name: "description", content: "Funil de oportunidades e relacionamento com clientes." }] }),
  component: CrmPage,
});

const ETAPAS = ["Novo", "Em contato", "Em negociação", "Convertido", "Perdido"] as const;
type Etapa = (typeof ETAPAS)[number];
const ETAPA_ESTILO: Record<Etapa, { coluna: string; indicador: string; barra: string; texto: string }> = {
  Novo: { coluna: "border-sky-400/20 bg-sky-950/20", indicador: "bg-sky-400", barra: "bg-sky-400", texto: "text-sky-300" },
  "Em contato": { coluna: "border-blue-400/20 bg-blue-950/20", indicador: "bg-blue-400", barra: "bg-blue-400", texto: "text-blue-300" },
  "Em negociação": { coluna: "border-amber-400/20 bg-amber-950/20", indicador: "bg-amber-400", barra: "bg-amber-400", texto: "text-amber-300" },
  Convertido: { coluna: "border-emerald-400/20 bg-emerald-950/20", indicador: "bg-emerald-400", barra: "bg-emerald-400", texto: "text-emerald-300" },
  Perdido: { coluna: "border-rose-400/20 bg-rose-950/20", indicador: "bg-rose-400", barra: "bg-rose-400", texto: "text-rose-300" },
};
const ORIGENS = ["Indicação", "WhatsApp", "Telefone", "Site", "Redes sociais", "Recepção", "Outro"] as const;
const PRIORIDADES = ["Baixa", "Normal", "Alta"] as const;
const TIPOS_ATIVIDADE = ["Ligação", "WhatsApp", "E-mail", "Reunião", "Observação"] as const;

type Lead = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  origem: string;
  servico_interesse: string | null;
  status: Etapa;
  prioridade: string;
  valor_estimado: number | null;
  next_follow_up: string | null;
  notas: string | null;
  last_contact_at: string | null;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type Atividade = {
  id: string;
  lead_id: string;
  tipo: string;
  descricao: string;
  data_atividade: string;
  proximo_contato: string | null;
  created_by: string | null;
  created_at: string;
};

type LeadForm = {
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  servico_interesse: string;
  status: Etapa;
  prioridade: string;
  valor_estimado: string;
  next_follow_up: string;
  notas: string;
};
const FORM_VAZIO: LeadForm = {
  nome: "", telefone: "", email: "", origem: "Indicação", servico_interesse: "",
  status: "Novo", prioridade: "Normal", valor_estimado: "", next_follow_up: "", notas: "",
};

function moeda(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBR(value: string | null | undefined) {
  if (!value) return "Não definido";
  const parts = value.slice(0, 10).split("-");
  return parts.length === 3 ? parts.reverse().join("/") : value;
}
function horarioBR(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Ainda não houve contato";
}
function isVencido(value: string | null | undefined) {
  return !!value && value < new Date().toISOString().slice(0, 10);
}

function CrmPage() {
  const { perms } = useProfile();
  const qc = useQueryClient();
  // CRM tables are not yet represented in the generated Supabase Database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [busca, setBusca] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("Todas");
  const [filtroPrioridade, setFiltroPrioridade] = useState("Todas");
  const [somenteRetornosPendentes, setSomenteRetornosPendentes] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadForm>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [atividadeLead, setAtividadeLead] = useState<Lead | null>(null);
  const [tipoAtividade, setTipoAtividade] = useState<string>("WhatsApp");
  const [descricaoAtividade, setDescricaoAtividade] = useState("");
  const [proximoContato, setProximoContato] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [historicoLead, setHistoricoLead] = useState<Lead | null>(null);

  const leadsQuery = useQuery<Lead[]>({
    queryKey: ["crm-leads"],
    queryFn: async () => {
      const { data, error } = await sb.from("crm_leads").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
  const activitiesQuery = useQuery<Atividade[]>({
    queryKey: ["crm-activities", historicoLead?.id],
    enabled: !!historicoLead,
    queryFn: async () => {
      const { data, error } = await sb.from("crm_activities").select("*").eq("lead_id", historicoLead!.id).order("data_atividade", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as Atividade[];
    },
  });

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    const hoje = new Date().toISOString().slice(0, 10);
    return leads.filter((lead) => {
      const matchesSearch = !q || [lead.nome, lead.telefone ?? "", lead.email ?? "", lead.servico_interesse ?? "", lead.origem].some((v) => v.toLocaleLowerCase("pt-BR").includes(q));
      const matchesStage = filtroEtapa === "Todas" || lead.status === filtroEtapa;
      const matchesPriority = filtroPrioridade === "Todas" || lead.prioridade === filtroPrioridade;
      const temRetornoPendente = !!lead.next_follow_up && lead.next_follow_up <= hoje && !["Convertido", "Perdido"].includes(lead.status);
      const matchesFollowUp = !somenteRetornosPendentes || temRetornoPendente;
      return matchesSearch && matchesStage && matchesPriority && matchesFollowUp;
    });
  }, [leads, busca, filtroEtapa, filtroPrioridade, somenteRetornosPendentes]);

  const totalAtivos = leads.filter((l) => !["Convertido", "Perdido"].includes(l.status)).length;
  const valorAtivo = leads.filter((l) => !["Convertido", "Perdido"].includes(l.status)).reduce((sum, l) => sum + Number(l.valor_estimado ?? 0), 0);
  const followUps = leads.filter((l) => l.next_follow_up && l.next_follow_up <= new Date().toISOString().slice(0, 10) && !["Convertido", "Perdido"].includes(l.status)).length;
  const convertidos = leads.filter((l) => l.status === "Convertido").length;

  function novoLead() {
    setEditing(null);
    setForm({ ...FORM_VAZIO });
    setFormOpen(true);
  }
  function editarLead(lead: Lead) {
    setEditing(lead);
    setForm({
      nome: lead.nome,
      telefone: lead.telefone ?? "",
      email: lead.email ?? "",
      origem: lead.origem || "Indicação",
      servico_interesse: lead.servico_interesse ?? "",
      status: lead.status,
      prioridade: lead.prioridade || "Normal",
      valor_estimado: lead.valor_estimado == null ? "" : String(lead.valor_estimado),
      next_follow_up: lead.next_follow_up ?? "",
      notas: lead.notas ?? "",
    });
    setFormOpen(true);
  }
  function setCampo<K extends keyof LeadForm>(key: K, value: LeadForm[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  async function salvarLead() {
    if (!form.nome.trim()) return toast.error("Informe o nome do contato.");
    if (!form.telefone.trim() && !form.email.trim()) return toast.error("Informe um telefone ou e-mail para contato.");
    if (form.status === "Convertido" && !editing?.client_id) return toast.error("Use o botão Converter para criar o cadastro do cliente.");
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        nome: form.nome.trim(),
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
        origem: form.origem,
        servico_interesse: form.servico_interesse.trim() || null,
        status: form.status,
        prioridade: form.prioridade,
        valor_estimado: form.valor_estimado.trim() ? Number(form.valor_estimado) : null,
        next_follow_up: form.next_follow_up || null,
        notas: form.notas.trim() || null,
      };
      if (editing) {
        const { error } = await sb.from("crm_leads").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Oportunidade atualizada.");
      } else {
        const { error } = await sb.from("crm_leads").insert({ ...payload, created_by: auth.user?.id ?? null });
        if (error) throw error;
        toast.success("Contato adicionado ao CRM.");
      }
      setFormOpen(false);
      await qc.invalidateQueries({ queryKey: ["crm-leads"] });
    } catch (error) {
      toast.error("Não foi possível salvar o contato.", { description: error instanceof Error ? error.message : "Verifique a conexão e a migração do CRM." });
    } finally {
      setSaving(false);
    }
  }

  async function alterarEtapa(lead: Lead, etapa: string) {
    if (!ETAPAS.includes(etapa as Etapa)) return;
    if (etapa === "Convertido" && !lead.client_id) {
      return toast.error("Use o botão Converter para criar o cadastro do cliente.");
    }
    const { error } = await sb.from("crm_leads").update({ status: etapa }).eq("id", lead.id);
    if (error) return toast.error("Não foi possível alterar a etapa.", { description: error.message });
    toast.success("Etapa atualizada.");
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
  }

  async function excluirLead(lead: Lead) {
    if (!perms.isAdmin && perms.cargo !== "advogado") return toast.error("Somente administradores e advogados podem excluir oportunidades.");
    if (!window.confirm("Excluir o contato " + lead.nome + " e seu histórico do CRM?")) return;
    const { error } = await sb.from("crm_leads").delete().eq("id", lead.id);
    if (error) return toast.error("Não foi possível excluir.", { description: error.message });
    toast.success("Contato excluído.");
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
    if (historicoLead?.id === lead.id) setHistoricoLead(null);
  }

  function abrirAtividade(lead: Lead) {
    setAtividadeLead(lead);
    setTipoAtividade("WhatsApp");
    setDescricaoAtividade("");
    setProximoContato(lead.next_follow_up ?? "");
  }
  async function salvarAtividade() {
    if (!atividadeLead || !descricaoAtividade.trim()) return toast.error("Descreva o contato realizado.");
    setSavingActivity(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error: activityError } = await sb.from("crm_activities").insert({
        lead_id: atividadeLead.id,
        tipo: tipoAtividade,
        descricao: descricaoAtividade.trim(),
        proximo_contato: proximoContato || null,
        created_by: auth.user?.id ?? null,
      });
      if (activityError) throw activityError;
      const { error: leadError } = await sb.from("crm_leads").update({
        last_contact_at: new Date().toISOString(),
        next_follow_up: proximoContato || null,
      }).eq("id", atividadeLead.id);
      if (leadError) throw leadError;
      toast.success("Interação registrada.");
      setAtividadeLead(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["crm-leads"] }),
        qc.invalidateQueries({ queryKey: ["crm-activities", historicoLead?.id] }),
      ]);
    } catch (error) {
      toast.error("Não foi possível registrar a interação.", { description: error instanceof Error ? error.message : "" });
    } finally {
      setSavingActivity(false);
    }
  }

  async function converterCliente(lead: Lead) {
    if (!lead.telefone?.trim()) return toast.error("Antes de converter, informe um telefone no cadastro do contato.");
    if (!window.confirm("Converter " + lead.nome + " em cliente do sistema?")) return;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data: novoCliente, error: clientError } = await sb.from("clients").insert({
        nome: lead.nome,
        telefone: lead.telefone,
        email: lead.email,
        tipo_acao: lead.servico_interesse,
        data_atendimento: new Date().toISOString().slice(0, 10),
        resumo_atendimento: lead.notas,
        observacoes: "Convertido do CRM. Origem: " + lead.origem,
        created_by: auth.user?.id ?? null,
      }).select("id").single();
      if (clientError) throw clientError;
      const { error: leadError } = await sb.from("crm_leads").update({ status: "Convertido", client_id: novoCliente.id }).eq("id", lead.id);
      if (leadError) throw leadError;
      toast.success("Contato convertido em cliente.");
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    } catch (error) {
      toast.error("Não foi possível concluir a conversão.", { description: error instanceof Error ? error.message : "" });
    }
  }

  if (leadsQuery.isLoading) {
    return <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">Carregando CRM...</div>;
  }
  if (leadsQuery.error) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-semibold">CRM — Relacionamento</h1>
        <Card><CardContent className="space-y-2 p-5">
          <p className="font-medium">O CRM ainda não conseguiu carregar os dados.</p>
          <p className="text-sm text-muted-foreground">Se este módulo acabou de ser instalado, confirme que a migração SQL do arquivo supabase/migrations/20261028130000_create_crm.sql foi executada no projeto Supabase.</p>
          <p className="break-words text-xs text-muted-foreground">{leadsQuery.error instanceof Error ? leadsQuery.error.message : "Erro de conexão."}</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-5 shadow-xl shadow-slate-950/30 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
              <Sparkles className="h-3.5 w-3.5" /> Relacionamento e oportunidades
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">CRM</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">Organize seus contatos, acompanhe cada oportunidade e não perca o próximo retorno.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"><strong className="text-white">{leads.length}</strong> contato(s) cadastrados</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"><strong className="text-white">{filtrados.length}</strong> exibidos no quadro</span>
            </div>
          </div>
          <Button onClick={novoLead} className="shrink-0 bg-sky-400 font-semibold text-slate-950 hover:bg-sky-300">
            <Plus className="mr-2 h-4 w-4" /> Novo contato
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <Card className="border-slate-700/80 bg-slate-900/70 shadow-lg shadow-slate-950/10 transition-colors hover:border-slate-600"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-3 text-sky-300"><Users className="h-5 w-5" /></div><div><p className="text-sm text-muted-foreground">Oportunidades ativas</p><p className="text-2xl font-semibold">{totalAtivos}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-emerald-300"><CircleDollarSign className="h-5 w-5" /></div><div><p className="text-sm text-muted-foreground">Valor estimado ativo</p><p className="text-xl font-semibold">{moeda(valorAtivo)}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-amber-300"><CalendarClock className="h-5 w-5" /></div><div><p className="text-sm text-muted-foreground">Retornos pendentes</p><p className="text-2xl font-semibold">{followUps}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-violet-300"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-sm text-muted-foreground">Convertidos em clientes</p><p className="text-2xl font-semibold">{convertidos}</p></div></CardContent></Card>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"><Filter className="h-3.5 w-3.5" /> Localizar oportunidades</div>
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, telefone, e-mail ou serviço..." className="h-10 border-slate-700 bg-slate-950/60 pl-9" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
            <Select value={filtroEtapa} onValueChange={setFiltroEtapa}><SelectTrigger className="h-10 w-full border-slate-700 bg-slate-950/60 lg:w-48"><SelectValue placeholder="Etapa" /></SelectTrigger><SelectContent><SelectItem value="Todas">Todas as etapas</SelectItem>{ETAPAS.map((etapa) => <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>)}</SelectContent></Select>
            <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}><SelectTrigger className="h-10 w-full border-slate-700 bg-slate-950/60 lg:w-40"><SelectValue placeholder="Prioridade" /></SelectTrigger><SelectContent><SelectItem value="Todas">Todas prioridades</SelectItem>{PRIORIDADES.map((prioridade) => <SelectItem key={prioridade} value={prioridade}>{prioridade}</SelectItem>)}</SelectContent></Select>
          </div>
          <Button type="button" variant={somenteRetornosPendentes ? "default" : "outline"} onClick={() => setSomenteRetornosPendentes((v) => !v)} className={somenteRetornosPendentes ? "h-10 border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-300" : "h-10 border-slate-700 bg-slate-950/50 text-slate-200 hover:bg-slate-800"}>
            <CalendarClock className="mr-2 h-4 w-4" /> Retornos pendentes
          </Button>
          <Button type="button" variant="ghost" aria-label="Limpar filtros" title="Limpar filtros" onClick={() => { setBusca(""); setFiltroEtapa("Todas"); setFiltroPrioridade("Todas"); setSomenteRetornosPendentes(false); }} className="h-10 shrink-0 text-slate-400 hover:text-white">
            <RotateCcw className="mr-2 h-4 w-4" /><span className="lg:hidden">Limpar filtros</span>
          </Button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 [scrollbar-color:#475569_transparent] [scrollbar-width:thin]">
        {ETAPAS.map((etapa) => {
          const etapaLeads = filtrados.filter((lead) => lead.status === etapa);
          const totalEtapa = etapaLeads.reduce((sum, lead) => sum + Number(lead.valor_estimado ?? 0), 0);
          return (
            <section key={etapa} className={`w-[292px] min-w-[292px] shrink-0 rounded-xl border p-3 ${ETAPA_ESTILO[etapa].coluna}`}>
              <div className="mb-3 h-1 rounded-full bg-slate-800"><div className={`h-1 w-2/5 rounded-full ${ETAPA_ESTILO[etapa].barra}`} /></div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><span className={`h-2 w-2 rounded-full ${ETAPA_ESTILO[etapa].indicador}`} />{etapa}</h2><p className="mt-1 text-xs text-slate-400">{etapaLeads.length} contato(s)</p></div>
                <Badge variant="outline" className={`border-slate-700 bg-slate-950/40 text-[11px] ${ETAPA_ESTILO[etapa].texto}`}>{moeda(totalEtapa)}</Badge>
              </div>
              <div className="space-y-3">
                {etapaLeads.map((lead) => (
                  <Card key={lead.id} className="group overflow-hidden border-slate-700/70 bg-slate-950/75 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-500 hover:shadow-lg hover:shadow-slate-950/40">
                    <CardHeader className="space-y-2 p-3 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="min-w-0 break-words text-sm text-slate-100">{lead.nome}</CardTitle>
                        <Badge variant={lead.prioridade === "Alta" ? "destructive" : lead.prioridade === "Baixa" ? "outline" : "secondary"}>{lead.prioridade}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{lead.servico_interesse || "Serviço não informado"}</p>
                    </CardHeader>
                    <CardContent className="space-y-3 p-3 pt-1">
                      <div className="space-y-1.5 text-xs text-slate-300">
                        {lead.telefone && <p className="flex min-w-0 items-center gap-2 break-all"><Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{lead.telefone}</p>}
                        {lead.email && <p className="flex min-w-0 items-center gap-2 break-all"><Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{lead.email}</p>}
                        <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />Retorno: <span className={isVencido(lead.next_follow_up) ? "font-semibold text-destructive" : ""}>{dataBR(lead.next_follow_up)}</span></p>
                        <p className="flex items-center gap-2"><CircleDollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{moeda(lead.valor_estimado)}</p>
                        <p className="text-slate-500">Origem: {lead.origem}</p>
                      </div>
                      <Select value={lead.status} onValueChange={(value) => void alterarEtapa(lead, value)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{ETAPAS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" onClick={() => editarLead(lead)}><Pencil className="mr-1 h-3 w-3" />Editar</Button>
                        <Button size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" onClick={() => abrirAtividade(lead)}><MessageCircle className="mr-1 h-3 w-3" />Interação</Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setHistoricoLead(lead)} title="Ver histórico"><Clock3 className="h-3 w-3" /></Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {lead.telefone && <Button size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" onClick={() => window.open(whatsappLink(lead.telefone ?? ""), "_blank", "noopener,noreferrer")}><MessageCircle className="mr-1 h-3 w-3" />WhatsApp</Button>}
                        {lead.status !== "Convertido" && perms.canManageClients && <Button size="sm" className="h-8 flex-1 px-2 text-xs" onClick={() => void converterCliente(lead)}><Handshake className="mr-1 h-3 w-3" />Converter</Button>}
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t pt-2">
                        <span className="text-[11px] text-muted-foreground">{horarioBR(lead.last_contact_at)}</span>
                        {(perms.isAdmin || perms.cargo === "advogado") && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir contato" onClick={() => void excluirLead(lead)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {!etapaLeads.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhum contato nesta etapa.</div>}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar contato" : "Novo contato do CRM"}</DialogTitle><DialogDescription>Cadastre uma oportunidade e programe o próximo retorno.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Nome *</Label><Input autoFocus value={form.nome} onChange={(e) => setCampo("nome", e.target.value)} placeholder="Nome completo" /></div>
            <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setCampo("telefone", e.target.value)} placeholder="(31) 99999-9999" /></div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setCampo("email", e.target.value)} placeholder="contato@exemplo.com" /></div>
            <div className="space-y-1.5"><Label>Origem do contato</Label><Select value={form.origem} onValueChange={(v) => setCampo("origem", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ORIGENS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Prioridade</Label><Select value={form.prioridade} onValueChange={(v) => setCampo("prioridade", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORIDADES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Serviço / tipo de ação desejada</Label><Input value={form.servico_interesse} onChange={(e) => setCampo("servico_interesse", e.target.value)} placeholder="Ex.: ação trabalhista, família..." /></div>
            <div className="space-y-1.5"><Label>Valor estimado (R$)</Label><Input type="number" min="0" step="0.01" value={form.valor_estimado} onChange={(e) => setCampo("valor_estimado", e.target.value)} placeholder="0,00" /></div>
            <div className="space-y-1.5"><Label>Etapa do funil</Label><Select value={form.status} onValueChange={(v) => setCampo("status", v as Etapa)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ETAPAS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Próximo contato</Label><Input type="date" value={form.next_follow_up} onChange={(e) => setCampo("next_follow_up", e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Observações</Label><Textarea value={form.notas} onChange={(e) => setCampo("notas", e.target.value)} rows={3} placeholder="Resumo da necessidade, documentos pendentes ou próximos passos..." /></div>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void salvarLead()} disabled={saving}>{saving ? "Salvando..." : "Salvar contato"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!atividadeLead} onOpenChange={(open) => !open && setAtividadeLead(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar interação</DialogTitle><DialogDescription>{atividadeLead?.nome} — registre o contato e o próximo retorno.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Tipo de interação</Label><Select value={tipoAtividade} onValueChange={setTipoAtividade}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_ATIVIDADE.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Resumo da interação *</Label><Textarea value={descricaoAtividade} onChange={(e) => setDescricaoAtividade(e.target.value)} rows={4} placeholder="O que foi conversado? Houve retorno? Quais documentos faltam?" /></div>
            <div className="space-y-1.5"><Label>Próximo contato</Label><Input type="date" value={proximoContato} onChange={(e) => setProximoContato(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAtividadeLead(null)} disabled={savingActivity}>Cancelar</Button><Button onClick={() => void salvarAtividade()} disabled={savingActivity}>{savingActivity ? "Salvando..." : "Registrar interação"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historicoLead} onOpenChange={(open) => !open && setHistoricoLead(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Histórico de relacionamento</DialogTitle><DialogDescription>{historicoLead?.nome}</DialogDescription></DialogHeader>
          {activitiesQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando histórico...</p> : activitiesQuery.error ? <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p> : !(activitiesQuery.data ?? []).length ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p> : (
            <div className="space-y-3">
              {(activitiesQuery.data ?? []).map((activity) => (
                <div key={activity.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="secondary">{activity.tipo}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {horarioBR(activity.data_atividade)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{activity.descricao}</p>
                  {activity.proximo_contato && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Próximo contato: {dataBR(activity.proximo_contato)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setHistoricoLead(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
