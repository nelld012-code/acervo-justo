import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIAS_DESPESA, formatBRL, type Expense, type PaymentRow } from "@/lib/documents";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Financeiro</h2>
          <p className="text-sm text-muted-foreground">
            Resumo de {format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90"><Plus className="mr-2 h-4 w-4" />Nova Despesa</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Registrar Despesa</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1.5"><Label>Descrição *</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1.5"><Label>Observações</Label>
                <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
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

      <div className="grid gap-4 md:grid-cols-3">
        <HeroCard title="Total de Entradas" value={formatBRL(totalEntradas)} icon={<TrendingUp className="h-5 w-5" />} tone="up" />
        <HeroCard title="Total de Saídas" value={formatBRL(totalSaidas)} icon={<TrendingDown className="h-5 w-5" />} tone="down" />
        <HeroCard title="Saldo do Mês" value={formatBRL(saldo)} icon={<Wallet className="h-5 w-5" />} tone={saldo >= 0 ? "up" : "down"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ranking de Clientes (mês)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {rankingClientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem pagamentos neste mês.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingClientes} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tickFormatter={(v) => formatBRL(v)} stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis type="category" dataKey="cliente" stroke="var(--muted-foreground)" fontSize={11} width={120} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                  <Bar dataKey="total" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Fluxo de Caixa (mês)</CardTitle></CardHeader>
          <CardContent className="h-72">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Últimos Pagamentos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Processo</TableHead><TableHead className="text-right">Valor</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(payments ?? []).slice(0, 10).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{format(new Date(p.data_pagamento), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{p.documents?.cliente ?? "—"}</TableCell>
                    <TableCell className="text-xs">{p.documents?.numero_processo ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-accent">{formatBRL(Number(p.valor))}</TableCell>
                  </TableRow>
                ))}
                {(!payments || payments.length === 0) && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Sem pagamentos.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Últimas Despesas</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Data</TableHead><TableHead>Categoria</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(expenses ?? []).slice(0, 10).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{format(new Date(e.data_despesa), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-xs">{e.categoria}</TableCell>
                    <TableCell>{e.descricao}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-destructive">{formatBRL(Number(e.valor))}</TableCell>
                  </TableRow>
                ))}
                {(!expenses || expenses.length === 0) && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Sem despesas.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
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