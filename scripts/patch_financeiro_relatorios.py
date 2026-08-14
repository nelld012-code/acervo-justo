from pathlib import Path

path = Path("src/routes/_authenticated/financeiro.tsx")
source = path.read_text(encoding="utf-8")

old_invocation = '''      <RelatorioDialog
        tipo={relatorio}
        onClose={() => setRelatorio(null)}
        payments={payments ?? []}
        expenses={expenses ?? []}
        monthPayments={monthPayments}
        monthExpenses={monthExpenses}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />'''

new_invocation = '''      <RelatorioDialog
        tipo={relatorio}
        onClose={() => setRelatorio(null)}
        payments={payments ?? []}
        expenses={expenses ?? []}
        monthPayments={monthPayments}
        monthExpenses={monthExpenses}
        monthStart={monthStart}
        monthEnd={monthEnd}
        onEdit={abrirEdicao}
        onDelete={setExcluindo}
        onPrint={imprimirRegistro}
      />'''

if old_invocation not in source:
    raise SystemExit("Invocation block not found; refusing to modify file")
source = source.replace(old_invocation, new_invocation, 1)

start = source.index("function RelatorioDialog({")
end = source.index("function FichaFinanceiraDialog({", start)

replacement = '''function RelatorioDialog({
  tipo,
  onClose,
  payments,
  expenses,
  monthPayments,
  monthExpenses,
  monthStart,
  monthEnd,
  onEdit,
  onDelete,
  onPrint,
}: {
  tipo: "entradas" | "saidas" | "saldo" | null;
  onClose: () => void;
  payments: PaymentWithDoc[];
  expenses: Expense[];
  monthPayments: PaymentWithDoc[];
  monthExpenses: Expense[];
  monthStart: string;
  monthEnd: string;
  onEdit: (registro: RegistroFinanceiro) => void;
  onDelete: (registro: RegistroFinanceiro) => void;
  onPrint: (registro: RegistroFinanceiro) => void;
}) {
  const [busca, setBusca] = useState("");

  useEffect(() => {
    setBusca("");
  }, [tipo]);

  if (!tipo) return null;

  const entradas: RegistroFinanceiro[] = payments.map((p) => ({
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
    responsavel_recebimento: p.responsavel_recebimento ?? null,
  }));

  const saidas: RegistroFinanceiro[] = expenses.map((e) => ({
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
    responsavel_pagamento: e.responsavel_pagamento ?? null,
    recebedor_salario: e.recebedor_salario ?? null,
  }));

  const monthRecords = [
    ...monthPayments.map((p) => entradas.find((r) => r.id === p.id)).filter(Boolean),
    ...monthExpenses.map((e) => saidas.find((r) => r.id === e.id)).filter(Boolean),
  ] as RegistroFinanceiro[];

  const base = tipo === "entradas" ? entradas : tipo === "saidas" ? saidas : monthRecords;
  const termo = busca.trim().toLowerCase();
  const linhas = base.filter((r) => {
    if (!termo) return true;
    const hay = [
      r.nome, r.numero_processo ?? "", r.tipo, r.status,
      r.observacao ?? "", r.responsavel_recebimento ?? "",
      r.responsavel_pagamento ?? "", r.metodo_pagamento ?? "",
      r.categoria ?? "", r.recebedor_salario ?? "",
    ].join(" ").toLowerCase();
    return hay.includes(termo);
  }).sort((a, b) => b.data.localeCompare(a.data));

  const totalEntradas = linhas.filter((r) => r.kind === "entrada").reduce((s, r) => s + r.valor, 0);
  const totalSaidas = linhas.filter((r) => r.kind === "saida").reduce((s, r) => s + r.valor, 0);
  const total = tipo === "saldo" ? totalEntradas - totalSaidas : tipo === "entradas" ? totalEntradas : totalSaidas;
  const titulo = tipo === "entradas" ? "Relatório de Entradas" : tipo === "saidas" ? "Relatório de Saídas" : "Relatório do Saldo do Mês";
  const periodo = tipo === "saldo"
    ? `${format(new Date(`${monthStart}T00:00:00`), "dd/MM/yyyy")} a ${format(new Date(`${monthEnd}T00:00:00`), "dd/MM/yyyy")}`
    : "Todos os registros";

  function imprimirRelatorio() {
    const ok = printReport({
      title: titulo,
      subtitle: periodo,
      summary: [
        { label: "Registros", value: String(linhas.length) },
        { label: tipo === "saldo" ? "Saldo" : "Total", value: formatBRL(total) },
      ],
      columns: ["Data", "Tipo", "Nome / Descrição", "Status", "Valor"],
      rows: linhas.map((r) => [
        format(new Date(`${r.data}T00:00:00`), "dd/MM/yyyy"),
        r.tipo,
        r.nome,
        r.status,
        formatBRL(r.valor),
      ]),
    });
    if (!ok) toast.error("Não foi possível abrir a impressão");
  }

  return (
    <Dialog open={Boolean(tipo)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no relatório..." className="w-full sm:max-w-md" />
            <Button variant="outline" className="w-full sm:w-auto" onClick={imprimirRelatorio}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir relatório
            </Button>
          </div>
          <div className="rounded-lg border border-border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Nome / Descrição</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</TableCell></TableRow>
                  ) : linhas.map((r) => (
                    <TableRow key={`${r.kind}-${r.id}`}>
                      <TableCell className="whitespace-nowrap">{format(new Date(`${r.data}T00:00:00`), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{r.tipo}</TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="font-medium">{r.nome}</div>
                        {r.numero_processo && <div className="text-xs text-muted-foreground">{r.numero_processo}</div>}
                      </TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium">{formatBRL(r.valor)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="icon" title="Editar" aria-label="Editar" onClick={() => onEdit(r)}><Pencil className="h-4 w-4" /></Button>
                          <Button type="button" variant="outline" size="icon" title="Excluir" aria-label="Excluir" onClick={() => onDelete(r)}><Trash2 className="h-4 w-4" /></Button>
                          <Button type="button" variant="outline" size="icon" title="Imprimir" aria-label="Imprimir" onClick={() => onPrint(r)}><Printer className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">{linhas.length} registro(s)</span>
            <span className="font-semibold">{tipo === "saldo" ? "Saldo do mês" : tipo === "entradas" ? "Total de entradas" : "Total de saídas"}: {formatBRL(total)}</span>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'''

source = source[:start] + replacement + source[end:]
path.write_text(source, encoding="utf-8")
print("financeiro.tsx patched")
