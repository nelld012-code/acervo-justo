import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, FolderOpen, Archive, CheckCircle2, Clock, Wallet, TrendingUp } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/documents";

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

  const total = data?.length ?? 0;
  const counts = {
    Aberto: data?.filter((d) => d.estado_processual === "Aberto").length ?? 0,
    "Em revisão": data?.filter((d) => d.estado_processual === "Em revisão").length ?? 0,
    Arquivado: data?.filter((d) => d.estado_processual === "Arquivado").length ?? 0,
    Encerrado: data?.filter((d) => d.estado_processual === "Encerrado").length ?? 0,
  };

  const totalReceber = (data ?? []).reduce((acc, d) => {
    const tot = Number(d.valor_total_processo ?? 0);
    const rec = Number(d.valor_recebido_total ?? 0);
    return acc + Math.max(0, tot - rec);
  }, 0);

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

      <Card className="bg-gradient-to-r from-primary to-[oklch(0.53_0.22_260)] text-primary-foreground border-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium opacity-90">Total a Receber</CardTitle>
          <Wallet className="h-5 w-5 opacity-90" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold sm:text-4xl">{isLoading ? "—" : formatBRL(totalReceber)}</div>
          <p className="mt-1 text-xs opacity-80">Saldo devedor consolidado em todos os processos</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 [&>*]:min-w-0">
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