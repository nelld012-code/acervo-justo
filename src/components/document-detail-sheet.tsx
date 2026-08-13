import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, ExternalLink, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { type Documento, badgeVariantForStatus, formatFileSize, getSignedUrl, logAudit, METODOS_PAGAMENTO, formatBRL, processoLabel } from "@/lib/documents";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { buildDossierPdf } from "@/lib/document-dossier";
import { printReport } from "@/lib/print-report";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

type Version = {
  id: string;
  version_number: number;
  file_url: string;
  uploaded_at: string;
  change_notes: string | null;
};

type AuditEntry = {
  id: string;
  action: string;
  timestamp: string;
  user_id: string | null;
};

type Payment = {
  id: string;
  valor: number;
  data_pagamento: string;
  responsavel_recebimento: string;
  metodo_pagamento: string;
  descricao: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  viewed: "Visualização",
  uploaded: "Envio",
  edited: "Edição",
  deleted: "Exclusão",
  downloaded: "Download",
};

export function DocumentDetailSheet({ doc, open, onOpenChange }: { doc: Documento | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [recebido, setRecebido] = useState<number>(0);
  const [payForm, setPayForm] = useState({ valor: "", data_pagamento: new Date().toISOString().slice(0, 10), responsavel_recebimento: "", metodo_pagamento: "PIX", descricao: "" });
  const [saving, setSaving] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!doc || !open) return;
    logAudit(doc.id, "viewed");
    (async () => {
      const [{ data: v }, { data: a }, { data: p }, { data: docRow }] = await Promise.all([
        supabase.from("document_versions").select("id, version_number, file_url, uploaded_at, change_notes").eq("document_id", doc.id).order("version_number", { ascending: false }),
        supabase.from("audit_logs").select("id, action, timestamp, user_id").eq("document_id", doc.id).order("timestamp", { ascending: false }).limit(50),
        supabase.from("payments").select("id, valor, data_pagamento, responsavel_recebimento, metodo_pagamento, descricao").eq("document_id", doc.id).order("data_pagamento", { ascending: false }),
        supabase.from("documents").select("valor_recebido_total").eq("id", doc.id).maybeSingle(),
      ]);
      setVersions(v ?? []);
      setAudits(a ?? []);
      setPayments((p ?? []) as Payment[]);
      setRecebido(Number(docRow?.valor_recebido_total ?? 0));
    })();
  }, [doc, open]);

  async function reloadFinance() {
    if (!doc) return;
    const [{ data: p }, { data: docRow }] = await Promise.all([
      supabase.from("payments").select("id, valor, data_pagamento, responsavel_recebimento, metodo_pagamento, descricao").eq("document_id", doc.id).order("data_pagamento", { ascending: false }),
      supabase.from("documents").select("valor_recebido_total").eq("id", doc.id).maybeSingle(),
    ]);
    setPayments((p ?? []) as Payment[]);
    setRecebido(Number(docRow?.valor_recebido_total ?? 0));
  }

  async function handleAddPayment() {
    if (!doc) return;
    const valor = Number(payForm.valor);
    if (!valor || valor <= 0) return toast.error("Informe um valor válido");
    if (!payForm.responsavel_recebimento.trim()) return toast.error("Informe o responsável pelo recebimento");
    const total = Number(doc.valor_total_processo ?? 0);
    if (total > 0 && recebido + valor > total) {
      return toast.error("Valor excede o saldo devedor", { description: `Saldo restante: ${formatBRL(total - recebido)}` });
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("payments").insert({
        document_id: doc.id,
        valor,
        data_pagamento: payForm.data_pagamento,
        responsavel_recebimento: payForm.responsavel_recebimento.trim(),
        metodo_pagamento: payForm.metodo_pagamento,
        descricao: payForm.descricao.trim() || null,
        created_by: userData.user?.id,
      });
      if (error) throw error;
      toast.success("Pagamento registrado");
      setPayForm({ valor: "", data_pagamento: new Date().toISOString().slice(0, 10), responsavel_recebimento: "", metodo_pagamento: "PIX", descricao: "" });
      setPayDialogOpen(false);
      await reloadFinance();
    } catch (e) {
      toast.error("Falha ao registrar pagamento", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePayment(id: string) {
    if (!confirm("Excluir este pagamento?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir", { description: error.message });
    toast.success("Pagamento removido");
    await reloadFinance();
  }

  async function handleUpdatePayment() {
    if (!editPayment) return;
    const valor = Number(editPayment.valor);
    if (!valor || valor <= 0) return toast.error("Informe um valor válido");
    if (!editPayment.responsavel_recebimento.trim()) return toast.error("Informe o responsável pelo recebimento");
    setSaving(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          valor,
          data_pagamento: editPayment.data_pagamento,
          responsavel_recebimento: editPayment.responsavel_recebimento.trim(),
          metodo_pagamento: editPayment.metodo_pagamento,
          descricao: editPayment.descricao?.trim() || null,
        })
        .eq("id", editPayment.id);
      if (error) throw error;
      toast.success("Pagamento atualizado");
      setEditPayment(null);
      await reloadFinance();
    } catch (e) {
      toast.error("Falha ao atualizar pagamento", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadDossier() {
    if (!doc) return;
    setDownloading(true);
    try {
      const blob = await buildDossierPdf(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.internal_id}-dossie.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await logAudit(doc.id, "downloaded", { file_name: `${doc.internal_id}-dossie.pdf` });
      toast.success("PDF gerado com todos os documentos do processo");
    } catch (e) {
      toast.error("Falha ao gerar o PDF", { description: e instanceof Error ? e.message : "" });
    } finally {
      setDownloading(false);
    }
  }

  function handlePrintDetails() {
    if (!doc) return;
    printReport({
      title: `Documento ${doc.internal_id}`,
      subtitle: `Processo ${processoLabel(doc.numero_processo)} — ${doc.tipo_documento}`,
      sections: [
        {
          heading: "Detalhes do documento",
          columns: ["Campo", "Informação"],
          rows: [
            ["Número do Documento", doc.internal_id],
            ["Número do Processo", processoLabel(doc.numero_processo)],
            ["Tipo de Documento", doc.tipo_documento],
            ["Estado Processual", doc.estado_processual],
            ["Matéria", doc.materia],
            ["Confidencialidade", doc.confidencialidade],
            ["Advogado", doc.advogado],
            ["Cliente", doc.cliente],
            ["Parte Autora", doc.parte_autora ?? "—"],
            ["Parte Ré", doc.parte_re ?? "—"],
            ["Órgão Judicial", doc.orgao_judicial ?? "—"],
            ["Data do Documento", format(new Date(doc.data_documento), "dd/MM/yyyy")],
            ["Data de Ingresso", format(new Date(doc.data_ingresso), "dd/MM/yyyy")],
            ["Data do Processo", doc.data_processo ? format(new Date(doc.data_processo), "dd/MM/yyyy") : "—"],
            ["Arquivo", doc.file_name],
            ["Tamanho", formatFileSize(doc.file_size)],
            ["Versão Atual", `v${doc.current_version}`],
            ["Palavras-chave", (doc.palavras_chave ?? []).join(", ") || "—"],
          ],
        },
      ],
    });
  }

  async function handleDownload(url: string, name: string) {
    try {
      const signed = await getSignedUrl(url);
      const a = document.createElement("a");
      a.href = signed;
      a.download = name;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (doc) await logAudit(doc.id, "downloaded", { file_name: name });
    } catch (e) {
      toast.error("Falha ao baixar arquivo", { description: e instanceof Error ? e.message : "" });
    }
  }

  if (!doc) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-full overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
        <SheetHeader>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="mb-2 w-fit -ml-2 text-muted-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" />Voltar
          </Button>
          <SheetTitle>{doc.internal_id}</SheetTitle>
          <SheetDescription>
            Processo {processoLabel(doc.numero_processo)} — {doc.tipo_documento}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4">
            <TabsTrigger value="details" className="text-xs sm:text-sm">Detalhes</TabsTrigger>
            <TabsTrigger value="versions" className="text-xs sm:text-sm">Digitalizados</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs sm:text-sm">Auditoria</TabsTrigger>
            <TabsTrigger value="finance" className="text-xs sm:text-sm">Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={badgeVariantForStatus(doc.estado_processual)}>{doc.estado_processual}</Badge>
              <Badge variant="outline">{doc.materia}</Badge>
              <Badge variant="outline">{doc.confidencialidade}</Badge>
              <Badge variant="secondary">v{doc.current_version}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Info label="Advogado" value={doc.advogado} />
              <Info label="Cliente" value={doc.cliente} />
              <Info label="Parte Autora" value={doc.parte_autora} />
              <Info label="Parte Ré" value={doc.parte_re} />
              <Info label="Órgão Judicial" value={doc.orgao_judicial} />
              <Info label="Data do Documento" value={format(new Date(doc.data_documento), "dd/MM/yyyy")} />
              <Info label="Data de Ingresso" value={format(new Date(doc.data_ingresso), "dd/MM/yyyy")} />
              <Info label="Data do Processo" value={doc.data_processo ? format(new Date(doc.data_processo), "dd/MM/yyyy") : "—"} />
              <Info label="Arquivo" value={doc.file_name} />
              <Info label="Tamanho" value={formatFileSize(doc.file_size)} />
            </div>
            {doc.palavras_chave && doc.palavras_chave.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Palavras-chave</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {doc.palavras_chave.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button className="w-full sm:w-auto" onClick={handleDownloadDossier} disabled={downloading}>
                <Download className="mr-2 h-4 w-4" />{downloading ? "Gerando PDF..." : "Baixar arquivo atual"}
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={handlePrintDetails}>
                <Printer className="mr-2 h-4 w-4" />Imprimir
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="versions" className="pt-4">
            {versions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento digitalizado registrado.</p> : (
              <ul className="space-y-3">
                {versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="font-medium">Digitalizado {v.version_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(v.uploaded_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                      {v.change_notes && <p className="mt-1 text-xs text-muted-foreground">{v.change_notes}</p>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleDownload(v.file_url, doc.file_name)}>
                      <ExternalLink className="mr-2 h-3 w-3" />Abrir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="audit" className="pt-4">
            {audits.length === 0 ? <p className="text-sm text-muted-foreground">Sem registros de auditoria.</p> : (
              <ul className="space-y-2">
                {audits.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-none">
                    <Badge variant="outline">{ACTION_LABEL[a.action] ?? a.action}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(a.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="finance" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button onClick={() => setPayDialogOpen(true)} className="w-full bg-primary hover:bg-primary/90 sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />Adicionar Pagamento
              </Button>
            </div>
            {(() => {
              const total = Number(doc.valor_total_processo ?? 0);
              const saldo = Math.max(0, total - recebido);
              return (
                <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
                  <Card><CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Valor Total do Processo</p>
                    <p className="text-xl font-bold text-foreground sm:text-2xl">{formatBRL(total)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total Recebido</p>
                    <p className="text-xl font-bold text-[oklch(0.72_0.15_250)] sm:text-2xl">{formatBRL(recebido)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Saldo Devedor</p>
                    <p className="text-xl font-bold text-[oklch(0.77_0.13_275)] sm:text-2xl">{formatBRL(saldo)}</p>
                  </CardContent></Card>
                </div>
              );
            })()}

            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
            ) : (
              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-[oklch(0.72_0.15_250)]">{formatBRL(p.valor)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(p.data_pagamento), "dd/MM/yyyy")} · {p.metodo_pagamento} · {p.responsavel_recebimento}
                      </p>
                      {p.descricao && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReceipt({
                          numero_processo: doc.numero_processo,
                          cliente: doc.cliente,
                          data_pagamento: p.data_pagamento,
                          valor: Number(p.valor),
                          metodo_pagamento: p.metodo_pagamento,
                          responsavel_recebimento: p.responsavel_recebimento,
                          descricao: p.descricao,
                        })}
                      >
                        <Printer className="mr-1 h-3 w-3" />Recibo
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditPayment({ ...p })}>
                        <Pencil className="mr-1 h-3 w-3" />Editar
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeletePayment(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>Adicionar Pagamento</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={payForm.valor} onChange={(e) => setPayForm({ ...payForm, valor: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Data *</Label>
                <Input type="date" value={payForm.data_pagamento} onChange={(e) => setPayForm({ ...payForm, data_pagamento: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Responsável *</Label>
                <Input value={payForm.responsavel_recebimento} onChange={(e) => setPayForm({ ...payForm, responsavel_recebimento: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Método *</Label>
                <Select value={payForm.metodo_pagamento} onValueChange={(v) => setPayForm({ ...payForm, metodo_pagamento: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METODOS_PAGAMENTO.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5"><Label>Descrição</Label>
                <Input value={payForm.descricao} onChange={(e) => setPayForm({ ...payForm, descricao: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleAddPayment} disabled={saving} className="bg-primary hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar Pagamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editPayment} onOpenChange={(o) => !o && setEditPayment(null)}>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>Editar Pagamento</DialogTitle></DialogHeader>
            {editPayment && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" min="0" value={String(editPayment.valor)} onChange={(e) => setEditPayment({ ...editPayment, valor: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5"><Label>Data *</Label>
                  <Input type="date" value={editPayment.data_pagamento} onChange={(e) => setEditPayment({ ...editPayment, data_pagamento: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Responsável *</Label>
                  <Input value={editPayment.responsavel_recebimento} onChange={(e) => setEditPayment({ ...editPayment, responsavel_recebimento: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Forma de Pagamento *</Label>
                  <Select value={editPayment.metodo_pagamento} onValueChange={(v) => setEditPayment({ ...editPayment, metodo_pagamento: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{METODOS_PAGAMENTO.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-1.5"><Label>Descrição</Label>
                  <Input value={editPayment.descricao ?? ""} onChange={(e) => setEditPayment({ ...editPayment, descricao: e.target.value })} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPayment(null)}>Cancelar</Button>
              <Button onClick={handleUpdatePayment} disabled={saving} className="bg-primary hover:bg-primary/90">
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ReceiptModal data={receipt} open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)} />
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-foreground">{value || "—"}</p>
    </div>
  );
}