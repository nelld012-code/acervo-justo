import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatBRL } from "@/lib/documents";
import { format } from "date-fns";

export type ReceiptData = {
  numero_processo: string;
  cliente: string;
  data_pagamento: string;
  valor: number;
  metodo_pagamento: string;
  responsavel_recebimento: string;
  descricao?: string | null;
};

export function ReceiptModal({ data, open, onOpenChange }: { data: ReceiptData | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!data) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="no-print">
          <DialogTitle>Recibo de Pagamento</DialogTitle>
        </DialogHeader>

        <div className="print-area space-y-6 rounded-md border bg-card p-6 text-card-foreground">
          <header className="border-b pb-4 text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Sistema de Gestão Judicial</p>
            <h2 className="mt-1 text-2xl font-bold">RECIBO DE PAGAMENTO</h2>
          </header>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Número do Processo" value={data.numero_processo} />
            <Field label="Cliente" value={data.cliente} />
            <Field label="Data do Pagamento" value={format(new Date(data.data_pagamento), "dd/MM/yyyy")} />
            <Field label="Forma de Pagamento" value={data.metodo_pagamento} />
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Valor Recebido</p>
              <p className="text-3xl font-bold">{formatBRL(data.valor)}</p>
            </div>
            {data.descricao ? (
              <div className="col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Descrição</p>
                <p>{data.descricao}</p>
              </div>
            ) : null}
          </div>

          <p className="pt-4 text-sm">
            Declaro para os devidos fins que recebi a importância de{" "}
            <strong>{formatBRL(data.valor)}</strong>, referente ao processo nº{" "}
            <strong>{data.numero_processo}</strong>, pago pelo(a) cliente{" "}
            <strong>{data.cliente}</strong> na data de{" "}
            <strong>{format(new Date(data.data_pagamento), "dd/MM/yyyy")}</strong>.
          </p>

          <div className="grid grid-cols-1 gap-10 pt-10 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="border-t pt-2 text-center text-sm">
                <strong>{data.responsavel_recebimento}</strong>
              </p>
              <p className="text-center text-xs text-muted-foreground">Recebi(emos) o valor acima descrito</p>
            </div>
            <div className="space-y-1">
              <p className="border-t pt-2 text-center text-sm">
                <strong>{data.cliente}</strong>
              </p>
              <p className="text-center text-xs text-muted-foreground">Paguei(amos) o valor acima descrito</p>
            </div>
          </div>

          <p className="pt-6 text-center text-xs text-muted-foreground">
            Emitido em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
          </p>
        </div>

        <div className="flex justify-end gap-2 no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => window.print()} className="bg-primary hover:bg-primary/90">
            <Printer className="mr-2 h-4 w-4" />Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}