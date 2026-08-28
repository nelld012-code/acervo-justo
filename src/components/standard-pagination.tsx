import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type StandardPaginationProps = { current: number; total: number; totalItems: number; pageSize?: number; onChange: (page: number) => void; label?: string };

export function StandardPagination({ current, total, totalItems, pageSize = 8, onChange, label = "registros" }: StandardPaginationProps) {
  if (totalItems <= 0) return null;
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(Math.max(1, current), safeTotal);
  const start = (safeCurrent - 1) * pageSize + 1;
  const end = Math.min(safeCurrent * pageSize, totalItems);
  const pages = safeTotal <= 7
    ? Array.from({ length: safeTotal }, (_, i) => i + 1)
    : [1, ...(safeCurrent > 3 ? ["ellipsis-start"] : []), ...Array.from(new Set([safeCurrent - 1, safeCurrent, safeCurrent + 1].filter((n) => n > 1 && n < safeTotal))), ...(safeCurrent < safeTotal - 2 ? ["ellipsis-end"] : []), safeTotal];
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t p-4 sm:flex-row">
      <p className="text-xs text-muted-foreground">Mostrando {start}–{end} de {totalItems} {label}</p>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button size="sm" variant="outline" disabled={safeCurrent <= 1} onClick={() => onChange(safeCurrent - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button>
        {pages.map((page, index) => typeof page === "number" ? <Button key={page} size="sm" variant={page === safeCurrent ? "default" : "outline"} onClick={() => onChange(page)} aria-current={page === safeCurrent ? "page" : undefined}>{page}</Button> : <span key={page + String(index)} className="px-1 text-xs text-muted-foreground">…</span>)}
        <Button size="sm" variant="outline" disabled={safeCurrent >= safeTotal} onClick={() => onChange(safeCurrent + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </div>
  );
}
