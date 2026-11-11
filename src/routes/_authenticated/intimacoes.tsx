import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarDays, FileText, Printer, Search, ShieldCheck, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/intimacoes")({
  head: () => ({ meta: [{ title: "Intimações DJEN - Gestão Judicial" }] }),
  component: IntimacoesPage,
});

type Intimacao = {
  id: string;
  hash: string;
  djen_id: string | null;
  numero_processo: string | null;
  sigla_tribunal: string | null;
  orgao: string | null;
  tipo_comunicacao: string | null;
  tipo_documento: string | null;
  meio: string | null;
  data_disponibilizacao: string | null;
  link: string | null;
  destinatarios: unknown;
  advogados: unknown;
  texto: string;
  payload: Record<string, unknown>;
  status: "nova" | "revisada" | "convertida_em_prazo";
  revisada_por: string | null;
  revisada_em: string | null;
  prazo_id: string | null;
};

const db = supabase as any;
const dataBR = (value: string | null) =>
  value ? new Date(value.length === 10 ? value + "T12:00:00" : value).toLocaleDateString("pt-BR") : "—";
const escapeHtml = (value: unknown) =>
  String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const statusLabel = (status: Intimacao["status"]) =>
  status === "nova" ? "Nova" : status === "revisada" ? "Revisada" : "Convertida em prazo";

