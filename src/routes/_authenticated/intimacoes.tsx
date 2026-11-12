import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BellRing, Printer, Search } from "lucide-react";
import { planoConfirmacao } from "@/lib/djen";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/intimacoes")({
  head: () => ({ meta: [{ title: "Intimações DJEN - Gestão Judicial" }, { name: "description", content: "Comunicações DJEN da OAB/MG 37.610." }] }),
  component: IntimacoesPage,
});

type Intimacao = { id: string; numero_processo: string | null; sigla_tribunal: string | null; orgao: string | null; tipo_comunicacao: string | null; data_disponibilizacao: string | null; link: string | null; texto: string; status: string; prazo_id: string | null };
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from>; rpc: typeof supabase.rpc };
const STATUS: Record<string, string> = { nova: "Nova", revisada: "Revisada", convertida_em_prazo: "Convertida em prazo" };
const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const PAGE = 8;

function escapeHtml(value: unknown): string {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function IntimacoesPage() {
  const qc = useQueryClient();
  const { cargo } = useProfile();
  const canConfirmPrazo = ["administrador", "advogado", "secretaria"].includes(cargo);
  const [busca, setBusca] = useState(""); const [pag, setPag] = useState(0);
  const [aberta, setAberta] = useState<Intimacao | null>(null);
  const [conf, setConf] = useState({ data: "", parte: "", advogado: "", lembrete: false, antecedencia: 3, repetir: false, ok: false });

  const q = useQuery({ queryKey: ["intimacoes_djen"], queryFn: async () => {
    const { data, error } = await db.from("intimacoes_djen").select("id,numero_processo,sigla_tribunal,orgao,tipo_comunicacao,data_disponibilizacao,link,texto,status,prazo_id").order("data_disponibilizacao", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message); return data as Intimacao[];
  }, refetchInterval: 5 * 60 * 1000, refetchOnWindowFocus: true });

  const filtradas = useMemo(() => (q.data ?? []).filter((i) => [i.numero_processo, i.sigla_tribunal, i.orgao, i.texto].join(" ").toLowerCase().includes(busca.toLowerCase())), [q.data, busca]);
  const pagina = filtradas.slice(pag * PAGE, pag * PAGE + PAGE);
  const novas = (q.data ?? []).filter((i) => i.status === "nova").length;

  function imprimirLista() {
    if (!filtradas.length) {
      toast.error("Não há comunicações para imprimir.");
      return;
    }

    const itens = filtradas.map((item) => {
      const texto = item.texto.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return "<article class=\"item\">" +
        "<div class=\"top\"><strong>" + escapeHtml(item.numero_processo) + "</strong><span>" + escapeHtml(br(item.data_disponibilizacao)) + "</span></div>" +
        "<p><b>Tribunal / Órgão:</b> " + escapeHtml([item.sigla_tribunal, item.orgao].filter(Boolean).join(" · ")) + "</p>" +
        "<p><b>Comunicação:</b> " + escapeHtml(item.tipo_comunicacao) + "</p>" +
        "<p><b>Status:</b> " + escapeHtml(STATUS[item.status] ?? item.status) + "</p>" +
        "<p class=\"texto\">" + escapeHtml(texto || "Texto não informado.") + "</p>" +
        (item.link ? "<p class=\"link\"><b>Link oficial:</b> " + escapeHtml(item.link) + "</p>" : "") +
        "</article>";
    }).join("");

    const html = "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Intimações DJEN</title><style>" +
      "@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#111;font-size:11px;margin:0}" +
      "h1{font-size:19px;margin:0 0 4px}.meta{color:#555;margin-bottom:16px}.item{border:1px solid #bbb;border-radius:5px;padding:10px;margin:0 0 10px;break-inside:avoid}" +
      ".top{display:flex;justify-content:space-between;gap:12px;font-size:12px}.top span{white-space:nowrap;color:#555}p{margin:5px 0}.texto{white-space:pre-wrap;line-height:1.45}.link{font-size:9px;color:#444;overflow-wrap:anywhere}" +
      "</style></head><body><h1>Intimações DJEN</h1>" +
      "<div class=\"meta\">OAB/MG 37.610 · " + filtradas.length + " comunicação(ões) · Gerado em " + escapeHtml(new Date().toLocaleString("pt-BR")) + "</div>" +
      itens + "</body></html>";

    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win || !win.document) {
      toast.error("Não foi possível abrir a impressão. Verifique o bloqueador de pop-ups.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    let printed = false;
    const print = () => {
      if (printed || win.closed) return;
      printed = true;
      win.focus();
      win.print();
    };
    win.addEventListener("load", print, { once: true });
    win.setTimeout(print, 500);
  }

  const revisar = useMutation({ mutationFn: async (id: string) => {
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await db.from("intimacoes_djen").update({
      status: "revisada",
      revisada_por: authData.user?.id ?? null,
      revisada_em: new Date().toISOString(),
    }).eq("id", id).eq("status", "nova");
    if (error) throw new Error(error.message);
  }, onSuccess: () => { toast.success("Marcada como revisada."); qc.invalidateQueries({ queryKey: ["intimacoes_djen"] }); }, onError: (e: Error) => toast.error(e.message) });

  const confirmar = useMutation({ mutationFn: async () => {
    if (!aberta) return; planoConfirmacao(aberta, conf.data || null);
    const { error } = await db.rpc("djen_confirmar_prazo", { p_intimacao: aberta.id, p_data_limite: conf.data, p_parte: conf.parte || null, p_advogado: conf.advogado || null, p_lembrete_ativo: conf.lembrete, p_antecedencia_dias: conf.antecedencia, p_repetir: conf.repetir });
    if (error) throw new Error(error.message);
  }, onSuccess: () => { toast.success("Prazo revisado e confirmado."); setAberta(null); qc.invalidateQueries({ queryKey: ["intimacoes_djen"] }); qc.invalidateQueries({ queryKey: ["prazos"] }); }, onError: (e: Error) => toast.error(e.message) });

  return <div className="space-y-6 p-4 md:p-6">
    <div><div className="flex items-center gap-2"><BellRing className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold tracking-tight">Intimações DJEN</h1></div>
      <p className="mt-1 text-sm text-muted-foreground">Busca nacional · OAB/MG 37.610 · Joaquim Dimas Gonçalves</p>
      <p className="text-xs text-muted-foreground">As comunicações entram como rascunhos. A data limite e os lembretes só são definidos após conferência do texto oficial por um responsável jurídico.</p></div>
    <Card>
      <CardHeader className="pb-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><CardTitle className="text-base">Comunicações</CardTitle><Badge variant={novas > 0 ? "default" : "secondary"}>{novas} nova(s)</Badge></div><div className="flex flex-col gap-2 sm:flex-row"><Button size="sm" variant="outline" onClick={imprimirLista} disabled={!filtradas.length}><Printer className="mr-2 h-4 w-4" />Imprimir lista</Button><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(e) => { setBusca(e.target.value); setPag(0); }} placeholder="Buscar processo, tribunal ou texto..." className="pl-9" /></div></div></div></CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>}
        {q.isError && <p className="py-8 text-center text-sm text-muted-foreground">Módulo DJEN ainda não ativado no banco de dados.</p>}
        {pagina.map((i) => <div key={i.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant={i.status === "nova" ? "default" : "secondary"}>{STATUS[i.status] ?? i.status}</Badge><span className="text-xs text-muted-foreground">{br(i.data_disponibilizacao)}</span></div><span className="text-xs text-muted-foreground">{i.sigla_tribunal} · {i.orgao}</span></div>
          <p className="mt-3 font-semibold">{i.numero_processo ?? "—"}</p><p className="text-sm text-muted-foreground">{i.tipo_comunicacao}</p>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">{i.texto.replace(/<[^>]+>/g, " ")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {i.link && <Button size="sm" variant="outline" asChild><a href={i.link} target="_blank" rel="noreferrer">Abrir no DJEN</a></Button>}
            {i.status === "nova" && <Button size="sm" variant="outline" onClick={() => revisar.mutate(i.id)}>Marcar como revisada</Button>}
            {canConfirmPrazo && i.status !== "convertida_em_prazo" && <Button size="sm" disabled={!i.prazo_id} onClick={() => { setConf({ data: "", parte: "", advogado: "", lembrete: false, antecedencia: 3, repetir: false, ok: false }); setAberta(i); }}>Revisar e confirmar prazo</Button>}
          </div>
        </div>)}
        {q.isSuccess && filtradas.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma comunicação encontrada.</p>}
        {filtradas.length > PAGE && <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={pag === 0} onClick={() => setPag(pag - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={(pag + 1) * PAGE >= filtradas.length} onClick={() => setPag(pag + 1)}>Próxima</Button></div>}
      </CardContent>
    </Card>
    <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Revisar prazo da intimação</DialogTitle></DialogHeader>
        <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded border p-2 text-xs">{aberta?.texto.replace(/<[^>]+>/g, " ")}</div>
        <div className="grid gap-3">
          <div><Label>Data limite (conferida por você)</Label><Input type="date" value={conf.data} onChange={(e) => setConf({ ...conf, data: e.target.value })} /></div>
          <div><Label>Parte</Label><Input value={conf.parte} onChange={(e) => setConf({ ...conf, parte: e.target.value })} /></div>
          <div><Label>Advogado</Label><Input value={conf.advogado} onChange={(e) => setConf({ ...conf, advogado: e.target.value })} /></div>
          <div className="flex items-center justify-between"><Label>Ativar lembrete</Label><Switch checked={conf.lembrete} onCheckedChange={(v) => setConf({ ...conf, lembrete: v })} /></div>
          {conf.lembrete && <div><Label>Antecedência (dias)</Label><Input type="number" min={1} max={6} value={conf.antecedencia} onChange={(e) => setConf({ ...conf, antecedencia: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} /></div>}
          {conf.lembrete && <div className="flex items-center justify-between"><Label>Repetir alerta diariamente</Label><Switch checked={conf.repetir} onCheckedChange={(v) => setConf({ ...conf, repetir: v })} /></div>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={conf.ok} onChange={(e) => setConf({ ...conf, ok: e.target.checked })} />Conferi o texto original e confirmo a data limite.</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setAberta(null)}>Cancelar</Button><Button disabled={!conf.ok || !conf.data || confirmar.isPending} onClick={() => confirmar.mutate()}>Confirmar prazo</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
