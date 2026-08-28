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
import { CalendarClock, CheckCircle2, Eye, FileSpreadsheet, Upload, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { StandardPagination } from "@/components/standard-pagination";
import { logAudit } from "@/lib/documents";
import { exportToExcel } from "@/lib/export-excel";
import { parsePrazosExcel, type ImportPrazoRow } from "@/lib/import-excel";
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
  "Próximos 3 dias", "Próximos 7 dias",
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

/** Campos que a importação pode atualizar em um prazo já existente. */
type CampoAtualizavel = "nome" | "parte" | "advogado" | "data_limite" | "status" | "observacao" | "data_conclusao";

type ImportUpdate = {
  prazo: Prazo;
  patch: Partial<Record<CampoAtualizavel, string>>;
  mudancas: { rotulo: string; de: string; para: string }[];
};

const CAMPOS_LABEL: Record<CampoAtualizavel, string> = {
  nome: "Nome",
  parte: "Parte",
  advogado: "Advogado",
  data_limite: "Data limite",
  status: "Status",
  observacao: "Observação",
  data_conclusao: "Data de conclusão",
};

function chaveProcesso(valor: string | null | undefined) {
  return (valor ?? "").replace(/\D/g, "") || (valor ?? "").trim().toLowerCase();
}

const ADVOGADOS = ["Dr. Dimas", "Dra Cassia", "Dr. Wesley"] as const;

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
  status: "Em andamento" as "Em andamento" | "Concluído",
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

function printHtml(title: string, body: string, orientation: "portrait" | "landscape" = "portrait") {
  const win = window.open("", "_blank", "width=1000,height=800");
  if (!win || !win.document) {
    toast.error("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
    return;
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4 ${orientation}; margin: 14mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .muted { color: #555; }
    .meta { margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    th { background: #eee; }
    .print-table { table-layout: fixed; }
    .col-nome { width: 18%; }
    .col-processo { width: 20%; }
    .col-advogado { width: 14%; }
    .col-data { width: 12%; }
    .col-obs { width: 36%; }
    .obs-cell { white-space: pre-wrap; word-wrap: break-word; max-width: 260px; }
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
  const [advogadoFiltro, setAdvogadoFiltro] = useState("Todos");
  const [dataDesde, setDataDesde] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [ordem, setOrdem] = useState<string>("data_limite");
  const [pagina, setPagina] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [prazoDetalhes, setPrazoDetalhes] = useState<Prazo | null>(null);
  const [editando, setEditando] = useState<Prazo | null>(null);
  const [excluindo, setExcluindo] = useState<Prazo | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [salvando, setSalvando] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportPrazoRow[]>([]);
  const [importAtualizacoes, setImportAtualizacoes] = useState<ImportUpdate[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    const filtroSolicitado = new URLSearchParams(window.location.search).get("filtroPrazo");
    if (filtroSolicitado && (FILTROS as readonly string[]).includes(filtroSolicitado)) {
      setFiltro(filtroSolicitado as Filtro);
    }
  }, []);

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
      status: p.status === "Concluído" ? "Concluído" : "Em andamento",
    });
    setDialogOpen(true);
  }

  function abrirDetalhes(p: Prazo) {
    setPrazoDetalhes(p);
    setDetalhesOpen(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return toast.error("Informe o nome.");
    if (!form.data_limite) return toast.error("Informe a data limite.");
    setSalvando(true);
    try {
      const dataConclusao = form.status === "Concluído"
        ? (editando?.data_conclusao ?? new Date().toISOString().slice(0, 10))
        : null;
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
        status: form.status,
        data_conclusao: dataConclusao,
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
      .update({ status: "Concluído", data_conclusao: new Date().toISOString().slice(0, 10) })
      .eq("id", p.id);
    if (error) return toast.error("Não foi possível concluir o prazo.");
    await logAudit(null, "edited", { entidade: "prazo", prazo_id: p.id, acao: "conclusao" });
    toast.success("Prazo concluído.");
    refresh();
  }

  async function excluir() {
    if (!excluindo) return;
    const id = excluindo.id;
    const { error } = await supabase.from("prazos").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir o prazo.");
    await logAudit(null, "deleted", { entidade: "prazo", prazo_id: id });
    setExcluindo(null);
    toast.success("Prazo excluído.");
    refresh();
  }

  function imprimirPrazo(p: Prazo) {
    const status = situacaoDoPrazo(p);
    const body = `
      <h1>${escapeHtml(p.nome)}</h1>
      <div class="item">
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
      return `<tr>
        <td class="col-nome">${escapeHtml(p.nome)}</td>
        <td class="col-processo">${escapeHtml(processoOuTraco(p.numero_processo))}</td>
        <td class="col-advogado">${escapeHtml(p.advogado || "—")}</td>
        <td class="col-data">${escapeHtml(brDate(p.data_limite))}</td>
        <td class="col-obs">${escapeHtml(p.observacao || "—")}</td>
      </tr>`;
    }).join("");
    const body = `
      <h1>Lista de Prazos</h1>
      <div class="meta muted">${lista.length} prazo(s) · filtros e ordenação atuais aplicados</div>
      <table class="print-table">
        <thead>
          <tr>
            <th class="col-nome">Nome</th>
            <th class="col-processo">Processo</th>
            <th class="col-advogado">Advogado</th>
            <th class="col-data">Data Limite</th>
            <th class="col-obs">Observação</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="print-date">Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))}</div>`;
    printHtml("Lista de Prazos", body, "landscape");
  }

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let rows = (data ?? []).filter((p) => {
      if (termo) {
        const hay = `${p.nome} ${p.numero_processo ?? ""} ${p.advogado ?? ""}`.toLowerCase();
        if (!hay.includes(termo)) return false;
      }

      if (advogadoFiltro !== "Todos" && (p.advogado ?? "") !== advogadoFiltro) return false;
      if (dataDesde && p.data_limite < dataDesde) return false;
      if (dataAte && p.data_limite > dataAte) return false;

      const situacao = situacaoDoPrazo(p);
      if (filtro === "Todos") return true;
      if (filtro === "Em andamento") return p.status === "Em andamento";
      if (filtro === "Concluídos") return p.status === "Concluído";
      if (filtro === "Próximos 3 dias") {
        return p.status !== "Concluído" && ["normal", "atencao", "critico"].includes(situacao)
          && diasRestantes(p.data_limite) >= 1 && diasRestantes(p.data_limite) <= 3;
      }
      if (filtro === "Próximos 7 dias") {
        return p.status !== "Concluído" && ["normal", "atencao", "critico"].includes(situacao)
          && diasRestantes(p.data_limite) >= 1 && diasRestantes(p.data_limite) <= 7;
      }
      return situacao === FILTRO_SITUACAO[filtro];
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
  }, [data, busca, filtro, advogadoFiltro, dataDesde, dataAte, ordem]);

  function abrirImportacao() {
    setImportRows([]);
    setImportAtualizacoes([]);
    setImportErrors([]);
    setImportFileName("");
    setImportOpen(true);
  }

  async function selecionarExcel(file: File | undefined) {
    if (!file) return;
    setImportFileName(file.name);
    setImportRows([]);
    setImportAtualizacoes([]);
    setImportErrors([]);
    try {
      const rows = await parsePrazosExcel(file);
      const erros: string[] = [];
      const porProcesso = new Map<string, Prazo>();
      for (const p of data ?? []) {
        const chave = chaveProcesso(p.numero_processo);
        if (chave && !porProcesso.has(chave)) porProcesso.set(chave, p);
      }

      const novos: ImportPrazoRow[] = [];
      const atualizacoes: ImportUpdate[] = [];
      const vistosNovos = new Set<string>();
      const vistosProcesso = new Set<string>();

      rows.forEach((row, index) => {
        const linha = index + 2;
        const chaveProc = chaveProcesso(row.numero_processo);
        const existente = chaveProc ? porProcesso.get(chaveProc) : undefined;

        if (existente) {
          if (vistosProcesso.has(chaveProc)) {
            erros.push(`Linha ${linha}: expediente ${row.numero_processo} repetido na planilha.`);
            return;
          }
          vistosProcesso.add(chaveProc);

          const valores: Partial<Record<CampoAtualizavel, string | null>> = {
            nome: row.nome || null,
            parte: row.parte || null,
            advogado: row.advogado,
            data_limite: row.data_limite || null,
            status: row.status || null,
            observacao: row.observacao,
            data_conclusao: row.data_conclusao,
          };

          const patch: Partial<Record<CampoAtualizavel, string>> = {};
          const mudancas: ImportUpdate["mudancas"] = [];
          (Object.keys(valores) as CampoAtualizavel[]).forEach((campo) => {
            const novo = valores[campo];
            if (novo === null || novo === undefined || novo === "") return;
            const atual = existente[campo] ?? null;
            if ((atual ?? "") === novo) return;
            patch[campo] = novo;
            const isData = campo === "data_limite" || campo === "data_conclusao";
            mudancas.push({
              rotulo: CAMPOS_LABEL[campo],
              de: isData ? brDate(atual) : (atual || "—"),
              para: isData ? brDate(novo) : novo,
            });
          });

          if (mudancas.length) atualizacoes.push({ prazo: existente, patch, mudancas });
          return;
        }

        if (!row.nome) {
          erros.push(`Linha ${linha}: Nome não informado.`);
          return;
        }
        if (!row.data_limite) {
          erros.push(`Linha ${linha}: Data Limite inválida ou não informada.`);
          return;
        }
        const chave = `${row.nome.trim().toLowerCase()}|${chaveProc}|${row.data_limite}`;
        if (vistosNovos.has(chave)) {
          erros.push(`Linha ${linha}: possível registro duplicado (${row.nome} · ${brDate(row.data_limite)}).`);
          return;
        }
        vistosNovos.add(chave);
        novos.push(row);
      });

      setImportRows(novos);
      setImportAtualizacoes(atualizacoes);
      setImportErrors(erros);
      if (!novos.length && !atualizacoes.length && !erros.length) {
        toast.error("O Excel não contém registros novos ou alterações a aplicar.");
      }
    } catch (err) {
      toast.error("Não foi possível ler o Excel.", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function importarPrazos() {
    if (!importRows.length && !importAtualizacoes.length) return;
    setImportando(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");

      const payload = importRows.map((row) => ({
        nome: row.nome,
        numero_processo: row.numero_processo,
        parte: row.parte,
        advogado: row.advogado,
        data_limite: row.data_limite,
        status: row.status === "Concluído" ? "Concluído" : "Em andamento",
        observacao: row.observacao,
        data_conclusao: row.data_conclusao,
        lembrete_ativo: true,
        antecedencia_dias: 3,
        repetir_alerta_diariamente: true,
        created_by: auth.user.id,
      }));

      if (payload.length) {
        const { error } = await supabase.from("prazos").insert(payload);
        if (error) throw error;
      }

      for (const item of importAtualizacoes) {
        const patch = { ...item.patch };
        if (patch.status && patch.status !== "Concluído") patch.status = "Em andamento";
        const { error } = await supabase.from("prazos").update(patch).eq("id", item.prazo.id);
        if (error) throw error;
      }

      await logAudit(null, "uploaded", {
        entidade: "prazo",
        acao: "importacao_excel",
        arquivo: importFileName,
        quantidade: payload.length,
        atualizados: importAtualizacoes.length,
      });

      toast.success("Importação concluída.", {
        description: `${payload.length} novo(s) prazo(s) criado(s), ${importAtualizacoes.length} prazo(s) atualizado(s), ${importErrors.length} erro(s).`,
      });
      setImportOpen(false);
      setImportRows([]);
      setImportAtualizacoes([]);
      setImportErrors([]);
      refresh();
    } catch (err) {
      const detalhe =
        err && typeof err === "object"
          ? [
              (err as { message?: string }).message,
              (err as { details?: string }).details,
              (err as { hint?: string }).hint,
              (err as { code?: string }).code ? `Código: ${(err as { code?: string }).code}` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : String(err);
      toast.error("Não foi possível importar os prazos.", { description: detalhe || undefined });
      console.error("Erro ao importar prazos:", err);
    } finally {
      setImportando(false);
    }
  }

  function exportarExcel() {
    if (!lista.length) {
      toast.error("Não há prazos para exportar.");
      return;
    }

    const headers = [
      "Nome", "Número do Processo", "Parte", "Advogado", "Data Limite", "Dias Restantes",
      "Status", "Situação", "Lembrete", "Antecedência", "Repetição diária", "Observação", "Data de Conclusão",
    ];

    const rows = lista.map((p) => [
      p.nome,
      processoOuTraco(p.numero_processo),
      p.parte,
      p.advogado || "—",
      brDate(p.data_limite),
      p.status === "Concluído" ? "—" : diasRestantes(p.data_limite),
      p.status,
      SITUACAO_LABEL[situacaoDoPrazo(p)],
      p.lembrete_ativo ? "Ativo" : "Desativado",
      p.lembrete_ativo ? `${p.antecedencia_dias} dia(s) antes` : "—",
      p.repetir_alerta_diariamente ? "Sim" : "Não",
      p.observacao || "—",
      brDate(p.data_conclusao),
    ]);

    try {
      exportToExcel("prazos_gestao_judicial.xlsx", headers, rows);
      toast.success("Prazos exportados para Excel com sucesso.", {
        description: `${lista.length} registro(s) exportado(s), respeitando os filtros e a ordenação atuais.`,
      });
    } catch (err) {
      toast.error("Não foi possível exportar os prazos para Excel.", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  useEffect(() => {
    setPagina(1);
  }, [busca, filtro, advogadoFiltro, dataDesde, dataAte, ordem]);

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
            <Button onClick={abrirImportacao} variant="outline" className="min-h-11 w-full sm:w-auto">
              <Upload className="mr-2 h-4 w-4" />Importar Excel
            </Button>
          )}
          {podeGerenciar && (
            <Button onClick={abrirNovo} className="min-h-11 w-full sm:ml-auto sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />Novo Prazo
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Vencidos", value: (data ?? []).filter((p) => situacaoDoPrazo(p) === "vencido").length, className: "border-destructive/40" },
          { label: "Vence hoje", value: (data ?? []).filter((p) => situacaoDoPrazo(p) === "hoje").length, className: "border-destructive/30" },
          { label: "Próximos 3 dias", value: (data ?? []).filter((p) => p.status !== "Concluído" && ["normal", "atencao", "critico"].includes(situacaoDoPrazo(p)) && diasRestantes(p.data_limite) >= 1 && diasRestantes(p.data_limite) <= 3).length, className: "border-orange-300/50" },
          { label: "Próximos 7 dias", value: (data ?? []).filter((p) => p.status !== "Concluído" && ["normal", "atencao", "critico"].includes(situacaoDoPrazo(p)) && diasRestantes(p.data_limite) >= 1 && diasRestantes(p.data_limite) <= 7).length, className: "border-yellow-300/50" },
          { label: "Em andamento", value: (data ?? []).filter((p) => p.status === "Em andamento").length, className: "border-green-300/50" },
        ].map((item) => (
          <Card key={item.label} className={item.className}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-bold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
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

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="filtro-advogado">Advogado</Label>
              <Select value={advogadoFiltro} onValueChange={setAdvogadoFiltro}>
                <SelectTrigger id="filtro-advogado"><SelectValue placeholder="Todos os advogados" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  {ADVOGADOS.map((advogado) => (
                    <SelectItem key={advogado} value={advogado}>{advogado}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="data-desde">Data limite desde</Label>
              <Input id="data-desde" type="date" value={dataDesde} onChange={(e) => setDataDesde(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="data-ate">Data limite até</Label>
              <Input id="data-ate" type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
            </div>
          </div>

          {(advogadoFiltro !== "Todos" || dataDesde || dataAte) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdvogadoFiltro("Todos");
                setDataDesde("");
                setDataAte("");
              }}
            >
              Limpar filtros adicionais
            </Button>
          )}
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
                return <div key={p.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="break-words font-medium">{p.nome}</p><p className="text-xs text-muted-foreground">{p.parte} · {p.advogado || "—"} · Limite: {brDate(p.data_limite)}</p></div>
                    <Badge variant="outline" className={`shrink-0 ${SITUACAO_CLASS[s]}`}>{SITUACAO_LABEL[s]}</Badge>
                  </div>
                  <p className="text-sm">Processo: {processoOuTraco(p.numero_processo)}</p>
                  <p className="text-xs text-muted-foreground">{p.status === "Concluído" ? `Concluído em ${brDate(p.data_conclusao)}` : `${dias} dia(s) restante(s)`} · Lembrete: {p.lembrete_ativo ? "ativo" : "desativado"}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => abrirDetalhes(p)}><Eye className="mr-1 h-4 w-4" />Ver</Button>
                    <Button size="sm" variant="outline" onClick={() => imprimirPrazo(p)}><Printer className="mr-1 h-4 w-4" />Imprimir</Button>
                    {podeGerenciar && p.status !== "Concluído" && <Button size="sm" variant="outline" onClick={() => void concluir(p)}><CheckCircle2 className="mr-1 h-4 w-4" />Concluir</Button>}
                    {podeGerenciar && <Button size="sm" variant="outline" onClick={() => abrirEdicao(p)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>}
                    {podeGerenciar && <Button size="sm" variant="destructive" onClick={() => setExcluindo(p)}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>}
                  </div>
                </div>;
              })
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum prazo encontrado.</p>
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Processo</TableHead><TableHead>Parte</TableHead><TableHead>Advogado</TableHead><TableHead>Data Limite</TableHead><TableHead>Dias</TableHead><TableHead>Situação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={8} className="py-8 text-center">Carregando...</TableCell></TableRow>
                  : isError ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-destructive">Não foi possível carregar os prazos.</TableCell></TableRow>
                  : lista.length ? listaPaginada.map((p) => {
                    const s = situacaoDoPrazo(p);
                    return <TableRow key={p.id}>
                      <TableCell className="max-w-56"><div className="truncate font-medium" title={p.nome}>{p.nome}</div></TableCell>
                      <TableCell className="max-w-48 truncate">{processoOuTraco(p.numero_processo)}</TableCell>
                      <TableCell>{p.parte}</TableCell><TableCell>{p.advogado || "—"}</TableCell><TableCell>{brDate(p.data_limite)}</TableCell>
                      <TableCell>{p.status === "Concluído" ? "—" : diasRestantes(p.data_limite)}</TableCell>
                      <TableCell><Badge variant="outline" className={SITUACAO_CLASS[s]}>{SITUACAO_LABEL[s]}</Badge></TableCell>
                      <TableCell><div className="flex flex-wrap gap-1.5"><Button size="sm" variant="outline" onClick={() => abrirDetalhes(p)}><Eye className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => imprimirPrazo(p)}><Printer className="h-4 w-4" /></Button>{podeGerenciar && p.status !== "Concluído" && <Button size="sm" variant="outline" onClick={() => void concluir(p)}><CheckCircle2 className="h-4 w-4" /></Button>}{podeGerenciar && <Button size="sm" variant="outline" onClick={() => abrirEdicao(p)}><Pencil className="h-4 w-4" /></Button>}{podeGerenciar && <Button size="sm" variant="destructive" onClick={() => setExcluindo(p)}><Trash2 className="h-4 w-4" /></Button>}</div></TableCell>
                    </TableRow>;
                  }) : <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum prazo encontrado.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {lista.length > 0 && <StandardPagination current={paginaAtual} total={totalPaginas} totalItems={lista.length} pageSize={ITENS_POR_PAGINA} onChange={setPagina} />}

      {lista.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={exportarExcel} variant="outline" className="min-h-11 w-full sm:w-auto" disabled={!lista.length}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Excel
          </Button>
        </div>
      )}

      <Dialog open={detalhesOpen} onOpenChange={setDetalhesOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-[730px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Prazo</DialogTitle>
            <DialogDescription>Todos os dados cadastrados para este prazo.</DialogDescription>
          </DialogHeader>
          {prazoDetalhes && (() => {
            const s = situacaoDoPrazo(prazoDetalhes);
            const dias = diasRestantes(prazoDetalhes.data_limite);
            return (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nome do prazo</p>
                    <p className="break-words text-base font-semibold text-foreground">{prazoDetalhes.nome}</p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${SITUACAO_CLASS[s]}`}>{SITUACAO_LABEL[s]}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Número do Processo</p><p className="break-words text-sm font-medium">{processoOuTraco(prazoDetalhes.numero_processo)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Parte</p><p className="text-sm font-medium">{prazoDetalhes.parte}</p></div>
                  <div><p className="text-xs text-muted-foreground">Advogado</p><p className="break-words text-sm font-medium">{prazoDetalhes.advogado || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Data Limite</p><p className="text-sm font-medium">{brDate(prazoDetalhes.data_limite)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Dias Restantes</p><p className="text-sm font-medium">{prazoDetalhes.status === "Concluído" ? "—" : dias}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><p className="text-sm font-medium">{prazoDetalhes.status}</p></div>
                  <div><p className="text-xs text-muted-foreground">Lembrete</p><p className="text-sm font-medium">{prazoDetalhes.lembrete_ativo ? "Ativo" : "Desativado"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Antecedência</p><p className="text-sm font-medium">{prazoDetalhes.lembrete_ativo ? `${prazoDetalhes.antecedencia_dias} dia(s) antes` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Repetição diária</p><p className="text-sm font-medium">{prazoDetalhes.lembrete_ativo ? (prazoDetalhes.repetir_alerta_diariamente ? "Sim" : "Não") : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Data de Conclusão</p><p className="text-sm font-medium">{brDate(prazoDetalhes.data_conclusao)}</p></div>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">Observação</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{prazoDetalhes.observacao || "—"}</p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetalhesOpen(false)}>Fechar</Button>
            {prazoDetalhes && <Button onClick={() => { setDetalhesOpen(false); abrirEdicao(prazoDetalhes); }}><Pencil className="mr-2 h-4 w-4" />Editar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Prazos do Excel</DialogTitle>
            <DialogDescription>Selecione sua planilha .xlsx. As colunas Dias Restantes e Situação são recalculadas automaticamente pelo sistema.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center">
              <Input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void selecionarExcel(e.target.files?.[0])} className="mx-auto max-w-md cursor-pointer" />
              {importFileName && <p className="mt-2 text-xs text-muted-foreground">{importFileName}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Colunas: Nome, Número do Processo, Parte, Advogado, Data Limite, Status, Observação e Data de Conclusão.</p>
            </div>
            {(importRows.length > 0 || importAtualizacoes.length > 0 || importErrors.length > 0) && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{importRows.length} novo(s)</Badge>
                <Badge variant="outline">{importAtualizacoes.length} atualização(ões)</Badge>
                <Badge variant="outline">{importErrors.length} erro(s)</Badge>
              </div>
            )}
            {importRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Novos prazos ({importRows.length})</p>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Processo</TableHead><TableHead>Parte</TableHead><TableHead>Data Limite</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>{importRows.slice(0, 50).map((row, index) => <TableRow key={`${row.nome}-${row.data_limite}-${index}`}><TableCell>{row.nome}</TableCell><TableCell>{row.numero_processo || "—"}</TableCell><TableCell>{row.parte}</TableCell><TableCell>{brDate(row.data_limite)}</TableCell><TableCell>{row.status}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
                {importRows.length > 50 && <p className="text-xs text-muted-foreground">Mostrando os primeiros 50 registros da pré-visualização.</p>}
              </div>
            )}
            {importAtualizacoes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Prazos que serão atualizados ({importAtualizacoes.length})</p>
                <div className="max-h-64 space-y-2 overflow-auto rounded-lg border p-3">
                  {importAtualizacoes.slice(0, 50).map((item) => (
                    <div key={item.prazo.id} className="rounded-md border border-border/60 p-2">
                      <p className="text-sm font-medium">{item.prazo.nome} · {processoOuTraco(item.prazo.numero_processo)}</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {item.mudancas.map((m) => <li key={m.rotulo}>{m.rotulo}: {m.de} → {m.para}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                {importAtualizacoes.length > 50 && <p className="text-xs text-muted-foreground">Mostrando as primeiras 50 atualizações.</p>}
              </div>
            )}
            {importErrors.length > 0 && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"><p className="mb-2 text-sm font-medium text-destructive">Registros que não serão importados</p><ul className="max-h-32 space-y-1 overflow-auto text-xs text-muted-foreground">{importErrors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={() => void importarPrazos()} disabled={(!importRows.length && !importAtualizacoes.length) || importando}>{importando ? "Importando..." : `Confirmar importação (${importRows.length} novo(s) · ${importAtualizacoes.length} atualização(ões))`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editando ? "Editar Prazo" : "Novo Prazo"}</DialogTitle><DialogDescription>Informe os dados do prazo e configure o lembrete.</DialogDescription></DialogHeader>
          <form onSubmit={salvar} className="space-y-4">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Número do Processo</Label><Input value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} placeholder="Opcional" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Parte</Label><Select value={form.parte} onValueChange={(v) => setForm({ ...form, parte: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PARTES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Advogado</Label><Select value={form.advogado} onValueChange={(v) => setForm({ ...form, advogado: v })}><SelectTrigger><SelectValue placeholder="Selecione o advogado" /></SelectTrigger><SelectContent>{Array.from(new Set([...ADVOGADOS, ...(form.advogado ? [form.advogado] : [])])).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div></div>
            <div className="space-y-1.5"><Label>Data Limite *</Label><Input type="date" value={form.data_limite} onChange={(e) => setForm({ ...form, data_limite: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Observação</Label><Textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "Em andamento" | "Concluído" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Em andamento">Em andamento</SelectItem><SelectItem value="Concluído">Concluído</SelectItem></SelectContent></Select></div>
            <div className="space-y-3 rounded-lg border border-border p-3"><div className="flex items-center gap-2"><Checkbox id="lembrete" checked={form.lembrete_ativo} onCheckedChange={(v) => setForm({ ...form, lembrete_ativo: v === true })} /><Label htmlFor="lembrete" className="cursor-pointer">Ativar lembrete</Label></div>{form.lembrete_ativo && <><div className="space-y-1.5"><Label>Antecedência do lembrete</Label><Select value={String(form.antecedencia_dias)} onValueChange={(v) => setForm({ ...form, antecedencia_dias: Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ANTECEDENCIA_DIAS_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="flex items-center gap-2"><Checkbox id="repetir" checked={form.repetir_alerta_diariamente} onCheckedChange={(v) => setForm({ ...form, repetir_alerta_diariamente: v === true })} /><Label htmlFor="repetir" className="cursor-pointer">Repetir alerta diariamente</Label></div></>}</div>
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