function imprimir(titulo: string, conteudo: string) {
  const win = window.open("", "_blank", "width=1000,height=800");
  if (!win) return toast.error("Permita pop-ups para imprimir.");
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title><style>
    @page{size:A4;margin:16mm}body{font:12px Arial,sans-serif;color:#111;line-height:1.5}
    h1{font-size:20px;margin:0 0 8px}h2{font-size:14px;margin:18px 0 6px}
    .meta{color:#555;font-size:11px;margin-bottom:14px}.box{border:1px solid #bbb;padding:12px;margin:8px 0}
    .texto{white-space:pre-wrap;overflow-wrap:anywhere}.item{border-bottom:1px solid #ccc;padding:10px 0;break-inside:avoid}
  </style></head><body>${conteudo}<p class="meta">Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))}</p></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function IntimacoesPage() {
  const qc = useQueryClient();
  const { perms } = useProfile();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [selecionada, setSelecionada] = useState<Intimacao | null>(null);
  const [prazoModal, setPrazoModal] = useState<Intimacao | null>(null);
  const [parte, setParte] = useState("");
  const [salvando, setSalvando] = useState(false);

  const query = useQuery({
    queryKey: ["intimacoes-djen"],
    queryFn: async (): Promise<Intimacao[]> => {
      const { data, error } = await db.from("intimacoes_djen").select("*")
        .order("data_disponibilizacao", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Intimacao[];
    },
    retry: false,
  });

  const itens = query.data ?? [];
  const filtradas = useMemo(() => itens.filter((item) => {
    const matchesStatus = filtro === "todas" || item.status === filtro;
    const haystack = [item.numero_processo, item.sigla_tribunal, item.orgao, item.texto,
      JSON.stringify(item.destinatarios ?? ""), JSON.stringify(item.advogados ?? "")].join(" ").toLowerCase();
    return matchesStatus && haystack.includes(busca.toLowerCase());
  }), [itens, filtro, busca]);

  const novas = itens.filter((item) => item.status === "nova").length;
  const revisadas = itens.filter((item) => item.status === "revisada").length;
  const convertidas = itens.filter((item) => item.status === "convertida_em_prazo").length;

  async function marcarRevisada(item: Intimacao) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return toast.error("Sua sessão expirou. Entre novamente.");
    const { data, error } = await db.from("intimacoes_djen")
      .update({ status: "revisada", revisada_por: auth.user.id, revisada_em: new Date().toISOString() })
      .eq("id", item.id).eq("status", "nova").select("id").maybeSingle();
    if (error) return toast.error("Não foi possível marcar como revisada.", { description: error.message });
    if (!data) return toast.info("Esta intimação já foi revisada ou atualizada por outro usuário.");
    toast.success("Intimação marcada como revisada.");
    await qc.invalidateQueries({ queryKey: ["intimacoes-djen"] });
    setSelecionada(null);
  }

  function abrirCriacaoPrazo(item: Intimacao) {
    if (item.status !== "revisada") return toast.error("Revise a intimação antes de criar um prazo.");
    setParte("");
    setPrazoModal(item);
  }

  async function criarPrazo() {
    const item = prazoModal;
    if (!item || !parte || salvando) return;
    setSalvando(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada. Entre novamente.");

      // Nome estável por comunicação: a regra atual de deduplicação de prazos
      // impede que um novo clique crie outra linha para a mesma intimação.
      const nome = `Intimação DJEN ${item.hash.slice(0, 12)}`;
      const observacao = [
        "Criado a partir da Intimação DJEN.",
        `Identificador: ${item.djen_id ?? item.hash}`,
        item.sigla_tribunal ? `Tribunal: ${item.sigla_tribunal}` : "",
        item.link ? `Link oficial: ${item.link}` : "",
        item.texto ? `Texto original: ${item.texto}` : "",
      ].filter(Boolean).join("\n");

      const { data: inserted, error: insertError } = await db.from("prazos").insert({
        nome,
        numero_processo: item.numero_processo,
        parte,
        advogado: "Dr. Dimas",
        data_limite: null,
        observacao,
        lembrete_ativo: false,
        antecedencia_dias: 3,
        repetir_alerta_diariamente: false,
        status: "Em andamento",
        data_conclusao: null,
        created_by: auth.user.id,
      }).select("id").maybeSingle();

      if (insertError) throw insertError;
      let prazoId = inserted?.id as string | undefined;
      if (!prazoId) {
        const { data: existing, error } = await db.from("prazos").select("id")
          .eq("nome", nome).eq("numero_processo", item.numero_processo).is("data_limite", null).maybeSingle();
        if (error || !existing?.id) throw new Error("O prazo não foi confirmado; a intimação continua revisada.");
        prazoId = existing.id as string;
      }

      const { data: updated, error: updateError } = await db.from("intimacoes_djen")
        .update({ status: "convertida_em_prazo", prazo_id: prazoId })
        .eq("id", item.id).eq("status", "revisada").select("id").maybeSingle();
      if (updateError || !updated) {
        throw new Error("O prazo foi criado, mas não foi possível vincular a intimação. Não clique novamente; informe o administrador. " + (updateError?.message ?? ""));
      }

      toast.success("Prazo criado sem data limite. Defina a data após a conferência jurídica.");
      setPrazoModal(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["intimacoes-djen"] }),
        qc.invalidateQueries({ queryKey: ["prazos"] }),
        qc.invalidateQueries({ queryKey: ["prazos-lembretes"] }),
      ]);
    } catch (error) {
      toast.error("Não foi possível converter a intimação em prazo.", {
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
    } finally {
      setSalvando(false);
    }
  }

  function imprimirFicha(item: Intimacao) {
    const content = `
      <h1>Intimação DJEN</h1>
      <div class="box">
        <p><b>Processo:</b> ${escapeHtml(item.numero_processo || "Não informado")}</p>
        <p><b>Tribunal:</b> ${escapeHtml(item.sigla_tribunal || "—")}</p>
        <p><b>Órgão:</b> ${escapeHtml(item.orgao || "—")}</p>
        <p><b>Disponibilização:</b> ${escapeHtml(dataBR(item.data_disponibilizacao))}</p>
        <p><b>Status:</b> ${escapeHtml(statusLabel(item.status))}</p>
        <p><b>Identificador CNJ:</b> ${escapeHtml(item.djen_id || item.hash)}</p>
        <p><b>Link:</b> ${escapeHtml(item.link || "—")}</p>
      </div>
      <h2>Texto original da comunicação</h2><div class="box texto">${escapeHtml(item.texto || "Texto não informado.")}</div>`;
    imprimir("Intimação DJEN", content);
  }

  function imprimirRelatorio() {
    if (!filtradas.length) return toast.info("Não há intimações para imprimir.");
    const content = `<h1>Relatório de Intimações DJEN</h1>
      <p class="meta">OAB/MG 37.610 · ${filtradas.length} comunicação(ões)</p>
      ${filtradas.map((item) => `<div class="item">
        <b>${escapeHtml(item.numero_processo || "Processo não informado")}</b>
        <p>${escapeHtml(item.sigla_tribunal || "—")} · ${escapeHtml(dataBR(item.data_disponibilizacao))} · ${escapeHtml(statusLabel(item.status))}</p>
        <p>${escapeHtml(item.texto.slice(0, 1200))}</p>
      </div>`).join("")}`;
    imprimir("Relatório DJEN", content);
  }

  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><BellRing className="h-6 w-6 text-sky-600" /><h1 className="text-2xl font-bold tracking-tight">Intimações DJEN</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">Publicações vinculadas à OAB/MG 37.610 · Joaquim Dimas Gonçalves</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={imprimirRelatorio} disabled={!filtradas.length}><Printer className="mr-2 h-4 w-4" />Imprimir relatório</Button>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Atualizar lista</Button>
      </div>
    </div>

    <div className="rounded-lg border border-sky-300/50 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-100">
      A consulta automática depende da ativação do serviço DJEN no servidor. A data de disponibilização não é, por si só, uma data de início ou vencimento de prazo.
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Novas</p><p className="mt-1 text-2xl font-bold">{String(novas).padStart(2, "0")}</p></div><BellRing className="h-8 w-8 text-sky-600" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Revisadas</p><p className="mt-1 text-2xl font-bold">{String(revisadas).padStart(2, "0")}</p></div><ShieldCheck className="h-8 w-8 text-emerald-600" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Convertidas em prazo</p><p className="mt-1 text-2xl font-bold">{String(convertidas).padStart(2, "0")}</p></div><CalendarDays className="h-8 w-8 text-violet-600" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">OAB monitorada</p><p className="mt-1 text-2xl font-bold">37.610</p></div><FileText className="h-8 w-8 text-muted-foreground" /></CardContent></Card>
    </div>

    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Comunicações recentes</CardTitle>
          <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar processo, tribunal ou texto..." className="pl-9" /></div>
        </div>
        <div className="flex flex-wrap gap-2 pt-3">
          {([["todas", "Todas"], ["nova", "Novas"], ["revisada", "Revisadas"], ["convertida_em_prazo", "Convertidas"]] as const).map(([value, label]) =>
            <Button key={value} size="sm" variant={filtro === value ? "default" : "outline"} onClick={() => setFiltro(value)}>{label}</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando comunicações...</p>}
        {query.isError && <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
          <b>Integração ainda não ativada.</b><p className="mt-1">A tabela de intimações ainda não está disponível no banco de dados. Nenhuma publicação fictícia será exibida como se fosse real.</p>
        </div>}
        {!query.isLoading && !query.isError && filtradas.map((item) => <div key={item.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Badge variant={item.status === "nova" ? "default" : item.status === "revisada" ? "secondary" : "outline"}>{statusLabel(item.status)}</Badge><span className="text-xs text-muted-foreground">{dataBR(item.data_disponibilizacao)}</span></div>
            <span className="text-xs text-muted-foreground">{item.sigla_tribunal || "Tribunal não informado"}</span>
          </div>
          <p className="mt-3 font-semibold">{item.numero_processo || "Processo não informado"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.orgao || "Órgão não informado"}</p>
          <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed">{item.texto || "Sem texto da comunicação."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelecionada(item)}><Eye className="mr-1 h-4 w-4" />Ver detalhes</Button>
            {item.status === "nova" && <Button size="sm" variant="outline" onClick={() => void marcarRevisada(item)}><ShieldCheck className="mr-1 h-4 w-4" />Marcar como revisada</Button>}
            {item.status === "revisada" && <Button size="sm" onClick={() => abrirCriacaoPrazo(item)}><CalendarDays className="mr-1 h-4 w-4" />Criar prazo</Button>}
            <Button size="sm" variant="ghost" onClick={() => imprimirFicha(item)}><Printer className="mr-1 h-4 w-4" />Imprimir ficha</Button>
          </div>
        </div>)}
        {!query.isLoading && !query.isError && filtradas.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma comunicação encontrada.</p>}
      </CardContent>
    </Card>

    <Dialog open={!!selecionada} onOpenChange={(open) => !open && setSelecionada(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Detalhes da intimação</DialogTitle><DialogDescription>Texto original retornado pelo DJEN, sem cálculo automático de prazo.</DialogDescription></DialogHeader>
        {selecionada && <div className="space-y-3 text-sm">
          <p><b>Processo:</b> {selecionada.numero_processo || "—"}</p>
          <p><b>Tribunal:</b> {selecionada.sigla_tribunal || "—"}</p>
          <p><b>Órgão:</b> {selecionada.orgao || "—"}</p>
          <p><b>Disponibilização:</b> {dataBR(selecionada.data_disponibilizacao)}</p>
          <p><b>Status:</b> {statusLabel(selecionada.status)}</p>
          {selecionada.link && <p><b>Link oficial:</b> <a className="text-primary underline" href={selecionada.link} target="_blank" rel="noreferrer">Abrir comunicação</a></p>}
          <div className="rounded-md border p-3"><b>Texto original</b><p className="mt-2 whitespace-pre-wrap leading-relaxed">{selecionada.texto}</p></div>
          <details><summary className="cursor-pointer font-medium">Dados originais do CNJ (JSON)</summary><pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(selecionada.payload, null, 2)}</pre></details>
        </div>}
        <DialogFooter>
          {selecionada?.status === "nova" && <Button variant="outline" onClick={() => void marcarRevisada(selecionada)}>Marcar como revisada</Button>}
          <Button variant="secondary" onClick={() => selecionada && imprimirFicha(selecionada)}><Printer className="mr-2 h-4 w-4" />Imprimir ficha</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!prazoModal} onOpenChange={(open) => !open && setPrazoModal(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Criar prazo a partir da intimação</DialogTitle><DialogDescription>Informe a posição da parte. A data limite ficará vazia e deverá ser conferida pelo advogado.</DialogDescription></DialogHeader>
        {prazoModal && <div className="space-y-3 text-sm">
          <p><b>Processo:</b> {prazoModal.numero_processo || "Não informado"}</p>
          <label className="block font-medium" htmlFor="djen-parte">Parte no processo</label>
          <select id="djen-parte" value={parte} onChange={(event) => setParte(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3">
            <option value="">Selecione...</option><option value="Parte Autora">Parte Autora</option><option value="Parte Ré">Parte Ré</option>
          </select>
          <p className="text-muted-foreground">Data limite: <b>não definida</b>. O sistema não calculará vencimento automaticamente.</p>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setPrazoModal(null)} disabled={salvando}>Cancelar</Button><Button onClick={() => void criarPrazo()} disabled={!parte || salvando}>{salvando ? "Salvando..." : "Confirmar criação do prazo"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
