import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type DistribuicaoAcao = {
  id: string;
  titulo: string;
  data_atendimento: string | null;
  cliente: string;
  data_passada_advogado: string | null;
  classe: string | null;
  natureza: string | null;
  assinatura: string | null;
  data_devolvida_advogado: string | null;
  numero_processo: string | null;
  assinatura_final: string | null;
  created_by: string | null;
  created_at: string;
};

type DistribuicaoForm = {
  titulo: string;
  data_atendimento: string;
  cliente: string;
  data_passada_advogado: string;
  classe: string;
  natureza: string;
  assinatura: string;
  data_devolvida_advogado: string;
  numero_processo: string;
  assinatura_final: string;
};

const emptyForm = (): DistribuicaoForm => ({
  titulo: "",
  data_atendimento: "",
  cliente: "",
  data_passada_advogado: "",
  classe: "",
  natureza: "",
  assinatura: "",
  data_devolvida_advogado: "",
  numero_processo: "",
  assinatura_final: "",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export const Route = createFileRoute("/_authenticated/distribuicao")({
  beforeLoad: async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw redirect({ to: "/auth" });

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("cargo")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error || profile?.cargo !== "administrador") {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Distribuição — Gestão Judicial" },
      { name: "description", content: "Cadastro e acompanhamento de novas ações." },
    ],
  }),
  component: DistribuicaoPage,
});

function DistribuicaoPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<DistribuicaoForm>(emptyForm);
  const [editing, setEditing] = useState<DistribuicaoAcao | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DistribuicaoAcao | null>(null);

  const { data: registros = [], isLoading, isError } = useQuery({
    queryKey: ["distribuicao-acoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuicao_acoes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DistribuicaoAcao[];
    },
  });

  function limparFormulario() {
    setForm(emptyForm());
    setEditing(null);
  }

  function editarRegistro(registro: DistribuicaoAcao) {
    setEditing(registro);
    setForm({
      titulo: registro.titulo ?? "",
      data_atendimento: registro.data_atendimento ?? "",
      cliente: registro.cliente ?? "",
      data_passada_advogado: registro.data_passada_advogado ?? "",
      classe: registro.classe ?? "",
      natureza: registro.natureza ?? "",
      assinatura: registro.assinatura ?? "",
      data_devolvida_advogado: registro.data_devolvida_advogado ?? "",
      numero_processo: registro.numero_processo ?? "",
      assinatura_final: registro.assinatura_final ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      toast.error("Preencha o título após “Ações Novas:”.");
      return;
    }
    if (!form.data_atendimento) {
      toast.error("Informe a data de atendimento.");
      return;
    }
    if (!form.cliente.trim()) {
      toast.error("Informe o cliente.");
      return;
    }

    setSaving(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Sessão expirada. Entre novamente no sistema.");

      const payload = {
        titulo: form.titulo.trim(),
        data_atendimento: form.data_atendimento || null,
        cliente: form.cliente.trim(),
        data_passada_advogado: form.data_passada_advogado || null,
        classe: form.classe.trim() || null,
        natureza: form.natureza.trim() || null,
        assinatura: form.assinatura.trim() || null,
        data_devolvida_advogado: form.data_devolvida_advogado || null,
        numero_processo: form.numero_processo.trim() || null,
        assinatura_final: form.assinatura_final.trim() || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("distribuicao_acoes")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Distribuição atualizada.");
      } else {
        const { error } = await supabase
          .from("distribuicao_acoes")
          .insert({ ...payload, created_by: auth.user.id });
        if (error) throw error;
        toast.success("Distribuição registrada.");
      }

      limparFormulario();
      await queryClient.invalidateQueries({ queryKey: ["distribuicao-acoes"] });
    } catch (error) {
      toast.error("Não foi possível salvar a distribuição.", {
        description: error instanceof Error ? error.message : "Erro desconhecido.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function excluirRegistro() {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("distribuicao_acoes").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Registro excluído.");
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["distribuicao-acoes"] });
    } catch (error) {
      toast.error("Não foi possível excluir o registro.", {
        description: error instanceof Error ? error.message : "Erro desconhecido.",
      });
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Distribuição</h1>
          <p className="text-sm text-muted-foreground">Cadastro e controle de ações novas.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Editar distribuição" : "Nova distribuição"}</CardTitle>
          <CardDescription>Preencha os dados na ordem do formulário de distribuição.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void salvar(e)} className="space-y-5">
            <div className="flex min-w-0 items-center gap-3 rounded-md border bg-muted/20 p-3">
              <Label htmlFor="distribuicao-titulo" className="shrink-0 text-base font-semibold">Ações Novas:</Label>
              <Input
                id="distribuicao-titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Digite o título em uma única linha"
                className="min-w-0 flex-1 bg-background"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="data-atendimento">Data de atendimento *</Label>
                <Input id="data-atendimento" type="date" value={form.data_atendimento} onChange={(e) => setForm({ ...form, data_atendimento: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente">Cliente *</Label>
                <Input id="cliente" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} placeholder="Nome do cliente" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-passada">Data passada para o adv.</Label>
                <Input id="data-passada" type="date" value={form.data_passada_advogado} onChange={(e) => setForm({ ...form, data_passada_advogado: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="classe">Classe</Label>
                <Input id="classe" value={form.classe} onChange={(e) => setForm({ ...form, classe: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="natureza">Natureza</Label>
                <Input id="natureza" value={form.natureza} onChange={(e) => setForm({ ...form, natureza: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assinatura">Assinatura</Label>
                <Input id="assinatura" value={form.assinatura} onChange={(e) => setForm({ ...form, assinatura: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-devolvida">Data devolvida pelo adv.</Label>
                <Input id="data-devolvida" type="date" value={form.data_devolvida_advogado} onChange={(e) => setForm({ ...form, data_devolvida_advogado: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="numero-processo">Número de processo</Label>
                <Input id="numero-processo" value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assinatura-final">Assinatura</Label>
                <Input id="assinatura-final" value={form.assinatura_final} onChange={(e) => setForm({ ...form, assinatura_final: e.target.value })} aria-label="Assinatura final" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : editing ? "Salvar alterações" : "Salvar distribuição"}</Button>
              {editing && <Button type="button" variant="outline" onClick={limparFormulario} disabled={saving}><X className="mr-2 h-4 w-4" />Cancelar edição</Button>}
              {!editing && <Button type="button" variant="outline" onClick={limparFormulario} disabled={saving}>Limpar</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros de distribuição</CardTitle>
          <CardDescription>{registros.length} registro(s) cadastrado(s).</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-4 sm:pt-0">
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">Carregando registros...</p>
            : isError ? <p className="p-4 text-sm text-destructive">Não foi possível carregar os registros.</p>
            : registros.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma distribuição cadastrada.</p>
            : <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Ações Novas</TableHead><TableHead>Data atendimento</TableHead><TableHead>Cliente</TableHead>
                  <TableHead>Data passada adv.</TableHead><TableHead>Classe</TableHead><TableHead>Natureza</TableHead>
                  <TableHead>Assinatura</TableHead><TableHead>Data devolvida adv.</TableHead><TableHead>Número de processo</TableHead><TableHead>Assinatura</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {registros.map((registro) => <TableRow key={registro.id}>
                    <TableCell className="max-w-64 truncate font-medium" title={registro.titulo}>{registro.titulo}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(registro.data_atendimento)}</TableCell>
                    <TableCell>{registro.cliente}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(registro.data_passada_advogado)}</TableCell>
                    <TableCell>{registro.classe || "—"}</TableCell>
                    <TableCell>{registro.natureza || "—"}</TableCell>
                    <TableCell>{registro.assinatura || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(registro.data_devolvida_advogado)}</TableCell>
                    <TableCell>{registro.numero_processo || "—"}</TableCell>
                    <TableCell>{registro.assinatura_final || "—"}</TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      <Button type="button" size="icon" variant="ghost" title="Editar" onClick={() => editarRegistro(registro)}><Pencil className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" title="Excluir" onClick={() => setDeleteTarget(registro)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div></TableCell>
                  </TableRow>)}
                </TableBody>
              </Table>
            </div>}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir distribuição?</AlertDialogTitle><AlertDialogDescription>O registro de “{deleteTarget?.titulo}” será excluído permanentemente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); void excluirRegistro(); }}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
