import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarClock, CheckCircle2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { logAudit } from "@/lib/documents";
import {
  ANTECEDENCIA_DIAS_OPTIONS, PARTES, SITUACAO_CLASS, SITUACAO_LABEL,
  diasRestantes, processoOuTraco, situacaoDoPrazo, type Prazo, type Situacao,
} from "@/lib/prazos-view";

export const Route = createFileRoute("/_authenticated/prazos")({
  head: () => ({
    meta: [
      { title: "Prazos - Gestão Judicial" },
      { name: "description", content: "Controle de prazos jurídicos com lembretes automáticos e alertas por urgência." },
      { property: "og:title", content: "Prazos - Gestão Judicial" },
      { property: "og:description", content: "Controle de prazos jurídicos com lembretes automáticos e alertas por urgência." },
    ],
  }),
  component: PrazosPage,
});

const FILTROS = [
  "Todos", "Em andamento", "Concluídos", "Normal", "Atenção", "Crítico", "Vence Hoje", "Prazo Vencido",
] as const;
type Filtro = (typeof FILTROS)[number];

const FILTRO_SITUACAO: Partial<Record<Filtro, Situacao>> = {
  Normal: "normal",
  "Atenção": "atencao",
  "Crítico": "critico",
  "Vence Hoje": "hoje",
  "Prazo Vencido": "vencido",
};

const ORDENACOES = [
  { value: "data_limite", label: "Data Limite" },
  { value: "nome", label: "Nome" },
  { value: "advogado", label: "Advogado" },
  { value: "status", label: "Status" },
] as const;

const ITENS_POR_PAGINA = 8;

const emptyForm = {
  nome: "",
  numero_processo: "",
  parte: "Parte Autora",
  advogado: "",
  data_limite: "",
  observacao: "",
  lembrete_ativo: true,
  antecedencia_dias: 3,
  repetir_alerta_diariamente: true,
};

