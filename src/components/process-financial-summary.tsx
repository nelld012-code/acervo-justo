import { formatBRL } from "@/lib/documents";

export type ProcessFinancialPayment = {
  id: string;
  valor: number | null;
};

export type ProcessFinancialSummaryProps = {
  valorTotalProcesso: number | null;
  pagamentos: ProcessFinancialPayment[];
};

export function ProcessFinancialSummary({ valorTotalProcesso, pagamentos }: ProcessFinancialSummaryProps) {
  const total = Number(valorTotalProcesso ?? 0);
  const recebido = pagamentos.reduce((sum, payment) => sum + Number(payment.valor ?? 0), 0);
  const saldo = Math.max(total - recebido, 0);

  return (
    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
      <div className="rounded-md border bg-background p-2">
        <p className="text-muted-foreground">Valor contratado</p>
        <p className="font-mono font-semibold">{formatBRL(total)}</p>
      </div>
      <div className="rounded-md border bg-background p-2">
        <p className="text-muted-foreground">Recebido</p>
        <p className="font-mono font-semibold text-accent">{formatBRL(recebido)}</p>
      </div>
      <div className="rounded-md border bg-background p-2">
        <p className="text-muted-foreground">Saldo a receber</p>
        <p className="font-mono font-semibold">{formatBRL(saldo)}</p>
      </div>
    </div>
  );
}
