import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DocumentDetailSheet } from "@/components/document-detail-sheet";
import { type Documento, badgeVariantForStatus, processoLabel } from "@/lib/documents";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, Pencil, Trash2, UploadCloud, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { printReport } from "@/lib/print-report";
import { ProcessFinancialSummary } from "@/components/process-financial-summary";
import { DocumentEditDialog, DocumentDeleteDialog, DocumentUploadDialog, useDocumentRowActions } from "@/components/document-row-actions";

export const Route = createFileRoute("/_authenticated/my-documents")({
  head: () => ({ meta: [{ title: "Meus Documentos - Gestão Judicial" }] }),
  component: MyDocs,
});

const PAGE_SIZE = 8;
type Payment = { id: string; valor: number | null; document_id: string | null };
type Grupo = { key: string; numero_processo: string; cliente: string; docs: Documento[]; principal: Documento; pagamentos: Payment[]; valorTotalProcesso: number | null };

function MyDocs() {
  const [selected, setSelected] = useState<Documento | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const actions = useDocumentRowActions([["my-docs"], ["docs"], ["dashboard-docs"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-docs"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];
      const { data, error } = await supabase.from("documents").select("*").eq("created_by", userData.user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Documento[];
    },
  });

  const documentIds = useMemo(() => (data ?? []).map((d) => d.id).filter(Boolean), [data]);
  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["my-docs-payments", documentIds],
    enabled: documentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("id, valor, document_id").in("document_id", documentIds);
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  const pagamentosByDocument = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const p of payments) {
      if (!p.document_id) continue;
      const list = map.get(p.document_id) ?? [];
      list.push(p);
      map.set(p.document_id, list);
    }
    return map;
  }, [payments]);

  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>();
    for (const d of data ?? []) {
      const processo = (d.numero_processo ?? "").trim();
      const key = processo ? `proc:${processo}__${d.cliente}` : `sem-proc__${d.cliente}`;
      const g = map.get(key);
      if (g) {
        g.docs.push(d);
      } else {
        const valorTotalProcesso = d.valor_total_processo ?? null;
        map.set(key, { key, numero_processo: processoLabel(processo), cliente: d.cliente, docs: [d], principal: d, pagamentos: [], valorTotalProcesso });
      }
    }
    for (const g of map.values()) {
      if (g.valorTotalProcesso == null) {
        const docWithValue = g.docs.find((d) => d.valor_total_processo != null);
        g.valorTotalProcesso = docWithValue?.valor_total_processo ?? null;
      }
      g.pagamentos = g.docs.flatMap((d) => pagamentosByDocument.get(d.id) ?? []);
    }
    return [...map.values()];
  }, [data, pagamentosByDocument]);

  const totalPages = Math.ceil(grupos.length / PAGE_SIZE);
  const paginatedGroups = useMemo(() => grupos.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [grupos, currentPage]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function toggle(key: string) { setExpanded((e) => ({ ...e, [key]: !e[key] })); }

  function printList() {
    const rows = data ?? [];
    if (!rows.length) return toast.error("Nenhum documento para imprimir");
    const ok = printReport({ title: "Meus Documentos", subtitle: `${grupos.length} processo(s) · ${rows.length} documento(s)`, sections: [{ columns: ["ID", "Processo", "Cliente", "Tipo", "Data", "Estado", "Enviado em"], rows: rows.map((d) => [d.internal_id, processoLabel(d.numero_processo), d.cliente, d.tipo_documento, format(new Date(d.data_documento), "dd/MM/yyyy"), d.estado_processual, format(new Date(d.created_at), "dd/MM/yyyy HH:mm")]) }] });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  function printGroup(g: Grupo) {
    const ok = printReport({ title: `Processo ${g.numero_processo}`, subtitle: `${g.cliente} · ${g.docs.length} documento(s)`, sections: [
      { columns: ["ID", "Tipo", "Data", "Estado", "Arquivo", "Enviado em"], rows: g.docs.map((d) => [d.internal_id, d.tipo_documento, format(new Date(d.data_documento), "dd/MM/yyyy"), d.estado_processual, d.file_name, format(new Date(d.created_at), "dd/MM/yyyy HH:mm")]) },
      { columns: ["Financeiro", "Valor"], rows: [["Valor contratado", String(g.valorTotalProcesso ?? 0)], ["Recebido", String(g.pagamentos.reduce((s, p) => s + Number(p.valor ?? 0), 0))]] },
    ] });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  function printOne(d: Documento) {
    const ok = printReport({ title: `Documento ${d.internal_id}`, subtitle: processoLabel(d.numero_processo), sections: [{ columns: ["Campo", "Valor"], rows: [["ID interno", d.internal_id], ["Processo", processoLabel(d.numero_processo)], ["Cliente", d.cliente], ["Tipo", d.tipo_documento], ["Data do documento", format(new Date(d.data_documento), "dd/MM/yyyy")], ["Estado processual", d.estado_processual], ["Enviado em", format(new Date(d.created_at), "dd/MM/yyyy HH:mm")]] }] });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  const groupContent = (g: Grupo) => (
    <>
      <ProcessFinancialSummary valorTotalProcesso={g.valorTotalProcesso} pagamentos={g.pagamentos} />
      {paymentsLoading && <p className="text-xs text-muted-foreground">Carregando pagamentos...</p>}
      <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
        {g.docs.map((d) => (
          <div key={d.id} className="space-y-1">
            <button onClick={() => setSelected(d)} className="block w-full text-left">
              <p className="break-words text-sm font-medium text-foreground">{d.tipo_documento}</p>
              <p className="break-words text-xs text-muted-foreground">{format(new Date(d.data_documento), "dd/MM/yyyy")} · Enviado: {format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}</p>
              <p className="font-mono text-xs text-muted-foreground">{d.internal_id}</p>
            </button>
            <div className="flex flex-wrap gap-1">
              <Button size="icon" variant="ghost" title="Editar documento" onClick={() => actions.setEditing(d)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Excluir documento" onClick={() => actions.setDeleting(d)}><Trash2 className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Anexar arquivo" onClick={() => actions.setUploading(d)}><UploadCloud className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Imprimir este documento" onClick={() => printOne(d)}><Printer className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0"><h2 className="text-2xl font-bold tracking-tight text-foreground">Meus Documentos</h2><p className="text-sm text-muted-foreground">Documentos enviados por você, agrupados por número do processo.</p></div>
      <Card><CardContent className="p-0">
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-medium text-foreground">Processos</span><Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={printList}><Printer className="mr-2 h-4 w-4" />Imprimir lista</Button></div>
        <div className="divide-y md:hidden">
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p> : paginatedGroups.length > 0 ? paginatedGroups.map((g) => (
            <div key={g.key} className="p-4">
              <button onClick={() => toggle(g.key)} className="block w-full space-y-1 text-left"><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-semibold text-foreground">{g.numero_processo}</span><Badge variant={badgeVariantForStatus(g.principal.estado_processual)} className="shrink-0">{g.principal.estado_processual}</Badge></div><p className="break-words text-sm text-muted-foreground">{g.cliente}</p><p className="text-xs text-muted-foreground">{g.docs.length} documento(s) · {expanded[g.key] ? "ocultar" : "ver documentos"}</p></button>
              <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => actions.setEditing(g.principal)}><Pencil className="mr-1 h-4 w-4" />Editar</Button><Button size="sm" variant="outline" onClick={() => actions.setDeleting(g.principal)}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button><Button size="sm" variant="outline" onClick={() => actions.setUploading(g.principal)}><UploadCloud className="mr-1 h-4 w-4" />Enviar</Button><Button size="sm" variant="outline" onClick={() => printGroup(g)}><Printer className="mr-1 h-4 w-4" />Imprimir</Button></div>
              {expanded[g.key] && <div className="mt-3">{groupContent(g)}</div>}
            </div>
          )) : <p className="py-8 text-center text-sm text-muted-foreground">Você ainda não enviou documentos.</p>}
        </div>
        <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead className="w-10" /><TableHead>Processo</TableHead><TableHead>Cliente</TableHead><TableHead>Documentos</TableHead><TableHead>Estado</TableHead><TableHead>Último envio</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
          {isLoading ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow> : paginatedGroups.length > 0 ? paginatedGroups.map((g) => <Fragment key={g.key}>
            <TableRow className="cursor-pointer" onClick={() => toggle(g.key)}><TableCell>{expanded[g.key] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell><TableCell className="font-medium">{g.numero_processo}</TableCell><TableCell>{g.cliente}</TableCell><TableCell><span className="text-xs text-muted-foreground">{g.docs.map((d) => d.tipo_documento).join(", ")}</span></TableCell><TableCell><Badge variant={badgeVariantForStatus(g.principal.estado_processual)}>{g.principal.estado_processual}</Badge></TableCell><TableCell>{format(new Date(g.principal.created_at), "dd/MM/yyyy HH:mm")}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button size="icon" variant="ghost" title="Editar documento" onClick={(e) => { e.stopPropagation(); actions.setEditing(g.principal); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Excluir documento" onClick={(e) => { e.stopPropagation(); actions.setDeleting(g.principal); }}><Trash2 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Anexar arquivo a este processo" onClick={(e) => { e.stopPropagation(); actions.setUploading(g.principal); }}><UploadCloud className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Imprimir processo" onClick={(e) => { e.stopPropagation(); printGroup(g); }}><Printer className="h-4 w-4" /></Button></div></TableCell></TableRow>
            {expanded[g.key] && <TableRow><TableCell colSpan={7} className="bg-muted/20 p-4"><div className="space-y-4"><ProcessFinancialSummary valorTotalProcesso={g.valorTotalProcesso} pagamentos={g.pagamentos} />{paymentsLoading && <p className="text-xs text-muted-foreground">Carregando pagamentos...</p>}<div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Tipo</TableHead><TableHead>Arquivo</TableHead><TableHead>Data</TableHead><TableHead>Enviado em</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{g.docs.map((d) => <TableRow key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}><TableCell className="font-mono text-xs">{d.internal_id}</TableCell><TableCell>{d.tipo_documento}</TableCell><TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground">{d.file_name}</TableCell><TableCell>{format(new Date(d.data_documento), "dd/MM/yyyy")}</TableCell><TableCell>{format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button size="icon" variant="ghost" title="Editar documento" onClick={(e) => { e.stopPropagation(); actions.setEditing(d); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Excluir documento" onClick={(e) => { e.stopPropagation(); actions.setDeleting(d); }}><Trash2 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Anexar arquivo" onClick={(e) => { e.stopPropagation(); actions.setUploading(d); }}><UploadCloud className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Imprimir este documento" onClick={(e) => { e.stopPropagation(); printOne(d); }}><Printer className="h-4 w-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div></div></TableCell></TableRow>}
          </Fragment>) : <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Você ainda não enviou documentos.</TableCell></TableRow>}
        </TableBody></Table></div>
        {totalPages > 1 && <div className="flex items-center justify-center gap-3 border-t p-4"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Anterior</Button><span className="text-sm font-medium text-muted-foreground">{currentPage} / {totalPages}</span><Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Próxima</Button></div>}
      </CardContent></Card>
      <DocumentDetailSheet doc={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
      <DocumentEditDialog doc={actions.editing} open={!!actions.editing} onOpenChange={(o) => !o && actions.setEditing(null)} onSaved={actions.refresh} />
      <DocumentDeleteDialog doc={actions.deleting} open={!!actions.deleting} onOpenChange={(o) => !o && actions.setDeleting(null)} onDeleted={actions.refresh} />
      <DocumentUploadDialog doc={actions.uploading} open={!!actions.uploading} onOpenChange={(o) => !o && actions.setUploading(null)} onUploaded={actions.refresh} />
    </div>
  );
}
