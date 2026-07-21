import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, FolderOpen, Archive, CheckCircle2, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
        .select("id, internal_id, advogado, cliente, tipo_documento, estado_processual, created_at, data_documento");
      if (error) throw error;
      return docs ?? [];
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

  // Monthly influx (last 6 months)
  const monthly: { mes: string; total: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = format(d, "yyyy-MM");
    const label = format(d, "MMM", { locale: ptBR });
    monthly.push({
      mes: label,
      total: data?.filter((doc) => doc.created_at.startsWith(key)).length ?? 0,
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Visão geral do acervo documental.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{isLoading ? "—" : c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Documentos por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            {recent && recent.length > 0 ? (
              <ul className="space-y-3">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-none last:pb-0">
                    <div>
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