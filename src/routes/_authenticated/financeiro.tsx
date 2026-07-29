import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, TrendingDown, Wallet, Receipt, Pencil, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIAS_DESPESA, METODOS_PAGAMENTO, formatBRL, type Expense, type PaymentRow } from "@/lib/documents";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { printReport } from "@/lib/print-report";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro - Gestão Judicial" }] }),
  component: FinanceiroPage,
});

type PaymentWithDoc = PaymentRow & { documents: { numero_processo: string; cliente: string } | null };

function FinanceiroPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    descricao: "", categoria: "Outros", valor: "",
    data_despesa: new Date().toISOString().slice(0, 10),
    responsavel_pagamento: "",
  });
  const [payOpen, setPayOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<PaymentWithDoc | null>(null);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);

  async function handleDeletePayment(p: PaymentWithDoc) {
    if (!confirm("Excluir este pagamento?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", p.id);
    if (error) return toast.error("Não foi possível excluir", { description: error.message });
    toast.success("Pagamento excluído");
    qc.invalidateQueries({ queryKey: ["fin-payments"] });
  }

  async function handleDeleteExpense(e: Expense) {
    if (!confirm("Excluir esta despesa?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) return toast.error("Não foi possível excluir", { description: error.message });
    toast.success("Despesa excluída");
    qc.invalidateQueries({ queryKey: ["fin-expenses"] });
  }

  const monthStart = startOfMonth(new Date()).toISOString().slice(0, 10);
  const monthEnd = endOfMonth(new Date()).toISOString().slice(0, 10);

  const { data: payments } = useQuery({
    queryKey: ["fin-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, document_id, valor, data_pagamento, responsavel_recebimento, metodo_pagamento, descricao, created_at, documents(numero_processo, cliente)")
        .order("data_pagamento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PaymentWithDoc[];
    },
  });

  const { data: expenses } = useQuery({
    queryKey: ["fin-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("data_despesa", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const monthPayments = useMemo(
    () => (payments ?? []).filter((p) => p.data_pagamento >= monthStart && p.data_pagamento <= monthEnd),
    [payments, monthStart, monthEnd],
  );
  const monthExpenses = useMemo(
    () => (expenses ?? []).filter((e) => e.data_despesa >= monthStart && e.data_despesa <= monthEnd),
    [expenses, monthStart, monthEnd],
  );

  const totalEntradas = monthPayments.reduce((s, p) => s + Number(p.valor), 0);
  const totalSaidas = monthExpenses.reduce((s, e) => s + Number(e.valor), 0);
  const saldo = totalEntradas - totalSaidas;

  const rankingClientes = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of monthPayments) {
      const nome = p.documents?.cliente ?? "—";
      map.set(nome, (map.get(nome) ?? 0) + Number(p.valor));
    }
    return Array.from(map.entries())
      .map(([cliente, total]) => ({ cliente, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [monthPayments]);

  const fluxoCaixa = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    const days: { dia: string; saldo: number }[] = [];
    let acc = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const entradas = monthPayments.filter((p) => p.data_pagamento === key).reduce((s, p) => s + Number(p.valor), 0);
      const saidas = monthExpenses.filter((e) => e.data_despesa === key).reduce((s, e) => s + Number(e.valor), 0);
      acc += entradas - saidas;
      days.push({ dia: format(new Date(key), "dd/MM"), saldo: Number(acc.toFixed(2)) });
    }
    return days;
  }, [monthPayments, monthExpenses]);

  async function handleSaveExpense() {
    if (!form.descricao.trim()) return toast.error("Informe a descrição");
    const valor = Number(form.valor);
    if (!valor || valor <= 0) return toast.error("Valor inválido");
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("expenses").insert({
        descricao: form.descricao.trim(),
        categoria: form.categoria,
        valor,
        data_despesa: form.data_despesa,
        responsavel_pagamento: form.responsavel_pagamento.trim() || null,
        user_id: u.user?.id,
      });
      if (error) throw error;
      toast.success("Despesa registrada");
      setOpen(false);
      setForm({ descricao: "", categoria: "Outros", valor: "", data_despesa: new Date().toISOString().slice(0, 10), responsavel_pagamento: "" });
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
    } catch (e) {
      toast.error("Falha ao salvar despesa", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Financeiro</h2>
          <p className="text-sm text-muted-foreground">
            Resumo de {format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              const ok = printReport({
                title: "Relatório Financeiro",
                subtitle: format(new Date(), "MMMM 'de' yyyy", { locale: ptBR }),
                summary: [
                  { label: "Total de Entradas", value: formatBRL(totalEntradas) },
                  { label: "Total de Saídas", value: formatBRL(totalSaidas) },
                  { label: "Saldo do Mês", value: formatBRL(saldo) },
                ],
                sections: [
                  {
                    heading: "Pagamentos do mês",
                    columns: ["Data", "Cliente", "Processo", "Método", "Responsável", "Valor"],
                    rows: monthPayments.map((p) => [
                      format(new Date(p.data_pagamento), "dd/MM/yyyy"),
                      p.documents?.cliente ?? "—",
                      p.documents?.numero_processo ?? "—",
                      p.metodo_pagamento,
                      p.responsavel_recebimento,
                      formatBRL(Number(p.valor)),
                    ]),
                  },
                  {
                    heading: "Despesas do mês",
                    columns: ["Data", "Descrição", "Categoria", "Responsável", "Valor"],
                    rows: monthExpenses.map((e) => [
                      format(new Date(e.data_despesa), "dd/MM/yyyy"),
                      e.descricao,
                      e.categoria,
                      e.responsavel_pagamento ?? "—",
                      formatBRL(Number(e.valor)),
                    ]),
                  },
                ],
              });
              if (!ok) toast.error("Não foi possível abrir a impressão");
            }}
          >
            <Printer className="mr-2 h-4 w-4" />Imprimir
          </Button>
          <Button onClick={() => setPayOpen(true)} className="w-full bg-primary hover:bg-primary/90 sm:w-auto">
            <Receipt className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">Registrar Entrada (Pagamento)</span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Nova Despesa</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>Registrar Despesa</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1.5"><Label>Descrição *</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Categoria *</Label>
                  <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIAS_DESPESA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Data *</Label>
                  <Input type="date" value={form.data_despesa} onChange={(e) => setForm({ ...form, data_despesa: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Responsável</Label>
                  <Input value={form.responsavel_pagamento} onChange={(e) => setForm({ ...form, responsavel_pagamento: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveExpense} disabled={saving} className="bg-primary hover:bg-primary/90">
                {saving ? "Salvando..." : "Salvar Despesa"}
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <RegisterPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["fin-payments"] })}
      />

      <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
        <HeroCard title="Total de Entradas" value={formatBRL(totalEntradas)} icon={<TrendingUp className="h-5 w-5" />} tone="up" />
        <HeroCard title="Total de Saídas" value={formatBRL(totalSaidas)} icon={<TrendingDown className="h-5 w-5" />} tone="down" />
        <HeroCard title="Saldo do Mês" value={formatBRL(saldo)} icon={<Wallet className="h-5 w-5" />} tone={saldo >= 0 ? "up" : "down"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>Ranking de Clientes (mês)</CardTitle></CardHeader>
          <CardContent className="h-72 px-2 sm:px-6">
            {rankingClientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem pagamentos neste mês.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingClientes} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tickFormatter={(v) => formatBRL(v)} stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis type="category" dataKey="cliente" stroke="var(--muted-foreground)" fontSize={11} width={80} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                  <Bar dataKey="total" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Fluxo de Caixa (mês)</CardTitle></CardHeader>
          <CardContent className="h-72 px-2 sm:px-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fluxoCaixa}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatBRL(v)} />
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                <Line type="monotone" dataKey="saldo" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>Últimos Pagamentos</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Processo</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-[90px] text-right">Ações</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(payments ?? []).slice(0, 10).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{format(new Date(p.data_pagamento), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{p.documents?.cliente ?? "—"}</TableCell>
                    <TableCell className="text-xs">{p.documents?.numero_processo ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-accent">{formatBRL(Number(p.valor))}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditPayment(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Excluir" onClick={() => handleDeletePayment(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!payments || payments.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Sem pagamentos.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Últimas Despesas</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Data</TableHead><TableHead>Categoria</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-[90px] text-right">Ações</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(expenses ?? []).slice(0, 10).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{format(new Date(e.data_despesa), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-xs">{e.categoria}</TableCell>
                    <TableCell>{e.descricao}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-destructive">{formatBRL(Number(e.valor))}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditExpense(e)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Excluir" onClick={() => handleDeleteExpense(e)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!expenses || expenses.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Sem despesas.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <EditPaymentDialog
        payment={editPayment}
        onClose={() => setEditPayment(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["fin-payments"] })}
      />
      <EditExpenseDialog
        expense={editExpense}
        onClose={() => setEditExpense(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["fin-expenses"] })}
      />
    </div>
  );
}

function EditPaymentDialog({
  payment, onClose, onSaved,
}: { payment: PaymentWithDoc | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    valor: "", data_pagamento: "", responsavel_recebimento: "", metodo_pagamento: "PIX", descricao: "",
  });
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (payment && payment.id !== loadedId) {
    setLoadedId(payment.id);
    setForm({
      valor: String(payment.valor ?? ""),
      data_pagamento: payment.data_pagamento,
      responsavel_recebimento: payment.responsavel_recebimento ?? "",
      metodo_pagamento: payment.metodo_pagamento ?? "PIX",
      descricao: payment.descricao ?? "",
    });
  }

  async function handleSave() {
    if (!payment) return;
    const valor = Number(form.valor);
    if (!valor || valor <= 0) return toast.error("Valor inválido");
    if (!form.responsavel_recebimento.trim()) return toast.error("Informe o responsável");
    setSaving(true);
    try {
      const { error } = await supabase.from("payments").update({
        valor,
        data_pagamento: form.data_pagamento,
        responsavel_recebimento: form.responsavel_recebimento.trim(),
        metodo_pagamento: form.metodo_pagamento,
        descricao: form.descricao.trim() || null,
      }).eq("id", payment.id);
      if (error) throw error;
      toast.success("Pagamento atualizado");
      onSaved();
      setLoadedId(null);
      onClose();
    } catch (e) {
      toast.error("Falha ao atualizar", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!payment} onOpenChange={(o) => { if (!o) { setLoadedId(null); onClose(); } }}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Pagamento</DialogTitle></DialogHeader>
        {payment && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{payment.documents?.numero_processo ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{payment.documents?.cliente ?? "—"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Data *</Label>
                <Input type="date" value={form.data_pagamento} onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Responsável *</Label>
                <Input value={form.responsavel_recebimento} onChange={(e) => setForm({ ...form, responsavel_recebimento: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Método *</Label>
                <Select value={form.metodo_pagamento} onValueChange={(v) => setForm({ ...form, metodo_pagamento: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METODOS_PAGAMENTO.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5"><Label>Descrição</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setLoadedId(null); onClose(); }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditExpenseDialog({
  expense, onClose, onSaved,
}: { expense: Expense | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    descricao: "", categoria: "Outros", valor: "", data_despesa: "", responsavel_pagamento: "",
  });

  if (expense && expense.id !== loadedId) {
    setLoadedId(expense.id);
    setForm({
      descricao: expense.descricao ?? "",
      categoria: expense.categoria ?? "Outros",
      valor: String(expense.valor ?? ""),
      data_despesa: expense.data_despesa,
      responsavel_pagamento: expense.responsavel_pagamento ?? "",
    });
  }

  async function handleSave() {
    if (!expense) return;
    if (!form.descricao.trim()) return toast.error("Informe a descrição");
    const valor = Number(form.valor);
    if (!valor || valor <= 0) return toast.error("Valor inválido");
    setSaving(true);
    try {
      const { error } = await supabase.from("expenses").update({
        descricao: form.descricao.trim(),
        categoria: form.categoria,
        valor,
        data_despesa: form.data_despesa,
        responsavel_pagamento: form.responsavel_pagamento.trim() || null,
      }).eq("id", expense.id);
      if (error) throw error;
      toast.success("Despesa atualizada");
      onSaved();
      setLoadedId(null);
      onClose();
    } catch (e) {
      toast.error("Falha ao atualizar", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!expense} onOpenChange={(o) => { if (!o) { setLoadedId(null); onClose(); } }}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Despesa</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Descrição *</Label>
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Categoria *</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_DESPESA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
            <div className="space-y-1.5"><Label>Data *</Label>
              <Input type="date" value={form.data_despesa} onChange={(e) => setForm({ ...form, data_despesa: e.target.value })} />
            </div>
            <div className="space-y-1.5"><Label>Responsável</Label>
              <Input value={form.responsavel_pagamento} onChange={(e) => setForm({ ...form, responsavel_pagamento: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setLoadedId(null); onClose(); }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeroCard({ title, value, icon, tone }: { title: string; value: string; icon: React.ReactNode; tone: "up" | "down" }) {
  return (
    <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-indigo-600/20 via-card to-blue-600/10">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between text-muted-foreground">
          <p className="text-sm font-medium">{title}</p>
          <span className={tone === "up" ? "text-accent" : "text-destructive"}>{icon}</span>
        </div>
        <p className={`mt-2 font-mono text-3xl font-bold ${tone === "up" ? "text-accent" : "text-destructive"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

type ProcessOption = {
  id: string;
  numero_processo: string;
  cliente: string;
  valor_total_processo: number | null;
  valor_recebido_total: number | null;
};

function RegisterPaymentDialog({
  open, onOpenChange, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProcessOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    valor: "",
    data_pagamento: new Date().toISOString().slice(0, 10),
    responsavel_recebimento: "",
    metodo_pagamento: "PIX",
    descricao: "",
  });

  const { data: results } = useQuery({
    queryKey: ["proc-search", query],
    enabled: open && query.trim().length >= 2 && !selected,
    queryFn: async () => {
      const q = `%${query.trim()}%`;
      const { data, error } = await supabase
        .from("documents")
        .select("id, numero_processo, cliente, valor_total_processo, valor_recebido_total")
        .or(`numero_processo.ilike.${q},cliente.ilike.${q}`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as ProcessOption[];
    },
  });

  function reset() {
    setQuery(""); setSelected(null);
    setForm({ valor: "", data_pagamento: new Date().toISOString().slice(0, 10), responsavel_recebimento: "", metodo_pagamento: "PIX", descricao: "" });
  }

  async function handleSave() {
    if (!selected) return toast.error("Selecione um processo");
    const valor = Number(form.valor);
    if (!valor || valor <= 0) return toast.error("Valor inválido");
    if (!form.responsavel_recebimento.trim()) return toast.error("Informe o responsável");
    const total = Number(selected.valor_total_processo ?? 0);
    const recebido = Number(selected.valor_recebido_total ?? 0);
    if (total > 0 && recebido + valor > total) {
      return toast.error("Valor excede o saldo devedor", { description: `Saldo restante: ${formatBRL(total - recebido)}` });
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("payments").insert({
        document_id: selected.id,
        valor,
        data_pagamento: form.data_pagamento,
        responsavel_recebimento: form.responsavel_recebimento.trim(),
        metodo_pagamento: form.metodo_pagamento,
        descricao: form.descricao.trim() || null,
        created_by: u.user?.id,
      });
      if (error) throw error;
      toast.success("Pagamento registrado");
      onSaved();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error("Falha ao registrar pagamento", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar Entrada (Pagamento)</DialogTitle></DialogHeader>
        {!selected ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Buscar processo *</Label>
              <Input
                autoFocus
                placeholder="Nº do processo ou nome do cliente..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {query.trim().length < 2 ? (
                <p className="p-3 text-xs text-muted-foreground">Digite ao menos 2 caracteres para buscar.</p>
              ) : (results ?? []).length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Nenhum processo encontrado.</p>
              ) : (
                <ul>
                  {(results ?? []).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="flex w-full items-center justify-between border-b p-3 text-left text-sm last:border-none hover:bg-muted/40"
                      >
                        <div>
                          <p className="font-medium">{r.numero_processo}</p>
                          <p className="text-xs text-muted-foreground">{r.cliente}</p>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatBRL(Number(r.valor_recebido_total ?? 0))} / {formatBRL(Number(r.valor_total_processo ?? 0))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selected.numero_processo}</p>
                  <p className="text-xs text-muted-foreground">{selected.cliente}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Trocar</Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Data *</Label>
                <Input type="date" value={form.data_pagamento} onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Responsável *</Label>
                <Input value={form.responsavel_recebimento} onChange={(e) => setForm({ ...form, responsavel_recebimento: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Método *</Label>
                <Select value={form.metodo_pagamento} onValueChange={(v) => setForm({ ...form, metodo_pagamento: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METODOS_PAGAMENTO.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5"><Label>Descrição</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !selected} className="bg-primary hover:bg-primary/90">
            {saving ? "Salvando..." : "Salvar Pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}