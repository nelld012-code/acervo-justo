import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

function Dashboard() {
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

  const total = data?.length ?? 0;
  const counts = {
    Aberto: data?.filter((d) => d.estado_processual === "Aberto").length ?? 0,
    "Em revisão": data?.filter((d) => d.estado_processual === "Em revisão").length ?? 0,
    Arquivado: data?.filter((d) => d.estado_processual === "Arquivado").length ?? 0,
    Encerrado: data?.filter((d) => d.estado_processual === "Encerrado").length ?? 0,
  };

  // Monthly influx (last 6 months)
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Agenda de Prazos</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Situação dos prazos em andamento — {format(now, "dd/MM/yyyy")}</p>
            </div>
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-red-500"><AlertTriangle className="h-4 w-4" /> Vencidos</div>
              <div className="mt-1 text-2xl font-bold">{prazosVencidos.length}</div>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <div className="text-sm font-medium text-red-500">Vencem hoje</div>
              <div className="mt-1 text-2xl font-bold">{prazosHoje.length}</div>
            </div>
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
              <div className="text-sm font-medium text-orange-500">Próximos 3 dias</div>
              <div className="mt-1 text-2xl font-bold">{prazos3Dias.length}</div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="text-sm font-medium text-amber-500">4–7 dias</div>
              <div className="mt-1 text-2xl font-bold">{prazos7Dias.length}</div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="text-sm font-medium text-emerald-600">Em andamento</div>
              <div className="mt-1 text-2xl font-bold">{prazosAndamento.length}</div>
            </div>
          </div>

          {prazosVencidos.length > 0 && (
            <div className="mt-5 rounded-lg border border-red-500/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-red-500">Prazos vencidos que exigem atenção</h3>
                <Badge variant="destructive">{prazosVencidos.length}</Badge>
              </div>
              <div className="space-y-2">
                {prazosVencidos.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.advogado ?? "Sem advogado"}{p.numero_processo ? ` • ${p.numero_processo}` : ""}</div>
                    </div>
                    <span className="text-xs font-medium text-red-500">{format(new Date(`${p.data_limite}T00:00:00`), "dd/MM/yyyy")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <WeeklyAgenda />

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Documentos por Mês</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="min-w-0 truncate">Entrada de Caixa Mensal</CardTitle>
            <TrendingUp className="h-4 w-4 shrink-0 text-[oklch(0.68_0.16_275)]" />
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyCash}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Line type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            {recent && recent.length > 0 ? (
              <ul className="space-y-3">
                {recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-none last:pb-0">
                    <div className="min-w-0">
                      <Badge variant="outline" className="mr-2 capitalize">{actionLabel[r.action] ?? r.action}</Badge>
                      <span className="text-muted-foreground">
                        {r.document_id ? `Documento ${r.document_id.slice(0, 8)}` : "Sistema"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.timestamp), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sem atividade registrada.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
