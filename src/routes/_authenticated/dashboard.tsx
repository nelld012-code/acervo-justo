import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, FolderOpen, Archive, CheckCircle2, Clock, TrendingUp, CalendarClock, AlertTriangle } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/documents";
import { WeeklyAgenda } from "@/components/weekly-agenda";
import { diasRestantes, type Prazo } from "@/lib/prazos-view";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - Gestão Judicial" }] }),
  component: Dashboard,
});

type FiltroPrazo = "todos" | "vencidos" | "hoje" | "3dias" | "7dias" | "concluidos";

const FILTROS_PRAZO: { value: FiltroPrazo; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "vencidos", label: "Vencidos" },
  { value: "hoje", label: "Hoje" },
  { value: "3dias", label: "Próximos 3 dias" },
  { value: "7dias", label: "Próximos 7 dias" },
  { value: "concluidos", label: "Concluídos" },
];

const ADVOGADOS_FILTRO = ["Dr. Dimas", "Dra Cassia", "Dr. Wesley"];

function Dashboard() {
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>("todos");
  const [filtroAdvogado, setFiltroAdvogado] = useState("Todos");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: docs, error } = await supabase
        .from("documents")
        .select("id, internal_id, advogado, cliente, tipo_documento, estado_processual, created_at, data_documento, valor_total_processo, valor_recebido_total");
      if (error) throw error;
      return docs ?? [];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["payments-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("valor, data_pagamento");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["audit-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, timestamp, document_id, details")
        .order("timestamp", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prazos } = useQuery({
    queryKey: ["prazos-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prazos")
        .select("id, nome, numero_processo, advogado, data_limite, status");
      if (error) throw error;
      return (data ?? []) as Pick<Prazo, "id" | "nome" | "numero_processo" | "advogado" | "data_limite" | "status">[];
    },
  });

  const prazosAndamento = (prazos ?? []).filter((p) => p.status === "Em andamento");
  const prazosVencidos = prazosAndamento.filter((p) => diasRestantes(p.data_limite) < 0);
  const prazosHoje = prazosAndamento.filter((p) => diasRestantes(p.data_limite) === 0);
  const prazos3Dias = prazosAndamento.filter((p) => {
    const dias = diasRestantes(p.data_limite);
    return dias > 0 && dias <= 3;
  });
  const prazos7Dias = prazosAndamento.filter((p) => {
    const dias = diasRestantes(p.data_limite);
    return dias > 3 && dias <= 7;
  });
  const prazosProximos = prazosAndamento.filter((p) => diasRestantes(p.data_limite) <= 6).length;

  const prazoResumo = [
    { filtro: "hoje" as const, label: "Vencem hoje", value: prazosHoje.length, icon: "🔴", className: "border-red-500/40 bg-red-500/5 hover:bg-red-500/10" },
    { filtro: "3dias" as const, label: "Próximos 3 dias", value: prazos3Dias.length, icon: "🟠", className: "border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10" },
    { filtro: "7dias" as const, label: "Próximos 7 dias", value: prazosAndamento.filter((p) => { const dias = diasRestantes(p.data_limite); return dias >= 1 && dias <= 7; }).length, icon: "🟡", className: "border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/10" },
    { filtro: "concluidos" as const, label: "Concluídos", value: (prazos ?? []).filter((p) => p.status === "Concluído").length, icon: "🟢", className: "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10" },
  ];

  function abrirPrazosComFiltro(filtro: FiltroPrazo) {
    window.location.href = `/prazos?filtro=${encodeURIComponent(filtro)}`;
  }

  const prazosFiltrados = useMemo(() => {
    return (prazos ?? []).filter((p) => {
      const dias = diasRestantes(p.data_limite);
      const passaAdvogado = filtroAdvogado === "Todos" || p.advogado === filtroAdvogado;
      if (!passaAdvogado) return false;

      switch (filtroPrazo) {
        case "vencidos": return p.status === "Em andamento" && dias < 0;
        case "hoje": return p.status === "Em andamento" && dias === 0;
        case "3dias": return p.status === "Em andamento" && dias > 0 && dias <= 3;
        case "7dias": return p.status === "Em andamento" && dias > 0 && dias <= 7;
        case "concluidos": return p.status === "Concluído";
        default: return true;
      }
    }).sort((a, b) => (a.data_limite ?? "9999-12-31").localeCompare(b.data_limite ?? "9999-12-31"));
  }, [prazos, filtroPrazo, filtroAdvogado]);

  const total = data?.length ?? 0;
  const counts = {
    Aberto: data?.filter((d) => d.estado_processual === "Aberto").length ?? 0,
    "Em revisão": data?.filter((d) => d.estado_processual === "Em revisão").length ?? 0,
    Arquivado: data?.filter((d) => d.estado_processual === "Arquivado").length ?? 0,
    Encerrado: data?.filter((d) => d.estado_processual === "Encerrado").length ?? 0,
  };

  const monthly: { mes: string; total: number }[] = [];
  const monthlyCash: { mes: string; total: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = format(d, "yyyy-MM");
    const label = format(d, "MMM", { locale: ptBR });
    monthly.push({
      mes: label,
      total: data?.filter((doc) => doc.created_at.startsWith(key)).length ?? 0,
    });
    monthlyCash.push({
      mes: label,
      total: (payments ?? []).filter((p) => (p.data_pagamento ?? "").startsWith(key)).reduce((s, p) => s + Number(p.valor ?? 0), 0),
    });
  }

  const cards = [
    { title: "Total de Documentos", value: total, icon: FileText, color: "text-primary" },
    { title: "Abertos", value: counts.Aberto, icon: FolderOpen, color: "text-blue-600" },
    { title: "Em Revisão", value: counts["Em revisão"], icon: Clock, color: "text-amber-600" },
    { title: "Arquivados", value: counts.Arquivado, icon: Archive, color: "text-muted-foreground" },
    { title: "Encerrados", value: counts.Encerrado, icon: CheckCircle2, color: "text-emerald-600" },
    { title: "Prazos próximos", value: prazosProximos, icon: CalendarClock, color: "text-amber-500" },
  ];

  const actionLabel: Record<string, string> = {
    viewed: "visualizou",
    uploaded: "enviou",
    edited: "editou",
    deleted: "excluiu",
    downloaded: "baixou",
  };

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Visão geral do acervo documental.</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 [&>*]:min-w-0">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="min-w-0 truncate text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`h-4 w-4 shrink-0 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground sm:text-3xl">{isLoading ? "—" : c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {prazoResumo.map((item) => (
          <button
            key={item.filtro}
            type="button"
            onClick={() => abrirPrazosComFiltro(item.filtro)}
            className={`rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${item.className}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{item.icon} {item.label}</span>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 text-3xl font-bold text-foreground">{isLoading ? "—" : item.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">Clique para abrir Prazos filtrados</div>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Agenda de Prazos</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Filtre rapidamente os prazos por situação e advogado.</p>
            </div>
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTROS_PRAZO.map((filtro) => (
                <button
                  key={filtro.value}
                  type="button"
                  onClick={() => setFiltroPrazo(filtro.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${filtroPrazo === filtro.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {filtro.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Advogado:</span>
              <select
                value={filtroAdvogado}
                onChange={(event) => setFiltroAdvogado(event.target.value)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Todos">Todos</option>
                {ADVOGADOS_FILTRO.map((advogado) => <option key={advogado} value={advogado}>{advogado}</option>)}
              </select>
            </label>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {prazosFiltrados.length} {prazosFiltrados.length === 1 ? "prazo encontrado" : "prazos encontrados"}
            </div>
            {filtroPrazo === "vencidos" && prazosFiltrados.length > 0 && (
              <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> Atenção</Badge>
            )}
          </div>

          {prazosFiltrados.length > 0 ? (
            <div className="space-y-2">
              {prazosFiltrados.slice(0, 10).map((p) => {
                const dias = diasRestantes(p.data_limite);
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.advogado ?? "Sem advogado"}{p.numero_processo ? ` • ${p.numero_processo}` : ""}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`text-xs font-medium ${dias < 0 ? "text-red-500" : dias === 0 ? "text-red-500" : dias <= 3 ? "text-orange-500" : "text-muted-foreground"}`}>
                        {dias < 0 ? `Vencido há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}` : dias === 0 ? "Vence hoje" : `Faltam ${dias} ${dias === 1 ? "dia" : "dias"}`}
                      </span>
                      <span className="text-xs text-muted-foreground">{format(new Date(`${p.data_limite}T00:00:00`), "dd/MM/yyyy")}</span>
                    </div>
                  </div>
                );
              })}
              {prazosFiltrados.length > 10 && <p className="pt-2 text-center text-xs text-muted-foreground">Mostrando os 10 primeiros resultados.</p>}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum prazo corresponde aos filtros selecionados.</p>
          )}
        </CardContent>
      </Card>

      <WeeklyAgenda />

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>Documentos por Mês</CardTitle></CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="mes" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2"><CardTitle className="min-w-0 truncate">Entrada de Caixa Mensal</CardTitle><TrendingUp className="h-4 w-4 shrink-0 text-[oklch(0.68_0.16_275)]" /></CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyCash}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="mes" /><YAxis tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`} /><Tooltip formatter={(v: number) => formatBRL(v)} /><Line type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle>Atividade Recente</CardTitle></CardHeader>
          <CardContent>
            {recent && recent.length > 0 ? (
              <ul className="space-y-3">
                {recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-none last:pb-0">
                    <div className="min-w-0"><Badge variant="outline" className="mr-2 capitalize">{actionLabel[r.action] ?? r.action}</Badge><span className="text-muted-foreground">{r.document_id ? `Documento ${r.document_id.slice(0, 8)}` : "Sistema"}</span></div>
                    <span className="text-xs text-muted-foreground">{format(new Date(r.timestamp), "dd/MM HH:mm", { locale: ptBR })}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Sem atividade registrada.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
