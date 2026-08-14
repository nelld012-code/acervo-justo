import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Pencil,
  Trash2,
  Printer,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import {
  CATEGORIAS_DESPESA,
  METODOS_PAGAMENTO,
  formatBRL,
  logAudit,
  processoLabel,
  type Expense,
  type PaymentRow,
} from "@/lib/documents";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { printReport } from "@/lib/print-report";
import {
  printFinancialRecord,
  isSalario,
  type RegistroFinanceiro,
} from "@/lib/print-financeiro";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro - Gestão Judicial" }] }),
  component: FinanceiroPage,
});

type PaymentWithDoc = PaymentRow & {
  documents: {
    numero_processo: string;
    cliente: string;
  } | null;
};

function AccessDenied({ msg }: { msg: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold text-foreground">Acesso restrito</h2>
      <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function FinanceiroPage() {
  const { perms, isLoading: loadingPerms } = useProfile();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    descricao: "",
    categoria: "Outros",
    valor: "",
    data_despesa: new Date().toISOString().slice(0, 10),
    responsavel_pagamento: "",
    recebedor_salario: "",
  });

  const [payOpen, setPayOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<PaymentWithDoc | null>(null);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [ficha, setFicha] = useState<RegistroFinanceiro | null>(null);
  const [excluindo, setExcluindo] = useState<RegistroFinanceiro | null>(null);
  const [imprimindo, setImprimindo] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [relatorio, setRelatorio] = useState<
    "entradas" | "saidas" | "saldo" | null
  >(null);

  async function confirmarExclusao() {
    const rec = excluindo;
    if (!rec) return;

    const tabela = rec.kind === "entrada" ? "payments" : "expenses";

    const { error } = await supabase
      .from(tabela)
      .delete()
      .eq("id", rec.id);

    if (error) {
      toast.error("Não foi possível excluir", {
        description: error.message,
      });
      return;
    }

    await logAudit(
      rec.kind === "entrada" ? rec.document_id ?? null : null,
      "deleted",
      {
        entidade: rec.kind === "entrada" ? "pagamento" : "despesa",
        registro_id: rec.id,
        nome: rec.nome,
        valor: rec.valor,
      },
    );

    toast.success("Registro financeiro excluído");
    setExcluindo(null);

    qc.invalidateQueries({ queryKey: ["fin-payments"] });
    qc.invalidateQueries({ queryKey: ["fin-expenses"] });
  }

  async function imprimirRegistro(rec: RegistroFinanceiro) {
    setImprimindo(rec.id);

    try {
      await printFinancialRecord(rec);
    } catch (e) {
      toast.error("Não foi possível gerar a impressão", {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setImprimindo(null);
    }
  }

  function abrirEdicao(rec: RegistroFinanceiro) {
    if (rec.kind === "entrada") {
      const p = (payments ?? []).find((x) => x.id === rec.id);
      if (p) setEditPayment(p);
    } else {
      const e = (expenses ?? []).find((x) => x.id === rec.id);
      if (e) setEditExpense(e);
    }
  }

  const monthStart = startOfMonth(new Date())
    .toISOString()
    .slice(0, 10);

  const monthEnd = endOfMonth(new Date())
    .toISOString()
    .slice(0, 10);

  const { data: payments } = useQuery({
    queryKey: ["fin-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, document_id, valor, data_pagamento, responsavel_recebimento, metodo_pagamento, descricao, created_at, documents(numero_processo, cliente)",
        )
        .order("data_pagamento", { ascending: false });

      if (error) throw error;

      return (data ?? []) as unknown as PaymentWithDoc[];
    },
  });

  const { data: expenses } = useQuery({
    queryKey: ["fin-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("data_despesa", { ascending: false });

      if (error) throw error;

      return (data ?? []) as Expense[];
    },
  });

  const { data: docsFin, isLoading: loadingDocsFin } = useQuery({
    queryKey: ["fin-docs-receber"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, valor_total_processo, valor_recebido_total");

      if (error) throw error;

      return data ?? [];
    },
  });

  const totalReceber = (docsFin ?? []).reduce((acc, d) => {
    const tot = Number(d.valor_total_processo ?? 0);
    const rec = Number(d.valor_recebido_total ?? 0);

    return acc + Math.max(0, tot - rec);
  }, 0);

  const monthPayments = useMemo(
    () =>
      (payments ?? []).filter(
        (p) =>
          p.data_pagamento >= monthStart &&
          p.data_pagamento <= monthEnd,
      ),
    [payments, monthStart, monthEnd],
  );

  const monthExpenses = useMemo(
    () =>
      (expenses ?? []).filter(
        (e) =>
          e.data_despesa >= monthStart &&
          e.data_despesa <= monthEnd,
      ),
    [expenses, monthStart, monthEnd],
  );

  const totalEntradas = monthPayments.reduce(
    (s, p) => s + Number(p.valor),
    0,
  );

  const totalSaidas = monthExpenses.reduce(
    (s, e) => s + Number(e.valor),
    0,
  );

  const saldo = totalEntradas - totalSaidas;

  const registros = useMemo<RegistroFinanceiro[]>(() => {
    const entradas: RegistroFinanceiro[] = (payments ?? []).map((p) => ({
      kind: "entrada",
      id: p.id,
      nome: p.documents?.cliente ?? "—",
      numero_processo: p.documents?.numero_processo ?? null,
      tipo: "Entrada",
      valor: Number(p.valor),
      data: p.data_pagamento,
      status: "Recebido",
      observacao: p.descricao ?? null,
      document_id: p.document_id,
      metodo_pagamento: p.metodo_pagamento ?? null,
      responsavel_recebimento:
        p.responsavel_recebimento ?? null,
    }));

    const saidas: RegistroFinanceiro[] = (expenses ?? []).map((e) => ({
      kind: "saida",
      id: e.id,
      nome: e.responsavel_pagamento || e.descricao,
      numero_processo: null,
      tipo: "Saída",
      valor: Number(e.valor),
      data: e.data_despesa,
      status: "Pago",
      observacao: e.descricao ?? null,
      categoria: e.categoria ?? null,
      responsavel_pagamento:
        e.responsavel_pagamento ?? null,
      recebedor_salario:
        e.recebedor_salario ?? null,
    }));

    return [...entradas, ...saidas].sort((a, b) =>
      b.data.localeCompare(a.data),
    );
  }, [payments, expenses]);

  const registrosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const min = Number(valorMin);

    return registros.filter((r) => {
      if (termo) {
        const hay = `
          ${r.nome}
          ${r.numero_processo ?? ""}
          ${r.tipo}
          ${r.status}
          ${r.observacao ?? ""}
          ${r.responsavel_recebimento ?? ""}
          ${r.responsavel_pagamento ?? ""}
          ${r.metodo_pagamento ?? ""}
          ${r.categoria ?? ""}
          ${r.recebedor_salario ?? ""}
        `.toLowerCase();

        if (!hay.includes(termo)) return false;
      }

      if (filtroTipo !== "Todos" && r.tipo !== filtroTipo) {
        return false;
      }

      if (filtroStatus !== "Todos" && r.status !== filtroStatus) {
        return false;
      }

      if (dataDe && r.data < dataDe) return false;
      if (dataAte && r.data > dataAte) return false;

      if (
        valorMin &&
        !Number.isNaN(min) &&
        r.valor < min
      ) {
        return false;
      }

      return true;
    });
  }, [
    registros,
    busca,
    filtroTipo,
    filtroStatus,
    dataDe,
    dataAte,
    valorMin,
  ]);

  const totalRecebidoFiltrado = registrosFiltrados
    .filter((r) => r.kind === "entrada")
    .reduce((s, r) => s + r.valor, 0);

  const PAGE_SIZE = 8;

  const totalPaginas = Math.max(
    1,
    Math.ceil(registrosFiltrados.length / PAGE_SIZE),
  );

  useEffect(() => {
    setPagina(1);
  }, [busca, filtroTipo, filtroStatus, dataDe, dataAte, valorMin]);

  const paginaAtual = Math.min(pagina, totalPaginas);

  const registrosPagina = useMemo(
    () =>
      registrosFiltrados.slice(
        (paginaAtual - 1) * PAGE_SIZE,
        paginaAtual * PAGE_SIZE,
      ),
    [registrosFiltrados, paginaAtual],
  );

  const totalPagoFiltrado = registrosFiltrados
    .filter((r) => r.kind === "saida")
    .reduce((s, r) => s + r.valor, 0);

  const totalGeralFiltrado =
    totalRecebidoFiltrado - totalPagoFiltrado;

  const rankingClientes = useMemo(() => {
    const map = new Map<string, number>();

    for (const p of monthPayments) {
      const nome = p.documents?.cliente ?? "—";

      map.set(
        nome,
        (map.get(nome) ?? 0) + Number(p.valor),
      );
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

    for (
      let d = new Date(start);
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const key = d.toISOString().slice(0, 10);

      const entradas = monthPayments
        .filter((p) => p.data_pagamento === key)
        .reduce((s, p) => s + Number(p.valor), 0);

      const saidas = monthExpenses
        .filter((e) => e.data_despesa === key)
        .reduce((s, e) => s + Number(e.valor), 0);

      acc += entradas - saidas;

      days.push({
        dia: format(new Date(key), "dd/MM"),
        saldo: Number(acc.toFixed(2)),
      });
    }

    return days;
  }, [monthPayments, monthExpenses]);

  async function handleSaveExpense() {
    if (!form.descricao.trim()) {
      return toast.error("Informe a descrição");
    }

    const valor = Number(form.valor);

    if (!valor || valor <= 0) {
      return toast.error("Valor inválido");
    }

    if (
      isSalario(form.categoria) &&
      !form.recebedor_salario.trim()
    ) {
      return toast.error(
        "Informe o nome do recebedor do salário.",
      );
    }

    setSaving(true);

    try {
      const { data: u } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("expenses")
        .insert({
          descricao: form.descricao.trim(),
          categoria: form.categoria,
          valor,
          data_despesa: form.data_despesa,
          responsavel_pagamento:
            form.responsavel_pagamento.trim() || null,
          recebedor_salario:
            form.recebedor_salario.trim() || null,
          user_id: u.user?.id,
        });

      if (error) throw error;

      toast.success("Despesa registrada");

      setOpen(false);

      setForm({
        descricao: "",
        categoria: "Outros",
        valor: "",
        data_despesa: new Date()
          .toISOString()
          .slice(0, 10),
        responsavel_pagamento: "",
        recebedor_salario: "",
      });

      qc.invalidateQueries({
        queryKey: ["fin-expenses"],
      });
    } catch (e) {
      toast.error("Falha ao salvar despesa", {
        description:
          e instanceof Error ? e.message : "",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loadingPerms) return null;

  if (!perms.canAccessFinance) {
    return (
      <AccessDenied
        msg="O módulo financeiro está disponível apenas para administradores e advogados."
      />
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Financeiro
          </h2>

          <p className="text-sm text-muted-foreground">
            Resumo de{" "}
            {format(new Date(), "MMMM 'de' yyyy", {
              locale: ptBR,
            })}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              const ok = printReport({
                title: "Relatório Financeiro",
                subtitle: format(
                  new Date(),
                  "MMMM 'de' yyyy",
                  { locale: ptBR },
                ),
                summary: [
                  {
                    label: "Total de Entradas",
                    value: formatBRL(totalEntradas),
                  },
                  {
                    label: "Total de Saídas",
                    value: formatBRL(totalSaidas),
                  },
                  {
                    label: "Saldo do Mês",
                    value: formatBRL(saldo),
                  },
                ],
                sections: [
                  {
                    heading: "Pagamentos do mês",
                    columns: [
                      "Data",
                      "Cliente",
                      "Processo",
                      "Método",
                      "Responsável",
                      "Valor",
                    ],
                    rows: monthPayments.map((p) => [
                      format(
                        new Date(p.data_pagamento),
                        "dd/MM/yyyy",
                      ),
                      p.documents?.cliente ?? "—",
                      p.documents?.numero_processo ?? "—",
                      p.metodo_pagamento,
                      p.responsavel_recebimento,
                      formatBRL(Number(p.valor)),
                    ]),
                  },
                  {
                    heading: "Despesas do mês",
                    columns: [
                      "Data",
                      "Descrição",
                      "Categoria",
                      "Responsável",
                      "Valor",
                    ],
                    rows: monthExpenses.map((e) => [
                      format(
                        new Date(e.data_despesa),
                        "dd/MM/yyyy",
                      ),
                      e.descricao,
                      e.categoria,
                      e.responsavel_pagamento ?? "—",
                      formatBRL(Number(e.valor)),
                    ]),
                  },
                ],
              });

              if (!ok) {
                toast.error(
                  "Não foi possível abrir a impressão",
                );
              }
            }}
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>

          <Button
            onClick={() => setPayOpen(true)}
            className="w-full bg-primary hover:bg-primary/90 sm:w-auto"
          >
            <Receipt className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">
              Registrar Entrada (Pagamento)
            </span>
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Despesa
              </Button>
            </DialogTrigger>

            <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Registrar Despesa
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label>Descrição *</Label>

                  <Input
                    value={form.descricao}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        descricao: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Categoria *</Label>

                    <Select
                      value={form.categoria}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          categoria: v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {CATEGORIAS_DESPESA.map((c) => (
                          <SelectItem
                            key={c}
                            value={c}
                          >
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isSalario(form.categoria) && (
                    <div className="space-y-1.5">
                      <Label>
                        Recebedor do salário *
                      </Label>

                      <Input
                        value={
                          form.recebedor_salario
                        }
                        onChange={(e) =>
                          setForm({
                            ...form,
                            recebedor_salario:
                              e.target.value,
                          })
                        }
                        placeholder="Nome do recebedor"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Valor (R$) *</Label>

                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.valor}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          valor: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Data *</Label>

                    <Input
                      type="date"
                      value={form.data_despesa}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          data_despesa:
                            e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Responsável</Label>

                    <Input
                      value={
                        form.responsavel_pagamento
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          responsavel_pagamento:
                            e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>

                <Button
                  onClick={handleSaveExpense}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90"
                >
                  {saving
                    ? "Salvando..."
                    : "Salvar Despesa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <RegisterPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        onSaved={() =>
          qc.invalidateQueries({
            queryKey: ["fin-payments"],
          })
        }
      />

      <Card className="border-0 bg-gradient-to-r from-primary to-[oklch(0.53_0.22_260)] text-primary-foreground">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium opacity-90">
            Total a Receber
          </CardTitle>

          <Wallet className="h-5 w-5 opacity-90" />
        </CardHeader>

        <CardContent>
          <div className="text-2xl font-bold sm:text-4xl">
            {loadingDocsFin
              ? "—"
              : formatBRL(totalReceber)}
          </div>

          <p className="mt-1 text-xs opacity-80">
            Saldo devedor consolidado em todos os processos
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
        <HeroCard
          title="Total de Entradas"
          value={formatBRL(totalEntradas)}
          icon={
            <TrendingUp className="h-5 w-5" />
          }
          tone="up"
          onClick={() => setRelatorio("entradas")}
        />

        <HeroCard
          title="Total de Saídas"
          value={formatBRL(totalSaidas)}
          icon={
            <TrendingDown className="h-5 w-5" />
          }
          tone="down"
          onClick={() => setRelatorio("saidas")}
        />

        <HeroCard
          title="Saldo do Mês"
          value={formatBRL(saldo)}
          icon={
            <Wallet className="h-5 w-5" />
          }
          tone={saldo >= 0 ? "up" : "down"}
          onClick={() => setRelatorio("saldo")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>
              Ranking de Clientes (mês)
            </CardTitle>
          </CardHeader>

          <CardContent className="h-72 px-2 sm:px-6">
            {rankingClientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem pagamentos neste mês.
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={rankingClientes}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                  />

                  <XAxis
                    type="number"
                    tickFormatter={(v) =>
                      formatBRL(v)
                    }
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                  />

                  <YAxis
                    type="category"
                    dataKey="cliente"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    width={80}
                  />

                  <Tooltip
                    formatter={(v: number) =>
                      formatBRL(v)
                    }
                    contentStyle={{
                      background: "var(--card)",
                      border:
                        "1px solid var(--border)",
                    }}
                  />

                  <Bar
                    dataKey="total"
                    fill="var(--primary)"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Fluxo de Caixa (mês)
            </CardTitle>
          </CardHeader>

          <CardContent className="h-72 px-2 sm:px-6">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart data={fluxoCaixa}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />

                <XAxis
                  dataKey="dia"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />

                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) =>
                    formatBRL(v)
                  }
                />

                <Tooltip
                  formatter={(v: number) =>
                    formatBRL(v)
                  }
                  contentStyle={{
                    background: "var(--card)",
                    border:
                      "1px solid var(--border)",
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="saldo"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>
            Registros Financeiros
          </CardTitle>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              placeholder="Buscar por nome"
              value={busca}
              onChange={(e) =>
                setBusca(e.target.value)
              }
              className="sm:col-span-2 lg:col-span-1"
            />

            <Select
              value={filtroTipo}
              onValueChange={setFiltroTipo}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="Todos">
                  Todos os tipos
                </SelectItem>
                <SelectItem value="Entrada">
                  Entrada
                </SelectItem>
                <SelectItem value="Saída">
                  Saída
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filtroStatus}
              onValueChange={setFiltroStatus}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="Todos">
                  Todos os status
                </SelectItem>
                <SelectItem value="Recebido">
                  Recebido
                </SelectItem>
                <SelectItem value="Pago">
                  Pago
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Data inicial
              </Label>

              <Input
                type="date"
                value={dataDe}
                onChange={(e) =>
                  setDataDe(e.target.value)
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Data final
              </Label>

              <Input
                type="date"
                value={dataAte}
                onChange={(e) =>
                  setDataAte(e.target.value)
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Valor mínimo (R$)
              </Label>

              <Input
                type="number"
                min="0"
                step="0.01"
                value={valorMin}
                onChange={(e) =>
                  setValorMin(e.target.value)
                }
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Total Recebido
              </p>

              <p className="font-mono text-lg font-bold text-accent">
                {formatBRL(totalRecebidoFiltrado)}
              </p>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Total Pago
              </p>

              <p className="font-mono text-lg font-bold text-destructive">
                {formatBRL(totalPagoFiltrado)}
              </p>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Total Geral
              </p>

              <p
                className={`font-mono text-lg font-bold ${
                  totalGeralFiltrado >= 0
                    ? "text-accent"
                    : "text-destructive"
                }`}
              >
                {formatBRL(totalGeralFiltrado)}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="divide-y md:hidden">
            {registrosFiltrados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum registro encontrado.
              </p>
            ) : (
              registrosPagina.map((r) => (
                <div
                  key={`${r.kind}-${r.id}`}
                  className="space-y-2 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-semibold text-foreground">
                      {r.nome}
                    </span>

                    <Badge
                      variant="outline"
                      className="shrink-0"
                    >
                      {r.tipo}
                    </Badge>
                  </div>

                  <p className="break-words text-xs text-muted-foreground">
                    {processoLabel(
                      r.numero_processo,
                    )}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {format(
                      new Date(`${r.data}T00:00:00`),
                      "dd/MM/yyyy",
                    )}{" "}
                    · {r.status}
                  </p>

                  <p
                    className={`font-mono text-base font-bold ${
                      r.kind === "entrada"
                        ? "text-accent"
                        : "text-destructive"
                    }`}
                  >
                    {formatBRL(r.valor)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => setFicha(r)}
                    >
                      <FileText className="mr-1 h-4 w-4" />
                      Ficha
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      disabled={imprimindo === r.id}
                      onClick={() =>
                        void imprimirRegistro(r)
                      }
                    >
                      <Printer className="mr-1 h-4 w-4" />
                      {imprimindo === r.id
                        ? "Gerando..."
                        : "Imprimir"}
                    </Button>

                    {perms.canAccessFinance && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-10"
                          onClick={() =>
                            abrirEdicao(r)
                          }
                        >
                          <Pencil className="mr-1 h-4 w-4" />
                          Editar
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-10"
                          onClick={() =>
                            setExcluindo(r)
                          }
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Excluir
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>
                    Número do Processo
                  </TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">
                    Valor
                  </TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {registrosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  registrosPagina.map((r) => (
                    <TableRow
                      key={`${r.kind}-${r.id}`}
                    >
                      <TableCell className="font-medium">
                        {r.nome}
                      </TableCell>

                      <TableCell className="text-xs">
                        {processoLabel(
                          r.numero_processo,
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline">
                          {r.tipo}
                        </Badge>
                      </TableCell>

                      <TableCell
                        className={`text-right font-mono font-semibold ${
                          r.kind === "entrada"
                            ? "text-accent"
                            : "text-destructive"
                        }`}
                      >
                        {formatBRL(r.valor)}
                      </TableCell>

                      <TableCell className="text-xs">
                        {format(
                          new Date(`${r.data}T00:00:00`),
                          "dd/MM/yyyy",
                        )}
                      </TableCell>

                      <TableCell className="text-xs">
                        {r.status}
                      </TableCell>

                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Ver ficha"
                          onClick={() => setFicha(r)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>

                        {perms.canAccessFinance && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Editar"
                            onClick={() =>
                              abrirEdicao(r)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}

                        {perms.canAccessFinance && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Excluir"
                            onClick={() =>
                              setExcluindo(r)
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}

                        <Button
                          size="icon"
                          variant="ghost"
                          title="Imprimir"
                          disabled={imprimindo === r.id}
                          onClick={() =>
                            void imprimirRegistro(r)
                          }
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {registrosFiltrados.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t p-4 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                Mostrando{" "}
                {(paginaAtual - 1) * PAGE_SIZE + 1}–
                {Math.min(
                  paginaAtual * PAGE_SIZE,
                  registrosFiltrados.length,
                )}{" "}
                de {registrosFiltrados.length} registros
              </p>

              <div className="flex flex-wrap items-center justify-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={paginaAtual <= 1}
                  onClick={() => setPagina(paginaAtual - 1)}
                >
                  Anterior
                </Button>

                {totalPaginas <= 7 ? (
                  Array.from(
                    { length: totalPaginas },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={
                        n === paginaAtual
                          ? "default"
                          : "outline"
                      }
                      onClick={() => setPagina(n)}
                    >
                      {n}
                    </Button>
                  ))
                ) : (
                  <span className="px-2 text-xs text-muted-foreground">
                    Página {paginaAtual} de {totalPaginas}
                  </span>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPagina(paginaAtual + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FichaFinanceiraDialog
        registro={ficha}
        onClose={() => setFicha(null)}
      />

      <RelatorioDialog
        tipo={relatorio}
        onClose={() => setRelatorio(null)}
        payments={payments ?? []}
        expenses={expenses ?? []}
        monthPayments={monthPayments}
        monthExpenses={monthExpenses}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />

      <AlertDialog
        open={!!excluindo}
        onOpenChange={(o) =>
          !o && setExcluindo(null)
        }
      >
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar exclusão
            </AlertDialogTitle>

            <AlertDialogDescription>
              Tem certeza de que deseja excluir este
              registro financeiro?
              {excluindo
                ? ` (${excluindo.nome} — ${formatBRL(
                    excluindo.valor,
                  )})`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancelar
            </AlertDialogCancel>

            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmarExclusao();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPaymentDialog
        payment={editPayment}
        onClose={() => setEditPayment(null)}
        onSaved={() =>
          qc.invalidateQueries({
            queryKey: ["fin-payments"],
          })
        }
      />

      <EditExpenseDialog
        expense={editExpense}
        onClose={() => setEditExpense(null)}
        onSaved={() =>
          qc.invalidateQueries({
            queryKey: ["fin-expenses"],
          })
        }
      />
    </div>
  );
}

function EditPaymentDialog({
  payment,
  onClose,
  onSaved,
}: {
  payment: PaymentWithDoc | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    valor: "",
    data_pagamento: "",
    responsavel_recebimento: "",
    metodo_pagamento: "PIX",
    descricao: "",
  });

  const [loadedId, setLoadedId] =
    useState<string | null>(null);

  if (payment && payment.id !== loadedId) {
    setLoadedId(payment.id);

    setForm({
      valor: String(payment.valor ?? ""),
      data_pagamento: payment.data_pagamento,
      responsavel_recebimento:
        payment.responsavel_recebimento ?? "",
      metodo_pagamento:
        payment.metodo_pagamento ?? "PIX",
      descricao: payment.descricao ?? "",
    });
  }

  async function handleSave() {
    if (!payment) return;

    const valor = Number(form.valor);

    if (!valor || valor <= 0) {
      return toast.error("Valor inválido");
    }

    if (!form.responsavel_recebimento.trim()) {
      return toast.error(
        "Informe o responsável",
      );
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("payments")
        .update({
          valor,
          data_pagamento: form.data_pagamento,
          responsavel_recebimento:
            form.responsavel_recebimento.trim(),
          metodo_pagamento: form.metodo_pagamento,
          descricao:
            form.descricao.trim() || null,
        })
        .eq("id", payment.id);

      if (error) throw error;

      toast.success("Pagamento atualizado");

      onSaved();
      setLoadedId(null);
      onClose();
    } catch (e) {
      toast.error("Falha ao atualizar", {
        description:
          e instanceof Error ? e.message : "",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!payment}
      onOpenChange={(o) => {
        if (!o) {
          setLoadedId(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar Pagamento
          </DialogTitle>
        </DialogHeader>

        {payment && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">
                {payment.documents?.numero_processo ??
                  "—"}
              </p>

              <p className="text-xs text-muted-foreground">
                {payment.documents?.cliente ?? "—"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>

                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      valor: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Data *</Label>

                <Input
                  type="date"
                  value={form.data_pagamento}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      data_pagamento:
                        e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Responsável *</Label>

                <Input
                  value={
                    form.responsavel_recebimento
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      responsavel_recebimento:
                        e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Método *</Label>

                <Select
                  value={form.metodo_pagamento}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      metodo_pagamento: v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {METODOS_PAGAMENTO.map((m) => (
                      <SelectItem
                        key={m}
                        value={m}
                      >
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descrição</Label>

                <Input
                  value={form.descricao}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      descricao: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setLoadedId(null);
              onClose();
            }}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            {saving
              ? "Salvando..."
              : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditExpenseDialog({
  expense,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] =
    useState<string | null>(null);

  const [form, setForm] = useState({
    descricao: "",
    categoria: "Outros",
    valor: "",
    data_despesa: "",
    responsavel_pagamento: "",
    recebedor_salario: "",
  });

  if (expense && expense.id !== loadedId) {
    setLoadedId(expense.id);

    setForm({
      descricao: expense.descricao ?? "",
      categoria: expense.categoria ?? "Outros",
      valor: String(expense.valor ?? ""),
      data_despesa: expense.data_despesa,
      responsavel_pagamento:
        expense.responsavel_pagamento ?? "",
      recebedor_salario:
        expense.recebedor_salario ?? "",
    });
  }

  async function handleSave() {
    if (!expense) return;

    if (!form.descricao.trim()) {
      return toast.error(
        "Informe a descrição",
      );
    }

    const valor = Number(form.valor);

    if (!valor || valor <= 0) {
      return toast.error("Valor inválido");
    }

    if (
      isSalario(form.categoria) &&
      !form.recebedor_salario.trim()
    ) {
      return toast.error(
        "Informe o nome do recebedor do salário.",
      );
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("expenses")
        .update({
          descricao: form.descricao.trim(),
          categoria: form.categoria,
          valor,
          data_despesa: form.data_despesa,
          responsavel_pagamento:
            form.responsavel_pagamento.trim() ||
            null,
          recebedor_salario:
            form.recebedor_salario.trim() || null,
        })
        .eq("id", expense.id);

      if (error) throw error;

      toast.success("Despesa atualizada");

      onSaved();
      setLoadedId(null);
      onClose();
    } catch (e) {
      toast.error("Falha ao atualizar", {
        description:
          e instanceof Error ? e.message : "",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!expense}
      onOpenChange={(o) => {
        if (!o) {
          setLoadedId(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar Despesa
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Descrição *</Label>

            <Input
              value={form.descricao}
              onChange={(e) =>
                setForm({
                  ...form,
                  descricao: e.target.value,
                })
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria *</Label>

              <Select
                value={form.categoria}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    categoria: v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {CATEGORIAS_DESPESA.map((c) => (
                    <SelectItem
                      key={c}
                      value={c}
                    >
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isSalario(form.categoria) && (
              <div className="space-y-1.5">
                <Label>
                  Recebedor do salário *
                </Label>

                <Input
                  value={
                    form.recebedor_salario
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      recebedor_salario:
                        e.target.value,
                    })
                  }
                  placeholder="Nome do recebedor"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>

              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.valor}
                onChange={(e) =>
                  setForm({
                    ...form,
                    valor: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Data *</Label>

              <Input
                type="date"
                value={form.data_despesa}
                onChange={(e) =>
                  setForm({
                    ...form,
                    data_despesa:
                      e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Responsável</Label>

              <Input
                value={
                  form.responsavel_pagamento
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    responsavel_pagamento:
                      e.target.value,
                  })
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setLoadedId(null);
              onClose();
            }}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            {saving
              ? "Salvando..."
              : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeroCard({
  title,
  value,
  icon,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: "up" | "down";
  onClick?: () => void;
}) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative overflow-hidden border-primary/30 bg-gradient-to-br from-indigo-600/20 via-card to-blue-600/10 ${
        onClick
          ? "cursor-pointer transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          : ""
      }`}
      title={onClick ? "Clique para ver o relatório" : undefined}
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between text-muted-foreground">
          <p className="text-sm font-medium">
            {title}
          </p>

          <span
            className={
              tone === "up"
                ? "text-accent"
                : "text-destructive"
            }
          >
            {icon}
          </span>
        </div>

        <p
          className={`mt-2 font-mono text-3xl font-bold ${
            tone === "up"
              ? "text-accent"
              : "text-destructive"
          }`}
        >
          {value}
        </p>

        {onClick && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Clique para ver o relatório
          </p>
        )}
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
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] =
    useState<ProcessOption | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    valor: "",
    data_pagamento: new Date()
      .toISOString()
      .slice(0, 10),
    responsavel_recebimento: "",
    metodo_pagamento: "PIX",
    descricao: "",
  });

  const { data: results } = useQuery({
    queryKey: ["proc-search", query],
    enabled:
      open &&
      query.trim().length >= 2 &&
      !selected,

    queryFn: async () => {
      const q = `%${query.trim()}%`;

      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, numero_processo, cliente, valor_total_processo, valor_recebido_total",
        )
        .or(
          `numero_processo.ilike.${q},cliente.ilike.${q}`,
        )
        .limit(8);

      if (error) throw error;

      return (data ?? []) as ProcessOption[];
    },
  });

  function reset() {
    setQuery("");
    setSelected(null);

    setForm({
      valor: "",
      data_pagamento: new Date()
        .toISOString()
        .slice(0, 10),
      responsavel_recebimento: "",
      metodo_pagamento: "PIX",
      descricao: "",
    });
  }

  async function handleSave() {
    if (!selected) {
      return toast.error(
        "Selecione um processo",
      );
    }

    const valor = Number(form.valor);

    if (!valor || valor <= 0) {
      return toast.error("Valor inválido");
    }

    if (!form.responsavel_recebimento.trim()) {
      return toast.error(
        "Informe o responsável",
      );
    }

    const total = Number(
      selected.valor_total_processo ?? 0,
    );

    const recebido = Number(
      selected.valor_recebido_total ?? 0,
    );

    if (
      total > 0 &&
      recebido + valor > total
    ) {
      return toast.error(
        "Valor excede o saldo devedor",
        {
          description: `Saldo restante: ${formatBRL(
            total - recebido,
          )}`,
        },
      );
    }

    setSaving(true);

    try {
      const { data: u } =
        await supabase.auth.getUser();

      const { error } = await supabase
        .from("payments")
        .insert({
          document_id: selected.id,
          valor,
          data_pagamento:
            form.data_pagamento,
          responsavel_recebimento:
            form.responsavel_recebimento.trim(),
          metodo_pagamento:
            form.metodo_pagamento,
          descricao:
            form.descricao.trim() || null,
          created_by: u.user?.id,
        });

      if (error) throw error;

      toast.success(
        "Pagamento registrado",
      );

      onSaved();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        "Falha ao registrar pagamento",
        {
          description:
            e instanceof Error ? e.message : "",
        },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);

        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Registrar Entrada (Pagamento)
          </DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                Buscar processo *
              </Label>

              <Input
                autoFocus
                placeholder="Nº do processo ou nome do cliente..."
                value={query}
                onChange={(e) =>
                  setQuery(e.target.value)
                }
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border">
              {query.trim().length < 2 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  Digite ao menos 2 caracteres
                  para buscar.
                </p>
              ) : (results ?? []).length ===
                0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  Nenhum processo encontrado.
                </p>
              ) : (
                <ul>
                  {(results ?? []).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelected(r)
                        }
                        className="flex w-full items-center justify-between border-b p-3 text-left text-sm last:border-none hover:bg-muted/40"
                      >
                        <div>
                          <p className="font-medium">
                            {r.numero_processo}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            {r.cliente}
                          </p>
                        </div>

                        <span className="font-mono text-xs text-muted-foreground">
                          {formatBRL(
                            Number(
                              r.valor_recebido_total ??
                                0,
                            ),
                          )}{" "}
                          /{" "}
                          {formatBRL(
                            Number(
                              r.valor_total_processo ??
                                0,
                            ),
                          )}
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
                  <p className="font-medium">
                    {selected.numero_processo}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {selected.cliente}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(null)
                  }
                >
                  Trocar
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>

                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      valor: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Data *</Label>

                <Input
                  type="date"
                  value={form.data_pagamento}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      data_pagamento:
                        e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>
                  Responsável *
                </Label>

                <Input
                  value={
                    form.responsavel_recebimento
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      responsavel_recebimento:
                        e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Método *</Label>

                <Select
                  value={form.metodo_pagamento}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      metodo_pagamento: v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {METODOS_PAGAMENTO.map(
                      (m) => (
                        <SelectItem
                          key={m}
                          value={m}
                        >
                          {m}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descrição</Label>

                <Input
                  value={form.descricao}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      descricao: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving || !selected}
            className="bg-primary hover:bg-primary/90"
          >
            {saving
              ? "Salvando..."
              : "Salvar Pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FichaFinanceiraDialog({
  registro,
  onClose,
}: {
  registro: RegistroFinanceiro | null;
  onClose: () => void;
}) {
  const { data: docs } = useQuery({
    queryKey: [
      "ficha-docs",
      registro?.id,
      registro?.numero_processo,
    ],

    enabled:
      !!registro &&
      registro.kind === "entrada",

    queryFn: async () => {
      if (!registro) return [];

      const processo = (
        registro.numero_processo ?? ""
      ).trim();

      if (processo) {
        const { data } = await supabase
          .from("documents")
          .select(
            "id, internal_id, tipo_documento, file_name, data_documento",
          )
          .eq(
            "numero_processo",
            processo,
          )
          .order("created_at", {
            ascending: true,
          });

        if ((data ?? []).length) {
          return data ?? [];
        }
      }

      if (!registro.document_id) {
        return [];
      }

      const { data } = await supabase
        .from("documents")
        .select(
          "id, internal_id, tipo_documento, file_name, data_documento",
        )
        .eq(
          "id",
          registro.document_id,
        );

      return data ?? [];
    },
  });

  return (
    <Dialog
      open={!!registro}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Ficha Financeira
          </DialogTitle>
        </DialogHeader>

        {registro && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">
                  Nome:
                </span>{" "}
                {registro.nome}
              </p>

              <p>
                <span className="text-muted-foreground">
                  Número do Processo:
                </span>{" "}
                {processoLabel(
                  registro.numero_processo,
                )}
              </p>

              <p>
                <span className="text-muted-foreground">
                  Tipo:
                </span>{" "}
                {registro.tipo}
              </p>

              <p>
                <span className="text-muted-foreground">
                  Status:
                </span>{" "}
                {registro.status}
              </p>

              <p>
                <span className="text-muted-foreground">
                  Data:
                </span>{" "}
                {format(
                  new Date(
                    `${registro.data}T00:00:00`,
                  ),
                  "dd/MM/yyyy",
                )}
              </p>

              <p>
                <span className="text-muted-foreground">
                  Valor:
                </span>{" "}
                <span
                  className={`font-mono font-semibold ${
                    registro.kind === "entrada"
                      ? "text-accent"
                      : "text-destructive"
                  }`}
                >
                  {formatBRL(
                    registro.valor,
                  )}
                </span>
              </p>
            </div>

            {registro.kind === "entrada" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">
                    Método de pagamento:
                  </span>{" "}
                  {registro.metodo_pagamento ||
                    "—"}
                </p>

                <p>
                  <span className="text-muted-foreground">
                    Responsável pelo recebimento:
                  </span>{" "}
                  {registro.responsavel_recebimento ||
                    "—"}
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">
                    Categoria:
                  </span>{" "}
                  {registro.categoria || "—"}
                </p>

                <p>
                  <span className="text-muted-foreground">
                    Responsável pelo pagamento:
                  </span>{" "}
                  {registro.responsavel_pagamento ||
                    "—"}
                </p>

                <p>
                  <span className="text-muted-foreground">
                    Recebedor do salário:
                  </span>{" "}
                  {registro.recebedor_salario ||
                    "—"}
                </p>
              </div>
            )}

            <p className="break-words">
              <span className="text-muted-foreground">
                Observação:
              </span>{" "}
              {registro.observacao || "—"}
            </p>

            {registro.kind === "entrada" && (
              <div className="space-y-1">
                <p className="font-medium">
                  Documentos vinculados
                </p>

                {(docs ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum documento vinculado.
                  </p>
                ) : (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {(docs ?? []).map((d) => (
                      <li
                        key={d.id}
                        className="break-words"
                      >
                        {d.tipo_documento} —{" "}
                        {d.file_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
