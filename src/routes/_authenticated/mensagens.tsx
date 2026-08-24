import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, MessagesSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { CARGO_LABELS, type Cargo } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/mensagens")({
  head: () => ({
    meta: [
      { title: "Mensagens - Gestão Judicial" },
      { name: "description", content: "Mensageria interna entre os usuários do escritório, com histórico de 60 dias." },
      { property: "og:title", content: "Mensagens - Gestão Judicial" },
      { property: "og:description", content: "Converse internamente com os usuários do sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MensagensPage,
});

type Contato = { id: string; nome: string; cargo: string };
type Mensagem = { id: string; sender_id: string; recipient_id: string; body: string; read_at: string | null; created_at: string };

function formatHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function MensagensPage() {
  const queryClient = useQueryClient();
  const [meuId, setMeuId] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Contato | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeuId(data.user?.id ?? null));
  }, []);

  const contatosQuery = useQuery({
    queryKey: ["message-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_message_contacts");
      if (error) throw error;
      return (data ?? []) as Contato[];
    },
    staleTime: 60_000,
  });

  const naoLidasQuery = useQuery({
    queryKey: ["messages-unread", meuId],
    enabled: !!meuId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("sender_id")
        .eq("recipient_id", meuId!)
        .is("read_at", null);
      if (error) throw error;
      const mapa: Record<string, number> = {};
      (data ?? []).forEach((m) => { mapa[m.sender_id] = (mapa[m.sender_id] ?? 0) + 1; });
      return mapa;
    },
  });

  const conversaQuery = useQuery({
    queryKey: ["messages-thread", selecionado?.id],
    enabled: !!selecionado,
    queryFn: async () => {
      const outro = selecionado!.id;
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, recipient_id, body, read_at, created_at")
        .or(`sender_id.eq.${outro},recipient_id.eq.${outro}`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
  });

  // Tempo real: qualquer alteração recarrega a conversa aberta e o contador.
  useEffect(() => {
    const channel = supabase
      .channel("mensageria-interna")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages-unread"] });
        queryClient.invalidateQueries({ queryKey: ["messages-thread"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Marcar como lida ao abrir a conversa.
  useEffect(() => {
    if (!selecionado || !meuId) return;
    const naoLidas = (conversaQuery.data ?? []).filter((m) => m.recipient_id === meuId && !m.read_at);
    if (!naoLidas.length) return;
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", naoLidas.map((m) => m.id))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["messages-unread"] });
        queryClient.invalidateQueries({ queryKey: ["messages-thread", selecionado.id] });
      });
  }, [selecionado, meuId, conversaQuery.data, queryClient]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [conversaQuery.data]);

  const totalNaoLidas = useMemo(
    () => Object.values(naoLidasQuery.data ?? {}).reduce((soma, n) => soma + n, 0),
    [naoLidasQuery.data],
  );

  async function enviar() {
    const corpo = texto.trim();
    if (!corpo || !selecionado || !meuId) return;
    setEnviando(true);
    const { error } = await supabase.from("messages").insert({ sender_id: meuId, recipient_id: selecionado.id, body: corpo });
    setEnviando(false);
    if (error) { toast.error("Não foi possível enviar: " + error.message); return; }
    setTexto("");
    queryClient.invalidateQueries({ queryKey: ["messages-thread", selecionado.id] });
  }

  const contatos = contatosQuery.data ?? [];

  return (
    <div className="w-full max-w-full space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><MessagesSquare className="h-6 w-6" /> Mensagens</h1>
        <p className="text-sm text-muted-foreground">
          Comunicação interna entre usuários do sistema. As mensagens são apagadas automaticamente após 60 dias.
          {totalNaoLidas > 0 && <span className="ml-1 font-medium text-foreground">{totalNaoLidas} não lida(s).</span>}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className={selecionado ? "hidden lg:block" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Usuários</CardTitle>
            <CardDescription>Selecione para conversar</CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="h-[50vh] lg:h-[60vh]">
              <div className="space-y-1 pr-2">
                {contatosQuery.isLoading && <p className="p-2 text-sm text-muted-foreground">Carregando...</p>}
                {!contatosQuery.isLoading && !contatos.length && <p className="p-2 text-sm text-muted-foreground">Nenhum outro usuário cadastrado.</p>}
                {contatos.map((c) => {
                  const naoLidas = naoLidasQuery.data?.[c.id] ?? 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelecionado(c)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${selecionado?.id === c.id ? "bg-muted" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.nome || "Sem nome"}</span>
                        <span className="block truncate text-xs text-muted-foreground">{CARGO_LABELS[c.cargo as Cargo] ?? c.cargo}</span>
                      </span>
                      {naoLidas > 0 && <Badge className="shrink-0">{naoLidas}</Badge>}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className={selecionado ? "" : "hidden lg:block"}>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
            {selecionado && (
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSelecionado(null)} aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{selecionado ? selecionado.nome || "Sem nome" : "Nenhuma conversa aberta"}</CardTitle>
              <CardDescription className="truncate">
                {selecionado ? (CARGO_LABELS[selecionado.cargo as Cargo] ?? selecionado.cargo) : "Escolha um usuário na lista"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScrollArea className="h-[45vh] rounded-md border p-3 lg:h-[55vh]">
              {!selecionado && <p className="text-sm text-muted-foreground">Selecione um usuário para iniciar a conversa.</p>}
              {selecionado && conversaQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando mensagens...</p>}
              {selecionado && !conversaQuery.isLoading && !(conversaQuery.data ?? []).length && (
                <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda. Envie a primeira.</p>
              )}
              <div className="space-y-2">
                {(conversaQuery.data ?? []).map((m) => {
                  const minha = m.sender_id === meuId;
                  return (
                    <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${minha ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`mt-1 text-[11px] ${minha ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatHora(m.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={fimRef} />
              </div>
            </ScrollArea>
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void enviar(); }}
            >
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={selecionado ? "Escreva sua mensagem..." : "Selecione um usuário"}
                disabled={!selecionado || enviando}
              />
              <Button type="submit" disabled={!selecionado || enviando || !texto.trim()}>
                <Send className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">Enviar</span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
