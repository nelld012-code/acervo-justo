import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Copy, Loader2, MessagesSquare, Paperclip, Send, Smile, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CARGO_LABELS, type Cargo } from "@/hooks/use-profile";
import {
  MessageAttachment,
  TAMANHO_MAX_ANEXO,
  TIPOS_ANEXO_PERMITIDOS,
  ehImagem,
  formatarTamanho,
} from "@/components/message-attachment";

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
type Mensagem = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
};

const EMOJIS = [
  "😀","😃","😄","😁","😉","😊","😍","😘","😜","🤔","😐","😴","😅","😂","🥲","😢",
  "😭","😡","😱","🤝","👍","👎","👏","🙏","💪","👌","✌️","🫡","❤️","🔥","⭐","✅",
  "❌","⚠️","📌","📎","📄","📁","⚖️","🗓️","⏰","💰","📞","✉️","🏛️","🚀","🎉","🙂",
];

function formatHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function extensaoDe(file: File) {
  const nome = file.name.toLowerCase();
  const ponto = nome.lastIndexOf(".");
  return ponto > -1 ? nome.slice(ponto + 1) : "bin";
}


function MensagensPage() {
  const queryClient = useQueryClient();
  const [meuId, setMeuId] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Contato | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [emojiAberto, setEmojiAberto] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);


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
        .select("id, sender_id, recipient_id, body, read_at, created_at, attachment_path, attachment_name, attachment_type, attachment_size")
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

  function escolherArquivo(file: File | null) {
    if (!file) return;
    if (!TIPOS_ANEXO_PERMITIDOS.includes(file.type)) {
      toast.error("Tipo não permitido. Envie JPG, PNG, WebP, PDF, DOC ou DOCX.");
      return;
    }
    if (file.size > TAMANHO_MAX_ANEXO) {
      toast.error("Arquivo muito grande. O limite é de 10 MB.");
      return;
    }
    setArquivo(file);
    setPrevia(ehImagem(file.type) ? URL.createObjectURL(file) : null);
  }

  function limparAnexo() {
    if (previa) URL.revokeObjectURL(previa);
    setArquivo(null);
    setPrevia(null);
    if (inputArquivoRef.current) inputArquivoRef.current.value = "";
  }

  async function enviar() {
    const corpo = texto.trim();
    if (enviando || !selecionado || !meuId) return;
    if (!corpo && !arquivo) return;
    setEnviando(true);
    setProgresso(arquivo ? 10 : 0);

    let anexo: {
      attachment_path: string;
      attachment_name: string;
      attachment_type: string;
      attachment_size: number;
    } | null = null;

    if (arquivo) {
      const caminho = `${meuId}/${crypto.randomUUID()}.${extensaoDe(arquivo)}`;
      setProgresso(40);
      const { error: upErro } = await supabase.storage
        .from("message_attachments")
        .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (upErro) {
        setEnviando(false);
        setProgresso(0);
        toast.error("Falha ao enviar o anexo: " + upErro.message);
        return;
      }
      setProgresso(80);
      anexo = {
        attachment_path: caminho,
        attachment_name: arquivo.name,
        attachment_type: arquivo.type,
        attachment_size: arquivo.size,
      };
    }

    const { error } = await supabase
      .from("messages")
      .insert({ sender_id: meuId, recipient_id: selecionado.id, body: corpo, ...(anexo ?? {}) });

    if (error) {
      if (anexo) await supabase.storage.from("message_attachments").remove([anexo.attachment_path]);
      setEnviando(false);
      setProgresso(0);
      toast.error("Não foi possível enviar: " + error.message);
      return;
    }

    setProgresso(100);
    setEnviando(false);
    setProgresso(0);
    setTexto("");
    limparAnexo();
    queryClient.invalidateQueries({ queryKey: ["messages-thread", selecionado.id] });
  }

  async function copiar(corpo: string) {
    try {
      await navigator.clipboard.writeText(corpo);
      toast.success("Mensagem copiada.");
    } catch {
      toast.error("Não foi possível copiar a mensagem.");
    }
  }

  async function excluir(m: Mensagem) {
    if (!window.confirm("Excluir esta mensagem? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) { toast.error("Não foi possível excluir: " + error.message); return; }
    if (m.attachment_path) {
      await supabase.storage.from("message_attachments").remove([m.attachment_path]);
    }
    toast.success("Mensagem excluída.");
    queryClient.invalidateQueries({ queryKey: ["messages-thread"] });
    queryClient.invalidateQueries({ queryKey: ["messages-unread"] });
  }


  const contatos = contatosQuery.data ?? [];

  return (
    <div className="w-full max-w-full space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><MessagesSquare className="h-6 w-6" /> Mensagens</h1>
       {totalNaoLidas > 0 && (
  <p className="text-sm text-muted-foreground">
    <span className="font-medium text-foreground">
      {totalNaoLidas} não lida(s).
    </span>
  </p>
)}
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
                    <div key={m.id} className={`group flex items-center gap-1 ${minha ? "justify-end" : "justify-start"}`}>
                      {minha && (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copiar mensagem" onClick={() => void copiar(m.body)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Excluir mensagem" onClick={() => void excluir(m)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      <div className={`max-w-[85%] space-y-2 rounded-lg px-3 py-2 text-sm ${minha ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {m.attachment_path && (
                          <MessageAttachment
                            path={m.attachment_path}
                            name={m.attachment_name}
                            type={m.attachment_type}
                            size={m.attachment_size}
                            minha={minha}
                          />
                        )}
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        <p className={`mt-1 text-[11px] ${minha ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatHora(m.created_at)}</p>
                      </div>

                      {!minha && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" aria-label="Copiar mensagem" onClick={() => void copiar(m.body)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                <div ref={fimRef} />
              </div>
            </ScrollArea>
            {arquivo && (
              <div className="flex items-center gap-3 rounded-md border p-2">
                {previa ? (
                  <img src={previa} alt="Prévia do anexo" className="h-14 w-14 rounded object-cover" />
                ) : (
                  <Paperclip className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{arquivo.name}</p>
                  <p className="text-xs text-muted-foreground">{formatarTamanho(arquivo.size)}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={limparAnexo} disabled={enviando} aria-label="Remover anexo">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {enviando && arquivo && (
              <div className="space-y-1">
                <Progress value={progresso} />
                <p className="text-xs text-muted-foreground">Enviando anexo... {progresso}%</p>
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void enviar(); }}
            >
              <input
                ref={inputArquivoRef}
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={!selecionado || enviando}
                onClick={() => inputArquivoRef.current?.click()}
                aria-label="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Popover open={emojiAberto} onOpenChange={setEmojiAberto}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={!selecionado || enviando} aria-label="Inserir emoji">
                    <Smile className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-2">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="rounded p-1 text-lg leading-none hover:bg-muted"
                        onClick={() => { setTexto((t) => t + emoji); setEmojiAberto(false); }}
                        aria-label={`Inserir ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={selecionado ? "Escreva sua mensagem..." : "Selecione um usuário"}
                disabled={!selecionado || enviando}
              />
              <Button type="submit" className="shrink-0" disabled={!selecionado || enviando || (!texto.trim() && !arquivo)}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Enviar</span>
              </Button>
            </form>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