function brDate(d: string | null) {
  return d ? d.split("-").reverse().join("/") : "—";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printHtml(title: string, body: string) {
  // Sem "noopener/noreferrer": precisamos de acesso ao documento da nova janela.
  const win = window.open("", "_blank", "width=1000,height=800");
  if (!win || !win.document) {
    toast.error("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
    return;
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .muted { color: #555; }
    .meta { margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 6px 7px; text-align: left; vertical-align: top; }
    th { background: #eee; }
    .item { border: 1px solid #bbb; padding: 12px; margin-bottom: 10px; break-inside: avoid; }
    .item p { margin: 5px 0; }
    .print-date { margin-top: 18px; font-size: 10px; color: #666; }
  </style></head><body>${body}</body></html>`;

  let impresso = false;
  const imprimir = () => {
    if (impresso || win.closed) return;
    impresso = true;
    try {
      win.focus();
      win.print();
      // Fecha após o diálogo de impressão, quando o navegador permitir.
      win.setTimeout(() => { if (!win.closed) win.close(); }, 500);
    } catch {
      /* usuário pode imprimir manualmente */
    }
  };

  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.addEventListener("load", imprimir, { once: true });
    // Fallback: alguns navegadores não disparam "load" em document.write.
    win.setTimeout(imprimir, 500);
  } catch {
    toast.error("Não foi possível preparar a impressão.");
  }
}

function PrazosPage() {
  const qc = useQueryClient();
  const { perms } = useProfile();
  const podeGerenciar = perms.canManageDocuments;

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [ordem, setOrdem] = useState<string>("data_limite");
  const [pagina, setPagina] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Prazo | null>(null);
  const [excluindo, setExcluindo] = useState<Prazo | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["prazos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prazos").select("*").order("data_limite", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Prazo[];
    },
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["prazos"] });
    void qc.invalidateQueries({ queryKey: ["prazos-lembretes"] });
  }

  function abrirNovo() {
    setEditando(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function abrirEdicao(p: Prazo) {
    setEditando(p);
    setForm({
      nome: p.nome,
      numero_processo: p.numero_processo ?? "",
      parte: p.parte,
      advogado: p.advogado ?? "",
      data_limite: p.data_limite,
      observacao: p.observacao ?? "",
      lembrete_ativo: p.lembrete_ativo,
      antecedencia_dias: p.antecedencia_dias,
      repetir_alerta_diariamente: p.repetir_alerta_diariamente,
    });
    setDialogOpen(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return toast.error("Informe o nome.");
    if (!form.data_limite) return toast.error("Informe a data limite.");
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        numero_processo: form.numero_processo.trim() || null,
        parte: form.parte,
        advogado: form.advogado.trim() || null,
        data_limite: form.data_limite,
        observacao: form.observacao.trim() || null,
        lembrete_ativo: form.lembrete_ativo,
        antecedencia_dias: form.antecedencia_dias,
        repetir_alerta_diariamente: form.repetir_alerta_diariamente,
      };
      if (editando) {
        const { error } = await supabase.from("prazos").update(payload).eq("id", editando.id);
        if (error) throw error;
        await logAudit(null, "edited", { entidade: "prazo", prazo_id: editando.id, ...payload });
        toast.success("Prazo atualizado com sucesso.");
      } else {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("Sessão expirada");
        const { data: inserted, error } = await supabase
          .from("prazos")
          .insert({ ...payload, created_by: auth.user.id })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit(null, "uploaded", { entidade: "prazo", acao: "criacao", prazo_id: inserted.id, ...payload });
        toast.success("Prazo criado com sucesso.");
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      toast.error("Não foi possível salvar o prazo.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSalvando(false);
    }
  }

  async function concluir(p: Prazo) {
    const { error } = await supabase
      .from("prazos")
      .update({ status: "Concluído", data_conclusao: new Date().toISOString().slice(0, 10), lembrete_ativo: false })
      .eq("id", p.id);
    if (error) return toast.error("Não foi possível salvar o prazo.");
    await logAudit(null, "edited", { entidade: "prazo", acao: "conclusao", prazo_id: p.id });
    toast.success("Prazo concluído com sucesso.");
    refresh();
  }

  async function excluir() {
    if (!excluindo) return;
    const { error } = await supabase.from("prazos").delete().eq("id", excluindo.id);
    if (error) return toast.error("Não foi possível salvar o prazo.");
    await logAudit(null, "deleted", { entidade: "prazo", prazo_id: excluindo.id, nome: excluindo.nome });
    toast.success("Prazo excluído com sucesso.");
    setExcluindo(null);
    refresh();
  }

  function imprimirPrazo(p: Prazo) {
    const status = situacaoDoPrazo(p);
    const body = `
      <h1>Prazo</h1>
      <div class="meta muted">Impressão individual do prazo</div>
      <div class="item">
        <h2>${escapeHtml(p.nome)}</h2>
        <p><strong>Número do Processo:</strong> ${escapeHtml(processoOuTraco(p.numero_processo))}</p>
        <p><strong>Parte:</strong> ${escapeHtml(p.parte)}</p>
        <p><strong>Advogado:</strong> ${escapeHtml(p.advogado || "—")}</p>
        <p><strong>Data Limite:</strong> ${escapeHtml(brDate(p.data_limite))}</p>
        <p><strong>Dias Restantes:</strong> ${escapeHtml(p.status === "Concluído" ? "—" : String(diasRestantes(p.data_limite)))}</p>
        <p><strong>Status:</strong> ${escapeHtml(SITUACAO_LABEL[status])}</p>
        <p><strong>Lembrete:</strong> ${escapeHtml(p.lembrete_ativo ? `${p.antecedencia_dias} dia(s) antes` : "Desativado")}</p>
        <p><strong>Observação:</strong> ${escapeHtml(p.observacao || "—")}</p>
        ${p.data_conclusao ? `<p><strong>Concluído em:</strong> ${escapeHtml(brDate(p.data_conclusao))}</p>` : ""}
      </div>
      <div class="print-date">Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))}</div>`;
    printHtml(`Prazo - ${p.nome}`, body);
  }

  function imprimirLista() {
    if (!lista.length) {
      toast.error("Não há prazos para imprimir.");
      return;
    }
    const rows = lista.map((p) => {
      const s = situacaoDoPrazo(p);
      return `<tr>
        <td>${escapeHtml(p.nome)}</td>
        <td>${escapeHtml(processoOuTraco(p.numero_processo))}</td>
        <td>${escapeHtml(p.parte)}</td>
        <td>${escapeHtml(p.advogado || "—")}</td>
        <td>${escapeHtml(brDate(p.data_limite))}</td>
        <td>${escapeHtml(p.status === "Concluído" ? "—" : String(diasRestantes(p.data_limite)))}</td>
        <td>${escapeHtml(SITUACAO_LABEL[s])}</td>
      </tr>`;
    }).join("");
    const body = `
      <h1>Lista de Prazos</h1>
      <div class="meta muted">${lista.length} prazo(s) · filtros e ordenação atuais aplicados</div>
      <table><thead><tr><th>Nome</th><th>Processo</th><th>Parte</th><th>Advogado</th><th>Data Limite</th><th>Dias</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="print-date">Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))}</div>`;
    printHtml("Lista de Prazos", body);
  }

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let rows = (data ?? []).filter((p) => {
      if (termo) {
        const hay = `${p.nome} ${p.numero_processo ?? ""} ${p.advogado ?? ""}`.toLowerCase();
        if (!hay.includes(termo)) return false;
      }
      if (filtro === "Todos") return true;
      if (filtro === "Em andamento") return p.status === "Em andamento";
      if (filtro === "Concluídos") return p.status === "Concluído";
      return situacaoDoPrazo(p) === FILTRO_SITUACAO[filtro];
    });
    const ordemStatus: Record<Situacao, number> = {
      vencido: 0, hoje: 1, critico: 2, atencao: 3, normal: 4, concluido: 5,
    };
    rows = [...rows].sort((a, b) => {
      if (ordem === "nome") return a.nome.localeCompare(b.nome, "pt-BR");
      if (ordem === "advogado") return (a.advogado ?? "").localeCompare(b.advogado ?? "", "pt-BR");
      if (ordem === "status") return ordemStatus[situacaoDoPrazo(a)] - ordemStatus[situacaoDoPrazo(b)];
      return a.data_limite.localeCompare(b.data_limite);
    });
    return rows;
  }, [data, busca, filtro, ordem]);

  useEffect(() => {
    setPagina(1);
  }, [busca, filtro, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(lista.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const listaPaginada = lista.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Prazos</h2>
          <p className="text-sm text-muted-foreground">Controle dos prazos com alertas automáticos por urgência.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={imprimirLista} variant="outline" className="min-h-11 w-full sm:w-auto" disabled={!lista.length}>
            <Printer className="mr-2 h-4 w-4" />Imprimir lista
          </Button>
          {podeGerenciar && (
            <Button onClick={abrirNovo} className="min-h-11 w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />Novo Prazo
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Buscar por nome, número do processo ou advogado"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="sm:flex-1"
            />
            <Select value={ordem} onValueChange={setOrdem}>
              <SelectTrigger className="sm:w-56"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
              <SelectContent>
                {ORDENACOES.map((o) => <SelectItem key={o.value} value={o.value}>Ordenar por {o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>{f}</Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y md:hidden">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : isError ? (
              <p className="py-8 text-center text-sm text-destructive">Não foi possível carregar os prazos.</p>
            ) : lista.length ? (
              listaPaginada.map((p) => {
                const s = situacaoDoPrazo(p);
                const dias = diasRestantes(p.data_limite);
                return (
                  <div key={p.id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words text-sm font-semibold text-foreground">{p.nome}</span>
                      <Badge variant="outline" className={`shrink-0 ${SITUACAO_CLASS[s]}`}>{SITUACAO_LABEL[s]}</Badge>
                    </div>
                    <p className="break-words text-sm text-muted-foreground">{processoOuTraco(p.numero_processo)}</p>
                    <p className="text-xs text-muted-foreground">{p.parte} · {p.advogado || "—"} · Limite: {brDate(p.data_limite)}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.status === "Concluído" ? `Concluído em ${brDate(p.data_conclusao)}` : `${dias} dia(s) restante(s)`} · Lembrete: {p.lembrete_ativo ? "ativo" : "desativado"}
                    </p>
                    {podeGerenciar && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="min-h-10" onClick={() => abrirEdicao(p)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>
                        {p.status !== "Concluído" && <Button size="sm" variant="outline" className="min-h-10" onClick={() => void concluir(p)}><CheckCircle2 className="mr-1 h-4 w-4" />Concluir</Button>}
                        <Button size="sm" variant="outline" className="min-h-10" onClick={() => setExcluindo(p)}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>
                        <Button size="sm" variant="outline" className="min-h-10" onClick={() => imprimirPrazo(p)}><Printer className="mr-1 h-4 w-4" />Imprimir</Button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : <p className="py-8 text-center text-sm text-muted-foreground">Nenhum prazo encontrado.</p>}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Número do Processo</TableHead><TableHead>Parte</TableHead><TableHead>Advogado</TableHead>
                <TableHead>Data Limite</TableHead><TableHead>Dias Restantes</TableHead><TableHead>Status</TableHead><TableHead>Lembrete</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                : isError ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-destructive">Não foi possível carregar os prazos.</TableCell></TableRow>
                : lista.length ? listaPaginada.map((p) => {
                  const s = situacaoDoPrazo(p);
                  return <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="text-xs">{processoOuTraco(p.numero_processo)}</TableCell>
                    <TableCell>{p.parte}</TableCell><TableCell>{p.advogado || "—"}</TableCell><TableCell>{brDate(p.data_limite)}</TableCell>
                    <TableCell>{p.status === "Concluído" ? "—" : diasRestantes(p.data_limite)}</TableCell>
                    <TableCell><Badge variant="outline" className={SITUACAO_CLASS[s]}>{SITUACAO_LABEL[s]}</Badge></TableCell>
                    <TableCell className="text-xs">{p.lembrete_ativo ? `${p.antecedencia_dias} dia(s) antes` : "Desativado"}</TableCell>
                    <TableCell className="text-right">
                      {podeGerenciar ? <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Editar" onClick={() => abrirEdicao(p)}><Pencil className="h-4 w-4" /></Button>
                        {p.status !== "Concluído" && <Button size="icon" variant="ghost" title="Concluir" onClick={() => void concluir(p)}><CheckCircle2 className="h-4 w-4" /></Button>}
                        <Button size="icon" variant="ghost" title="Excluir" onClick={() => setExcluindo(p)}><Trash2 className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Imprimir" onClick={() => imprimirPrazo(p)}><Printer className="h-4 w-4" /></Button>
                      </div> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>;
                }) : <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum prazo encontrado.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {lista.length > ITENS_POR_PAGINA && (
        <div className="flex items-center justify-end gap-1" aria-label="Paginação dos prazos">
          <Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaAtual === 1}>Anterior</Button>
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
            <Button key={n} size="sm" variant={paginaAtual === n ? "default" : "outline"} onClick={() => setPagina(n)}>{n}</Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas}>Próxima</Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editando ? "Editar Prazo" : "Novo Prazo"}</DialogTitle><DialogDescription>Informe os dados do prazo e configure o lembrete.</DialogDescription></DialogHeader>
          <form onSubmit={salvar} className="space-y-4">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Número do Processo</Label><Input value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} placeholder="Opcional" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Parte</Label><Select value={form.parte} onValueChange={(v) => setForm({ ...form, parte: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PARTES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Advogado</Label><Input value={form.advogado} onChange={(e) => setForm({ ...form, advogado: e.target.value })} placeholder="Nome do advogado" /></div>
            </div>
            <div className="space-y-1.5"><Label>Data Limite *</Label><Input type="date" value={form.data_limite} onChange={(e) => setForm({ ...form, data_limite: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Observação</Label><Textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></div>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2"><Checkbox id="lembrete" checked={form.lembrete_ativo} onCheckedChange={(v) => setForm({ ...form, lembrete_ativo: v === true })} /><Label htmlFor="lembrete" className="cursor-pointer">Ativar lembrete</Label></div>
              {form.lembrete_ativo && <>
                <div className="space-y-1.5"><Label>Antecedência do lembrete</Label><Select value={String(form.antecedencia_dias)} onValueChange={(v) => setForm({ ...form, antecedencia_dias: Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ANTECEDENCIA_DIAS_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="flex items-center gap-2"><Checkbox id="repetir" checked={form.repetir_alerta_diariamente} onCheckedChange={(v) => setForm({ ...form, repetir_alerta_diariamente: v === true })} /><Label htmlFor="repetir" className="cursor-pointer">Repetir alerta diariamente</Label></div>
              </>}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md"><AlertDialogHeader><AlertDialogTitle>Excluir prazo?</AlertDialogTitle><AlertDialogDescription>{excluindo ? `${excluindo.nome} · ${brDate(excluindo.data_limite)}` : ""} — esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); void excluir(); }}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="h-4 w-4" />Os lembretes aparecem automaticamente enquanto você estiver no sistema.</div>
    </div>
  );
}
