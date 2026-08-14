import { useCallback, useEffect, useMemo, useState } from "react";
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
  chaveLembrete,
  diasRestantes,
  prazoEmAlerta,
  processoOuTraco,
  textoDiasRestantes,
  type Prazo,
} from "@/lib/prazos-view";

const SNOOZE_MS = 30 * 60 * 1000;
const STORAGE_KEY = "prazos-snooze";
const DISMISS_KEY = "prazos-dispensados";

function readMap<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, T>;
  } catch {
    return {};
  }
}

function writeMap(key: string, map: Record<string, unknown>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* armazenamento indisponível */
  }
}

/** Popup de prazos: um único alerta por vez, sem timers duplicados nem vazamentos. */
export function PrazoReminders() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  const [snooze, setSnooze] = useState<Record<string, number>>({});
  const [dispensados, setDispensados] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Verificação inicial (abertura do app / login) + limpeza de adiamentos expirados.
    const agora = Date.now();
    const s = readMap<number>(STORAGE_KEY);
    const limpos = Object.fromEntries(Object.entries(s).filter(([, v]) => Number(v) > agora));
    writeMap(STORAGE_KEY, limpos);
    setSnooze(limpos);
    setDispensados(readMap<boolean>(DISMISS_KEY));
  }, []);

  useEffect(() => {
    // Um único intervalo enquanto o componente estiver montado.
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
    return (
      (data ?? []).find((p) => {
        if (!prazoEmAlerta(p)) return false;
        if (dispensados[chaveLembrete(p)]) return false;
        return (snooze[p.id] ?? 0) < agora;
      }) ?? null
    );
  }, [data, snooze, dispensados, tick]);

  const adiar = useCallback((p: Prazo) => {
    if (p.repetir_alerta_diariamente) {
      setSnooze((prev) => {
        const next = { ...prev, [p.id]: Date.now() + SNOOZE_MS };
        writeMap(STORAGE_KEY, next);
        return next;
      });
      toast.success("Lembrete adiado por 30 minutos.");
    } else {
      // Sem repetição diária: o alerta não volta a aparecer para este prazo.
      setDispensados((prev) => {
        const next = { ...prev, [chaveLembrete(p)]: true };
        writeMap(DISMISS_KEY, next);
        return next;
      });
      toast.success("Lembrete encerrado para este prazo.");
    }
  }, []);

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

  async function concluir(id: string) {
    const { error } = await supabase
      .from("prazos")
      .update({ status: "Concluído", data_conclusao: new Date().toISOString().slice(0, 10), lembrete_ativo: false })
      .eq("id", id);
    if (error) {
      toast.error("Não foi possível concluir o prazo.");
      return;
    }
    toast.success("Prazo concluído com sucesso.");
    void qc.invalidateQueries({ queryKey: ["prazos-lembretes"] });
    void qc.invalidateQueries({ queryKey: ["prazos"] });
    void qc.invalidateQueries({ queryKey: ["prazos-proximos"] });
  }

  if (!atual) return null;
  const dias = diasRestantes(atual.data_limite);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) adiar(atual); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl">
        <DialogHeader>
          <DialogTitle>⚠️ Lembrete de Prazo</DialogTitle>
          <DialogDescription>{textoDiasRestantes(dias)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 text-sm text-foreground">
          <p><span className="text-muted-foreground">Nome:</span> {atual.nome}</p>
          <p><span className="text-muted-foreground">Número do Processo:</span> {processoOuTraco(atual.numero_processo)}</p>
          <p><span className="text-muted-foreground">Parte:</span> {atual.parte}</p>
          <p><span className="text-muted-foreground">Advogado:</span> {atual.advogado || "—"}</p>
          <p><span className="text-muted-foreground">Data Limite:</span> {atual.data_limite.split("-").reverse().join("/")}</p>
        </div>
        <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:space-x-0">
          <Button
            className="min-h-11 w-full min-w-0 px-3 text-sm"
            onClick={() => { adiar(atual); void navigate({ to: "/prazos" }); }}
          >
            Ver Prazo
          </Button>
          <Button
            variant="outline"
            className="min-h-11 w-full min-w-0 px-3 text-sm"
            onClick={() => adiar(atual)}
          >
            {atual.repetir_alerta_diariamente ? "Lembrar em 30 min." : "Fechar"}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 w-full min-w-0 px-3 text-sm"
            onClick={() => void concluir(atual.id)}
          >
            Concluir
          </Button>
          <Button
            variant="outline"
            className="min-h-11 w-full min-w-0 px-3 text-sm"
            onClick={() => void desativar(atual.id)}
          >
            Desativar lembrete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
