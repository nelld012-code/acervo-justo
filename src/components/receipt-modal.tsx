import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatBRL } from "@/lib/documents";
import { format } from "date-fns";
import { printReceipt } from "@/lib/print-receipt";
import { toast } from "sonner";

export type ReceiptData = {
  numero_processo: string;
  cliente: string;
  data_pagamento: string;
  valor: number;
  metodo_pagamento: string;
  responsavel_recebimento: string;
  descricao?: string | null;
};

function ReceiptBody({ data, via }: { data: ReceiptData; via: string }) {
  const emitido = format(new Date(), "dd/MM/yyyy 'às' HH:mm");
  return (
    <div className="receipt-copy space-y-5 rounded-md border bg-card p-6 text-card-foreground">
      <header className="border-b pb-3 text-center">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sistema de Gestão Judicial</p>
        <h2 className="mt-1 text-xl font-bold">RECIBO DE PAGAMENTO</h2>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{via}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Número do Processo" value={data.numero_processo} />
        <Field label="Cliente" value={data.cliente} />
        <Field label="Data do Pagamento" value={format(new Date(data.data_pagamento), "dd/MM/yyyy")} />
        <Field label="Forma de Pagamento" value={data.metodo_pagamento} />
        <div className="col-span-2">
          <p className="text-xs font-medium text-muted-foreground">Valor Recebido</p>
          <p className="text-2xl font-bold">{formatBRL(data.valor)}</p>
        </div>
        {data.descricao ? (
          <div className="col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Descrição</p>
            <p>{data.descricao}</p>
          </div>
        ) : null}
      </div>

      <p className="text-sm">
        Declaro para os devidos fins que recebi a importância de{" "}
        <strong>{formatBRL(data.valor)}</strong>, referente ao processo nº{" "}
        <strong>{data.numero_processo}</strong>, pago pelo(a) cliente{" "}
        <strong>{data.cliente}</strong> na data de{" "}
        <strong>{format(new Date(data.data_pagamento), "dd/MM/yyyy")}</strong>.
      </p>

      <div className="grid grid-cols-2 gap-8 pt-8">
        <div className="space-y-1">
          <p className="border-t pt-2 text-center text-sm">
            <strong>{data.responsavel_recebimento}</strong>
          </p>
          <p className="text-center text-[10px] text-muted-foreground">Recebi(emos) o valor acima descrito</p>
        </div>
        <div className="space-y-1">
          <p className="border-t pt-2 text-center text-sm">
            <strong>{data.cliente}</strong>
          </p>
          <p className="text-center text-[10px] text-muted-foreground">Paguei(amos) o valor acima descrito</p>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground">Emitido em {emitido}</p>
    </div>
  );
}

export function ReceiptModal({ data, open, onOpenChange }: { data: ReceiptData | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!data) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader className="no-print">
          <DialogTitle>Recibo de Pagamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <ReceiptBody data={data} via="1ª via — Escritório" />
        </div>

        <div className="flex flex-col-reverse gap-2 no-print sm:flex-row sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            className="w-full bg-primary hover:bg-primary/90 sm:w-auto"
            onClick={() => {
              if (!printReceipt(data)) toast.error("Não foi possível abrir a impressão");
            }}
          >
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