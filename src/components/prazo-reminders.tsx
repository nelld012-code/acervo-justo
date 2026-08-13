import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  diasRestantes,
  prazoEmAlerta,
  processoOuTraco,
  textoDiasRestantes,
  type Prazo,
} from "@/lib/prazos-view";

const SNOOZE_MS = 30 * 60 * 1000;
const STORAGE_KEY = "prazos-snooze";

function readSnooze(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeSnooze(map: Record<string, number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* armazenamento indisponível */
  }
}

/** Popup recorrente (a cada 30 minutos) dos prazos que entraram na janela de lembrete. */
export function PrazoReminders() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  const [snooze, setSnooze] = useState<Record<string, number>>({});

  useEffect(() => {
    setSnooze(readSnooze());
  }, []);

  useEffect(() => {
    // Verificação periódica leve: apenas recalcula quais prazos devem aparecer.
    const i = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  const { data } = useQuery({
    queryKey: ["prazos-lembretes"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase
        .from("prazos")
        .select("*")
        .eq("lembrete_ativo", true)
        .eq("status", "Em andamento")
        .order("data_limite", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Prazo[];
    },
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  const atual = useMemo(() => {
    void tick;
    const agora = Date.now();
    return (data ?? []).find((p) => prazoEmAlerta(p) && (snooze[p.id] ?? 0) < agora) ?? null;
  }, [data, snooze, tick]);

  function adiar(id: string) {
    const next = { ...snooze, [id]: Date.now() + SNOOZE_MS };
    setSnooze(next);
    writeSnooze(next);
    toast.success("Lembrete adiado por 30 minutos.");
  }

  async function desativar(id: string) {
    const { error } = await supabase.from("prazos").update({ lembrete_ativo: false }).eq("id", id);
    if (error) {
      toast.error("Não foi possível desativar o lembrete.");
      return;
    }
    toast.success("Lembrete desativado.");
    void qc.invalidateQueries({ queryKey: ["prazos-lembretes"] });
    void qc.invalidateQueries({ queryKey: ["prazos"] });
  }

  if (!atual) return null;
  const dias = diasRestantes(atual.data_limite);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) adiar(atual.id); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>⚠️ Lembrete de Prazo</DialogTitle>
          <DialogDescription>{textoDiasRestantes(dias)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm text-foreground">
          <p><span className="text-muted-foreground">Nome:</span> {atual.nome}</p>
          <p><span className="text-muted-foreground">Número do Processo:</span> {processoOuTraco(atual.numero_processo)}</p>
          <p><span className="text-muted-foreground">Parte:</span> {atual.parte}</p>
          <p><span className="text-muted-foreground">Advogado:</span> {atual.advogado || "—"}</p>
          <p><span className="text-muted-foreground">Data Limite:</span> {atual.data_limite.split("-").reverse().join("/")}</p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            className="min-h-11 w-full sm:w-auto"
            onClick={() => { adiar(atual.id); void navigate({ to: "/prazos" }); }}
          >
            Ver Prazo
          </Button>
          <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => adiar(atual.id)}>
            Lembrar novamente em 30 minutos
          </Button>
          <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => void desativar(atual.id)}>
            Desativar lembrete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
