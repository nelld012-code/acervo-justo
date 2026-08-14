from pathlib import Path
import subprocess

PATH = "src/routes/_authenticated/financeiro.tsx"
path = Path(PATH)
current = path.read_text(encoding="utf-8")

subprocess.run(["git", "fetch", "origin", "main", "--depth=1"], check=True)
main_source = subprocess.check_output(["git", "show", f"origin/main:{PATH}"], text=True)

start = main_source.index("function RelatorioDialog({")
end = main_source.index("function FichaFinanceiraDialog({", start)
func = main_source[start:end]

func = func.replace(
'''  monthEnd,\n}: {''',
'''  monthEnd,\n  onEdit,\n  onDelete,\n  onPrint,\n}: {''', 1)
func = func.replace(
'''  monthEnd: string;\n}) {''',
'''  monthEnd: string;\n  onEdit: (registro: RegistroFinanceiro) => void;\n  onDelete: (registro: RegistroFinanceiro) => void;\n  onPrint: (registro: RegistroFinanceiro) => void;\n}) {''', 1)

marker = '''  const total = linhasFiltradas.reduce((s, l) => s + l.valor, 0);\n'''
if marker not in func:
    raise SystemExit("Could not locate report total marker in main version")

actions_data = r'''  const registrosAcoes = useMemo<RegistroFinanceiro[]>(() => {
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
      nome: e.descricao,
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

    type Candidate = { registro: RegistroFinanceiro; extra: string };
    let candidates: Candidate[];

    if (tipo === "entradas") {
      candidates = payments.map((p, index) => ({
        registro: entradas[index],
        extra: [
          fmtData(p.data_pagamento),
          p.documents?.cliente ?? "—",
          processoLabel(p.documents?.numero_processo),
          p.metodo_pagamento ?? "—",
          p.responsavel_recebimento ?? "—",
          formatBRL(Number(p.valor)),
        ].join(" "),
      }));
    } else if (tipo === "saidas") {
      candidates = expenses.map((e, index) => ({
        registro: saidas[index],
        extra: [
          fmtData(e.data_despesa),
          e.descricao,
          e.categoria,
          e.responsavel_pagamento ?? "—",
          e.recebedor_salario ?? "—",
          formatBRL(Number(e.valor)),
        ].join(" "),
      }));
    } else {
      const movs = [
        ...monthPayments.map((p) => ({
          registro: entradas.find((r) => r.id === p.id)!,
          data: p.data_pagamento,
          signed: Number(p.valor),
          extraName: p.documents?.cliente ?? "—",
        })),
        ...monthExpenses.map((e) => ({
          registro: saidas.find((r) => r.id === e.id)!,
          data: e.data_despesa,
          signed: -Number(e.valor),
          extraName: e.descricao,
        })),
      ].sort((a, b) => a.data.localeCompare(b.data));

      let acc = 0;
      candidates = movs.map((m) => {
        acc += m.signed;
        return {
          registro: m.registro,
          extra: [
            fmtData(m.data),
            m.registro.tipo,
            m.extraName,
            formatBRL(Math.abs(m.signed)),
            formatBRL(acc),
          ].join(" "),
        };
      });
    }

    const termo = busca.trim().toLowerCase();
    if (termo) {
      candidates = candidates.filter((c) => c.extra.toLowerCase().includes(termo));
    }

    if (tipo === "saldo") {
      return candidates.map((c) => c.registro);
    }

    return candidates
      .sort((a, b) => b.registro.data.localeCompare(a.registro.data))
      .map((c) => c.registro);
  }, [tipo, payments, expenses, monthPayments, monthExpenses, busca]);

'''
func = func.replace(marker, actions_data + marker, 1)

mobile_marker = '''                ))}\n              </div>'''
mobile_actions = '''                ))}\n                {registrosAcoes[i] && (\n                  <div className="mt-2 flex justify-end gap-1 border-t pt-2">\n                    <Button type="button" variant="outline" size="icon" title="Editar" aria-label="Editar" onClick={() => onEdit(registrosAcoes[i])}>\n                      <Pencil className="h-4 w-4" />\n                    </Button>\n                    <Button type="button" variant="outline" size="icon" title="Excluir" aria-label="Excluir" onClick={() => onDelete(registrosAcoes[i])}>\n                      <Trash2 className="h-4 w-4" />\n                    </Button>\n                    <Button type="button" variant="outline" size="icon" title="Imprimir" aria-label="Imprimir" onClick={() => onPrint(registrosAcoes[i])}>\n                      <Printer className="h-4 w-4" />\n                    </Button>\n                  </div>\n                )}\n              </div>'''
if mobile_marker not in func:
    raise SystemExit("Could not locate mobile report row")
func = func.replace(mobile_marker, mobile_actions, 1)

desktop_head = '''                {config.colunas.map((c) => (\n                  <TableHead key={c}>{c}</TableHead>\n                ))}\n              </TableRow>'''
desktop_head_new = '''                {config.colunas.map((c) => (\n                  <TableHead key={c}>{c}</TableHead>\n                ))}\n                <TableHead className="text-right">Ações</TableHead>\n              </TableRow>'''
if desktop_head not in func:
    raise SystemExit("Could not locate desktop report header")
func = func.replace(desktop_head, desktop_head_new, 1)

desktop_body = '''                    {l.cols.map((c, ci) => (\n                      <TableCell key={ci} className="text-xs">\n                        {c}\n                      </TableCell>\n                    ))}\n                  </TableRow>'''
desktop_body_new = '''                    {l.cols.map((c, ci) => (\n                      <TableCell key={ci} className="text-xs">\n                        {c}\n                      </TableCell>\n                    ))}\n                    {registrosAcoes[i] && (\n                      <TableCell className="text-right">\n                        <div className="flex justify-end gap-1">\n                          <Button type="button" variant="outline" size="icon" title="Editar" aria-label="Editar" onClick={() => onEdit(registrosAcoes[i])}>\n                            <Pencil className="h-4 w-4" />\n                          </Button>\n                          <Button type="button" variant="outline" size="icon" title="Excluir" aria-label="Excluir" onClick={() => onDelete(registrosAcoes[i])}>\n                            <Trash2 className="h-4 w-4" />\n                          </Button>\n                          <Button type="button" variant="outline" size="icon" title="Imprimir" aria-label="Imprimir" onClick={() => onPrint(registrosAcoes[i])}>\n                            <Printer className="h-4 w-4" />\n                          </Button>\n                        </div>\n                      </TableCell>\n                    )}\n                  </TableRow>'''
if desktop_body not in func:
    raise SystemExit("Could not locate desktop report row")
func = func.replace(desktop_body, desktop_body_new, 1)

# Replace only the RelatorioDialog function in the current branch with the pristine main version + minimal action hooks.
current_start = current.index("function RelatorioDialog({")
current_end = current.index("function FichaFinanceiraDialog({", current_start)
current = current[:current_start] + func + current[current_end:]

# Keep the callbacks in the parent invocation. If absent, add them.
needle = '''        monthEnd={monthEnd}\n      />'''
with_callbacks = '''        monthEnd={monthEnd}\n        onEdit={abrirEdicao}\n        onDelete={setExcluindo}\n        onPrint={imprimirRegistro}\n      />'''
if needle in current and "onEdit={abrirEdicao}" not in current[current.index("<RelatorioDialog"):current.index("<AlertDialog", current.index("<RelatorioDialog"))]:
    current = current.replace(needle, with_callbacks, 1)

path.write_text(current, encoding="utf-8")
print("Restored original report and applied minimal actions patch")
