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
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { printReport } from "@/lib/print-report";

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

  function printList() {
    const rows = data ?? [];
    if (!rows.length) return toast.error("Nenhum documento para imprimir");
    const ok = printReport({
      title: "Meus Documentos",
      subtitle: `${rows.length} documento(s)`,
      sections: [{
        columns: ["ID", "Processo", "Cliente", "Tipo", "Data", "Estado", "Enviado em"],
        rows: rows.map((d) => [
          d.internal_id, d.numero_processo, d.cliente, d.tipo_documento,
          format(new Date(d.data_documento), "dd/MM/yyyy"),
          d.estado_processual,
          format(new Date(d.created_at), "dd/MM/yyyy HH:mm"),
        ]),
      }],
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  function printOne(d: Documento) {
    const ok = printReport({
      title: `Documento ${d.internal_id}`,
      subtitle: d.numero_processo,
      sections: [{
        columns: ["Campo", "Valor"],
        rows: [
          ["ID interno", d.internal_id],
          ["Processo", d.numero_processo],
          ["Cliente", d.cliente],
          ["Tipo", d.tipo_documento],
          ["Data do documento", format(new Date(d.data_documento), "dd/MM/yyyy")],
          ["Estado processual", d.estado_processual],
          ["Enviado em", format(new Date(d.created_at), "dd/MM/yyyy HH:mm")],
        ],
      }],
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Meus Documentos</h2>
        <p className="text-sm text-muted-foreground">Documentos enviados por você.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">Documentos</span>
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={printList}>
              <Printer className="mr-2 h-4 w-4" />Imprimir lista
            </Button>
          </div>
          <div className="divide-y md:hidden">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : data && data.length > 0 ? (
              data.map((d) => (
                <div key={d.id} className="p-4">
                  <button onClick={() => setSelected(d)} className="block w-full space-y-1 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-semibold text-foreground">{d.numero_processo}</span>
                    <Badge variant={badgeVariantForStatus(d.estado_processual)} className="shrink-0">{d.estado_processual}</Badge>
                  </div>
                  <p className="break-words text-sm text-muted-foreground">{d.cliente} · {d.tipo_documento}</p>
                  <p className="break-words text-xs text-muted-foreground">Doc: {format(new Date(d.data_documento), "dd/MM/yyyy")} · Enviado: {format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}</p>
                  <p className="font-mono text-xs text-muted-foreground">{d.internal_id}</p>
                  </button>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => printOne(d)}>
                    <Printer className="mr-1 h-4 w-4" />Imprimir
                  </Button>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Você ainda não enviou documentos.</p>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
                <TableHead className="text-right">Imprimir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
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
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" title="Imprimir este documento" onClick={(e) => { e.stopPropagation(); printOne(d); }}>
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Você ainda não enviou documentos.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <DocumentDetailSheet doc={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}