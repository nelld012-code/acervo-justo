import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BellRing, CalendarDays, FileText, Printer, Search, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/intimacoes")({
  head: () => ({ meta: [{ title: "Intimações DJEN - Gestão Judicial" }] }),
  component: IntimacoesPage,
});

function IntimacoesPage() {
  const [busca, setBusca] = useState("");
  const exemplo = [
    { id: "demo-1", tribunal: "Exemplo de tribunal", processo: "0000000-00.2026.8.13.0000", data: "11/11/2026", parte: "Parte demonstrativa", status: "Nova", resumo: "Este é um registro fictício para demonstrar a apresentação das comunicações DJEN." },
    { id: "demo-2", tribunal: "Exemplo de tribunal", processo: "0000000-00.2026.8.13.0000", data: "10/11/2026", parte: "Parte demonstrativa", status: "Revisada", resumo: "O conteúdo real será carregado após a integração segura com a API do DJEN." },
  ];
  const filtradas = exemplo.filter((item) => [item.processo, item.tribunal, item.parte, item.resumo].join(" ").toLowerCase().includes(busca.toLowerCase()));

  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><BellRing className="h-6 w-6 text-sky-600" /><h1 className="text-2xl font-bold tracking-tight">Intimações DJEN</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">Publicações vinculadas à OAB/MG 37.610 · Joaquim Dimas Gonçalves</p>
      </div>
      <div className="flex gap-2"><Button variant="outline" disabled><Printer className="mr-2 h-4 w-4" />Imprimir relatório</Button><Button disabled><ShieldCheck className="mr-2 h-4 w-4" />Consultar DJEN</Button></div>
    </div>

    <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
      <strong>Prévia visual — dados fictícios.</strong> Esta tela está isolada na branch de desenvolvimento. Nenhuma consulta real foi executada e nenhuma intimação foi gravada.
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Novas</p><p className="mt-1 text-2xl font-bold">01</p></div><BellRing className="h-8 w-8 text-sky-600" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Revisadas</p><p className="mt-1 text-2xl font-bold">01</p></div><ShieldCheck className="h-8 w-8 text-emerald-600" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Convertidas em prazo</p><p className="mt-1 text-2xl font-bold">00</p></div><CalendarDays className="h-8 w-8 text-violet-600" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">OAB monitorada</p><p className="mt-1 text-2xl font-bold">37.610</p></div><FileText className="h-8 w-8 text-muted-foreground" /></CardContent></Card>
    </div>

    <Card>
      <CardHeader className="pb-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="text-base">Comunicações recentes</CardTitle><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar processo, tribunal ou parte..." className="pl-9" /></div></div></CardHeader>
      <CardContent className="space-y-3">
        {filtradas.map((item) => <div key={item.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant={item.status === "Nova" ? "default" : "secondary"}>{item.status}</Badge><span className="text-xs text-muted-foreground">{item.data}</span></div><span className="text-xs text-muted-foreground">{item.tribunal}</span></div>
          <p className="mt-3 font-semibold">{item.processo}</p><p className="mt-1 text-sm text-muted-foreground">{item.parte}</p><p className="mt-3 text-sm leading-relaxed">{item.resumo}</p>
          <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled>Ver detalhes</Button><Button size="sm" variant="outline" disabled>Marcar como revisada</Button><Button size="sm" disabled>Criar prazo</Button></div>
        </div>)}
        {filtradas.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma comunicação encontrada.</p>}
      </CardContent>
    </Card>
  </div>;
}
