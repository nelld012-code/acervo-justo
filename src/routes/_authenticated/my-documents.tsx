import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DocumentDetailSheet } from "@/components/document-detail-sheet";
import { type Documento, badgeVariantForStatus } from "@/lib/documents";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/my-documents")({
  head: () => ({ meta: [{ title: "Meus Documentos - Gestão Judicial" }] }),
  component: MyDocs,
});

function MyDocs() {
  const [selected, setSelected] = useState<Documento | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["my-docs"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("created_by", userData.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Documento[];
    },
  });

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Meus Documentos</h2>
        <p className="text-sm text-muted-foreground">Documentos enviados por você.</p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Enviado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : data && data.length > 0 ? (
                data.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}>
                    <TableCell className="font-mono text-xs">{d.internal_id}</TableCell>
                    <TableCell>{d.numero_processo}</TableCell>
                    <TableCell>{d.cliente}</TableCell>
                    <TableCell>{d.tipo_documento}</TableCell>
                    <TableCell>{format(new Date(d.data_documento), "dd/MM/yyyy")}</TableCell>
                    <TableCell><Badge variant={badgeVariantForStatus(d.estado_processual)}>{d.estado_processual}</Badge></TableCell>
                    <TableCell>{format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Você ainda não enviou documentos.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DocumentDetailSheet doc={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}