import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Auditoria - Gestão Judicial" }] }),
  component: AuditPage,
});

const LABEL: Record<string, string> = {
  viewed: "Visualização",
  uploaded: "Envio",
  edited: "Edição",
  deleted: "Exclusão",
  downloaded: "Download",
};

function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, timestamp, document_id, user_id, details")
        .order("timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Registro de Auditoria</h2>
        <p className="text-sm text-muted-foreground">Últimas 200 ações no sistema.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y md:hidden">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : data && data.length > 0 ? (
              data.map((r) => (
                <div key={r.id} className="space-y-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{format(new Date(r.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</span>
                    <Badge variant="outline" className="shrink-0">{LABEL[r.action] ?? r.action}</Badge>
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">Doc: {r.document_id?.slice(0, 8) ?? "—"} · Usuário: {r.user_id?.slice(0, 8) ?? "—"}</p>
                  {r.details ? <p className="break-all text-xs text-muted-foreground">{JSON.stringify(r.details)}</p> : null}
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem registros.</p>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : data && data.length > 0 ? (
                data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(r.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</TableCell>
                    <TableCell><Badge variant="outline">{LABEL[r.action] ?? r.action}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.document_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.user_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.details ? JSON.stringify(r.details) : "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sem registros.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}