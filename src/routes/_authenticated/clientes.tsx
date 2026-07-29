import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, MessageCircle, User, Printer } from "lucide-react";
import { toast } from "sonner";
import { type Cliente, whatsappLink, formatBRL } from "@/lib/documents";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { format } from "date-fns";
import { printReport } from "@/lib/print-report";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes - Gestão Judicial" }] }),
  component: ClientesPage,
});

type FormState = { nome: string; cpf_cnpj: string; email: string; telefone: string; endereco: string; observacoes: string };
const emptyForm: FormState = { nome: "", cpf_cnpj: "", email: "", telefone: "", endereco: "", observacoes: "" };

function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [profileClient, setProfileClient] = useState<Cliente | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) =>
      c.nome.toLowerCase().includes(q) ||
      (c.cpf_cnpj ?? "").toLowerCase().includes(q) ||
      (c.telefone ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(c: Cliente) {
    setEditing(c);
    setForm({
      nome: c.nome,
      cpf_cnpj: c.cpf_cnpj ?? "",
      email: c.email ?? "",
      telefone: c.telefone,
      endereco: c.endereco ?? "",
      observacoes: c.observacoes ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) return toast.error("Informe o nome");
    if (!form.telefone.trim()) return toast.error("Telefone é obrigatório");
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        nome: form.nome.trim(),
        cpf_cnpj: form.cpf_cnpj.trim() || null,
        email: form.email.trim() || null,
        telefone: form.telefone.trim(),
        endereco: form.endereco.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Cliente atualizado");
      } else {
        const { error } = await supabase.from("clients").insert({ ...payload, created_by: userData.user?.id });
        if (error) throw error;
        toast.success("Cliente cadastrado");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["clients"] });
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Cliente) {
    if (!confirm(`Excluir cliente "${c.nome}"?`)) return;
    const { error } = await supabase.from("clients").delete().eq("id", c.id);
    if (error) return toast.error("Não foi possível excluir", { description: error.message });
    toast.success("Cliente excluído");
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  async function printClientFicha(c: Cliente) {
    const [docsRes, paysRes] = await Promise.all([
      supabase
        .from("documents")
        .select("internal_id, numero_processo, tipo_documento, estado_processual, data_documento, valor_total_processo, valor_recebido_total")
        .eq("cliente_id", c.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select("valor, data_pagamento, responsavel_recebimento, metodo_pagamento, descricao, documents!inner(cliente_id, numero_processo)")
        .eq("documents.cliente_id", c.id)
        .order("data_pagamento", { ascending: false }),
    ]);
    const docs = (docsRes.data ?? []) as Array<Record<string, any>>;
    const pays = (paysRes.data ?? []) as Array<Record<string, any>>;
    const totalRecebido = pays.reduce((s, p) => s + Number(p.valor ?? 0), 0);
    const ok = printReport({
      title: `Ficha do Cliente — ${c.nome}`,
      subtitle: `${c.cpf_cnpj ?? "Sem CPF/CNPJ"} · ${c.telefone}`,
      summary: [
        { label: "Processos", value: String(docs.length) },
        { label: "Pagamentos", value: String(pays.length) },
        { label: "Total recebido", value: formatBRL(totalRecebido) },
      ],
      sections: [
        {
          heading: "Dados cadastrais",
          columns: ["Campo", "Valor"],
          rows: [
            ["Nome", c.nome],
            ["CPF/CNPJ", c.cpf_cnpj ?? "—"],
            ["Telefone", c.telefone],
            ["E-mail", c.email ?? "—"],
            ["Endereço", c.endereco ?? "—"],
            ["Observações", c.observacoes ?? "—"],
          ],
        },
        {
          heading: "Processos vinculados",
          columns: ["ID", "Processo", "Tipo", "Estado", "Data", "Valor total", "Recebido"],
          rows: docs.map((d) => [
            d.internal_id ?? "—",
            d.numero_processo ?? "—",
            d.tipo_documento ?? "—",
            d.estado_processual ?? "—",
            d.data_documento ? format(new Date(d.data_documento), "dd/MM/yyyy") : "—",
            formatBRL(Number(d.valor_total_processo ?? 0)),
            formatBRL(Number(d.valor_recebido_total ?? 0)),
          ]),
        },
        {
          heading: "Histórico de pagamentos",
          columns: ["Data", "Processo", "Valor", "Método", "Recebido por", "Descrição"],
          rows: pays.map((p) => [
            p.data_pagamento ? format(new Date(p.data_pagamento), "dd/MM/yyyy") : "—",
            p.documents?.numero_processo ?? "—",
            formatBRL(Number(p.valor ?? 0)),
            p.metodo_pagamento ?? "—",
            p.responsavel_recebimento ?? "—",
            p.descricao ?? "—",
          ]),
        },
      ],
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Clientes</h2>
          <p className="text-sm text-muted-foreground">Cadastro completo com contato direto por WhatsApp.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => {
            if (!filtered.length) return toast.error("Nenhum cliente para imprimir");
            const ok = printReport({
              title: "Relatório de Clientes",
              subtitle: `${filtered.length} cliente(s)`,
              sections: [{
                columns: ["Nome", "CPF/CNPJ", "Telefone", "E-mail", "Endereço"],
                rows: filtered.map((c) => [c.nome, c.cpf_cnpj ?? "—", c.telefone, c.email ?? "—", c.endereco ?? "—"]),
              }],
            });
            if (!ok) toast.error("Permita pop-ups para imprimir");
          }}
        >
          <Printer className="mr-2 h-4 w-4" />Imprimir
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="w-full bg-primary hover:bg-primary/90 sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>CPF / CNPJ</Label>
                  <Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone *</Label>
                  <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 91234-5678" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Endereço</Label>
                <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <Input placeholder="Buscar por nome, CPF/CNPJ ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="divide-y rounded-md border md:hidden">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            ) : filtered.map((c) => (
              <div key={c.id} className="space-y-2 p-4">
                <p className="break-words font-medium text-foreground">{c.nome}</p>
                <p className="break-words text-xs text-muted-foreground">{c.cpf_cnpj ?? "—"} · {c.email ?? "—"}</p>
                <p className="break-words text-sm text-muted-foreground">{c.telefone}</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={whatsappLink(c.telefone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white"
                  >
                    <MessageCircle className="h-4 w-4" />WhatsApp
                  </a>
                  <Button size="sm" variant="outline" onClick={() => setProfileClient(c)}><User className="mr-1 h-4 w-4" />Ficha</Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(c)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>
                  <Button size="sm" variant="outline" onClick={() => printClientFicha(c)}><Printer className="mr-1 h-4 w-4" />Imprimir</Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(c)}><Trash2 className="mr-1 h-4 w-4 text-destructive" />Excluir</Button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden w-full overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>{c.cpf_cnpj ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{c.telefone}</span>
                        <a
                          href={whatsappLink(c.telefone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
                          title="Abrir WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setProfileClient(c)} title="Ver perfil"><User className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => printClientFicha(c)} title="Imprimir ficha"><Printer className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ClientProfileDialog
        client={profileClient}
        onClose={() => setProfileClient(null)}
        onPrintReceipt={(r) => setReceipt(r)}
      />
      <ReceiptModal data={receipt} open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)} />
    </div>
  );
}

function ClientProfileDialog({
  client,
  onClose,
  onPrintReceipt,
}: {
  client: Cliente | null;
  onClose: () => void;
  onPrintReceipt: (r: ReceiptData) => void;
}) {
  const enabled = !!client;
  const { data: docs } = useQuery({
    queryKey: ["client-docs", client?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, internal_id, numero_processo, tipo_documento, estado_processual, data_documento, valor_total_processo, valor_recebido_total")
        .eq("cliente_id", client!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: pays } = useQuery({
    queryKey: ["client-pays", client?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, valor, data_pagamento, responsavel_recebimento, metodo_pagamento, descricao, document_id, documents!inner(cliente_id, numero_processo, cliente)")
        .eq("documents.cliente_id", client!.id)
        .order("data_pagamento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; valor: number; data_pagamento: string; responsavel_recebimento: string;
        metodo_pagamento: string; descricao: string | null;
        documents: { numero_processo: string; cliente: string } | null;
      }>;
    },
  });

  return (
    <Dialog open={enabled} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client?.nome}</DialogTitle>
        </DialogHeader>
        {client && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Info label="CPF/CNPJ" value={client.cpf_cnpj ?? "—"} />
              <Info label="Telefone" value={client.telefone} />
              <Info label="E-mail" value={client.email ?? "—"} />
              <Info label="Endereço" value={client.endereco ?? "—"} />
            </div>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Processos</h3>
              <div className="w-full overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Processo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Recebido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(docs ?? []).map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs">{d.numero_processo}</TableCell>
                        <TableCell className="text-xs">{d.tipo_documento}</TableCell>
                        <TableCell className="text-xs">{d.estado_processual}</TableCell>
                        <TableCell className="text-right font-mono">{formatBRL(Number(d.valor_total_processo ?? 0))}</TableCell>
                        <TableCell className="text-right font-mono text-accent">{formatBRL(Number(d.valor_recebido_total ?? 0))}</TableCell>
                      </TableRow>
                    ))}
                    {(!docs || docs.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Sem processos vinculados.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Pagamentos</h3>
              <div className="w-full overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Processo</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pays ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{format(new Date(p.data_pagamento), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-xs">{p.documents?.numero_processo ?? "—"}</TableCell>
                        <TableCell className="text-xs">{p.metodo_pagamento}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-accent">{formatBRL(Number(p.valor))}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => onPrintReceipt({
                            numero_processo: p.documents?.numero_processo ?? "—",
                            cliente: client.nome,
                            data_pagamento: p.data_pagamento,
                            valor: Number(p.valor),
                            metodo_pagamento: p.metodo_pagamento,
                            responsavel_recebimento: p.responsavel_recebimento,
                            descricao: p.descricao,
                          })}>
                            <Printer className="mr-1 h-3 w-3" />Recibo
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!pays || pays.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}