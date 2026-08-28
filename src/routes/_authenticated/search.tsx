import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentDetailSheet } from "@/components/document-detail-sheet";
import { TIPOS_DOCUMENTO, ESTADOS, type Documento, badgeVariantForStatus, processoLabel } from "@/lib/documents";
import { format } from "date-fns";
import { Search as SearchIcon, X, Pencil, Trash2, UploadCloud, Printer } from "lucide-react";
import { StandardPagination } from "@/components/standard-pagination";
import { toast } from "sonner";
import { printReport } from "@/lib/print-report";
import {
  DocumentEditDialog,
  DocumentDeleteDialog,
  DocumentUploadDialog,
  useDocumentRowActions,
} from "@/components/document-row-actions";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Buscar Documentos - Gestão Judicial" }] }),
  component: SearchPage,
});

const PAGE_SIZE = 8;

function SearchPage() {
  const [q, setQ] = useState("");
  const [advogado, setAdvogado] = useState("");
  const [numero, setNumero] = useState("");
  const [tipo, setTipo] = useState<string>("all");
  const [estado, setEstado] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exact, setExact] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Documento | null>(null);
  const actions = useDocumentRowActions([["docs"], ["my-docs"], ["dashboard-docs"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["docs", { q, advogado, numero, tipo, estado, dateFrom, dateTo, exact, page }],
    queryFn: async () => {
      let query = supabase.from("documents").select("*", { count: "exact" });
      if (q) {
        if (exact) query = query.or(`internal_id.eq.${q},numero_processo.eq.${q},cliente.eq.${q}`);
        else query = query.or(
          `internal_id.ilike.%${q}%,numero_processo.ilike.%${q}%,cliente.ilike.%${q}%,advogado.ilike.%${q}%,parte_autora.ilike.%${q}%,parte_re.ilike.%${q}%,file_name.ilike.%${q}%,palavras_chave.cs.{${q}}`,
        );
      }
      if (advogado) query = exact ? query.eq("advogado", advogado) : query.ilike("advogado", `%${advogado}%`);
      if (numero) query = exact ? query.eq("numero_processo", numero) : query.ilike("numero_processo", `%${numero}%`);
      if (tipo !== "all") query = query.eq("tipo_documento", tipo);
      if (estado !== "all") query = query.eq("estado_processual", estado);
      if (dateFrom) query = query.gte("data_documento", dateFrom);
      if (dateTo) query = query.lte("data_documento", dateTo);
      query = query.order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as Documento[], count: count ?? 0 };
    },
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE)), [data]);

  function clearFilters() {
    setQ(""); setAdvogado(""); setNumero(""); setTipo("all"); setEstado("all"); setDateFrom(""); setDateTo(""); setExact(false); setPage(0);
  }

  function printList() {
    const rows = data?.rows ?? [];
    if (!rows.length) return toast.error("Nenhum resultado para imprimir");
    const ok = printReport({
      title: "Resultados da Busca de Documentos",
      subtitle: `Página ${page + 1} · ${rows.length} de ${data?.count ?? 0} resultado(s)`,
      sections: [{
        columns: ["ID", "Processo", "Cliente", "Tipo", "Advogado", "Data", "Estado", "Versão"],
        rows: rows.map((d) => [
          d.internal_id, processoLabel(d.numero_processo), d.cliente, d.tipo_documento, d.advogado,
          format(new Date(d.data_documento), "dd/MM/yyyy"), d.estado_processual, `v${d.current_version}`,
        ]),
      }],
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  function printOne(d: Documento) {
    const ok = printReport({
      title: `Documento ${d.internal_id}`,
      subtitle: processoLabel(d.numero_processo),
      sections: [{
        columns: ["Campo", "Valor"],
        rows: [
          ["ID interno", d.internal_id],
          ["Processo", processoLabel(d.numero_processo)],
          ["Cliente", d.cliente],
          ["Tipo", d.tipo_documento],
          ["Advogado", d.advogado],
          ["Data do documento", format(new Date(d.data_documento), "dd/MM/yyyy")],
          ["Estado processual", d.estado_processual],
          ["Versão", `v${d.current_version}`],
        ],
      }],
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Buscar Documentos</h2>
        <p className="text-sm text-muted-foreground">Combine filtros para localizar rapidamente qualquer processo.</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Busca global (ID, número do processo, cliente, advogado...)" className="pl-9" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Advogado</Label>
              <Input value={advogado} onChange={(e) => { setAdvogado(e.target.value); setPage(0); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Número do Processo</Label>
              <Input value={numero} onChange={(e) => { setNumero(e.target.value); setPage(0); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => { setTipo(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {TIPOS_DOCUMENTO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v) => { setEstado(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {ESTADOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data (de)</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Data (até)</Label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={exact} onChange={(e) => { setExact(e.target.checked); setPage(0); }} />
                Busca exata
              </label>
            </div>
            <div className="flex items-end sm:justify-end">
              <Button variant="outline" className="w-full sm:w-auto" onClick={clearFilters}><X className="mr-2 h-4 w-4" />Limpar filtros</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">Resultados</span>
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={printList}>
              <Printer className="mr-2 h-4 w-4" />Imprimir lista
            </Button>
          </div>
          <div className="divide-y md:hidden">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : data && data.rows.length > 0 ? (
              data.rows.map((d) => (
                <div key={d.id} className="p-4">
                  <button onClick={() => setSelected(d)} className="block w-full space-y-1 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-semibold text-foreground">{processoLabel(d.numero_processo)}</span>
                    <Badge variant={badgeVariantForStatus(d.estado_processual)} className="shrink-0">{d.estado_processual}</Badge>
                  </div>
                  <p className="break-words text-sm text-muted-foreground">{d.cliente} · {d.tipo_documento}</p>
                  <p className="break-words text-xs text-muted-foreground">{d.advogado} · {format(new Date(d.data_documento), "dd/MM/yyyy")} · v{d.current_version}</p>
                  <p className="font-mono text-xs text-muted-foreground">{d.internal_id}</p>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" title="Editar documento" onClick={() => actions.setEditing(d)}>
                      <Pencil className="mr-1 h-4 w-4" />Editar
                    </Button>
                    <Button size="sm" variant="outline" title="Excluir documento" onClick={() => actions.setDeleting(d)}>
                      <Trash2 className="mr-1 h-4 w-4" />Excluir
                    </Button>
                    <Button size="sm" variant="outline" title="Anexar arquivo" onClick={() => actions.setUploading(d)}>
                      <UploadCloud className="mr-1 h-4 w-4" />Enviar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => printOne(d)}>
                      <Printer className="mr-1 h-4 w-4" />Imprimir
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum documento encontrado.</p>
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
                <TableHead>Advogado</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : data && data.rows.length > 0 ? (
                data.rows.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}>
                    <TableCell className="font-mono text-xs">{d.internal_id}</TableCell>
                    <TableCell>{processoLabel(d.numero_processo)}</TableCell>
                    <TableCell>{d.cliente}</TableCell>
                    <TableCell>{d.tipo_documento}</TableCell>
                    <TableCell>{d.advogado}</TableCell>
                    <TableCell>{format(new Date(d.data_documento), "dd/MM/yyyy")}</TableCell>
                    <TableCell><Badge variant={badgeVariantForStatus(d.estado_processual)}>{d.estado_processual}</Badge></TableCell>
                    <TableCell>v{d.current_version}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Editar documento" onClick={(e) => { e.stopPropagation(); actions.setEditing(d); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Excluir documento" onClick={(e) => { e.stopPropagation(); actions.setDeleting(d); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Anexar arquivo" onClick={(e) => { e.stopPropagation(); actions.setUploading(d); }}>
                          <UploadCloud className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Imprimir este resultado" onClick={(e) => { e.stopPropagation(); printOne(d); }}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum documento encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <StandardPagination current={page + 1} total={totalPages} totalItems={data?.count ?? 0} pageSize={PAGE_SIZE} onChange={(p) => setPage(p - 1)} label="registros" />

      <DocumentDetailSheet doc={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />

      <DocumentEditDialog
        doc={actions.editing}
        open={!!actions.editing}
        onOpenChange={(o) => !o && actions.setEditing(null)}
        onSaved={actions.refresh}
      />
      <DocumentDeleteDialog
        doc={actions.deleting}
        open={!!actions.deleting}
        onOpenChange={(o) => !o && actions.setDeleting(null)}
        onDeleted={actions.refresh}
      />
      <DocumentUploadDialog
        doc={actions.uploading}
        open={!!actions.uploading}
        onOpenChange={(o) => !o && actions.setUploading(null)}
        onUploaded={actions.refresh}
      />
    </div>
  );
}