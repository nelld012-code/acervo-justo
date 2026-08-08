import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import { printReport } from "@/lib/print-report";

export const Route = createFileRoute("/_authenticated/recepcao")({
  head: () => ({
    meta: [
      { title: "Recepção - Gestão Judicial" },
      {
        name: "description",
        content: "Registro de atendimentos da recepção: data, advogado, cliente, CPF, telefone e atendente.",
      },
      { property: "og:title", content: "Recepção - Gestão Judicial" },
      { property: "og:description", content: "Cadastre e consulte os atendimentos recebidos na recepção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecepcaoPage,
});

type Reception = {
  id: string;
  data: string;
  advogado: string;
  nome_cliente: string;
  cpf: string | null;
  telefone: string;
  atendente: string;
  created_at: string;
};

const emptyForm = {
  data: new Date().toISOString().slice(0, 10),
  advogado: "",
  nome_cliente: "",
  cpf: "",
  telefone: "",
  atendente: "",
};

function br(d: string) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function RecepcaoPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reception | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Reception | null>(null);
  const [busca, setBusca] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["reception-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reception_entries")
        .select("*")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Reception[];
    },
  });

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.nome_cliente, r.advogado, r.atendente, r.cpf ?? "", r.telefone].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [rows, busca]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(r: Reception) {
    setEditing(r);
    setForm({
      data: r.data,
      advogado: r.advogado,
      nome_cliente: r.nome_cliente,
      cpf: r.cpf ?? "",
      telefone: r.telefone,
      atendente: r.atendente,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.nome_cliente.trim()) return toast.error("Informe o nome do cliente");
    if (!form.telefone.trim()) return toast.error("Informe o telefone");
    if (!form.advogado.trim()) return toast.error("Informe o advogado");
    if (!form.atendente.trim()) return toast.error("Informe o atendente");
    setSaving(true);
    try {
      const payload = {
        data: form.data,
        advogado: form.advogado.trim(),
        nome_cliente: form.nome_cliente.trim(),
        cpf: form.cpf.trim() || null,
        telefone: form.telefone.trim(),
        atendente: form.atendente.trim(),
      };
      if (editing) {
        const { error } = await supabase.from("reception_entries").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Registro atualizado");
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("reception_entries")
          .insert({ ...payload, created_by: auth.user?.id ?? null });
        if (error) throw error;
        toast.success("Atendimento registrado");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["reception-entries"] });
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const { error } = await supabase.from("reception_entries").delete().eq("id", toDelete.id);
    if (error) {
      toast.error("Erro ao excluir", { description: error.message });
    } else {
      toast.success("Registro excluído");
      qc.invalidateQueries({ queryKey: ["reception-entries"] });
    }
    setToDelete(null);
  }

  function printOne(r: Reception) {
    printReport({
      title: "Registro de Recepção",
      subtitle: r.nome_cliente,
      sections: [
        {
          heading: "Dados do atendimento",
          columns: ["Campo", "Informação"],
          rows: [
            ["Data", br(r.data)],
            ["Advogado", r.advogado],
            ["Nome do cliente", r.nome_cliente],
            ["CPF", r.cpf || "—"],
            ["Telefone", r.telefone],
            ["Atendente", r.atendente],
          ],
        },
      ],
    });
  }

  function printList() {
    printReport({
      title: "Recepção — Registros de Atendimento",
      subtitle: `${filtered.length} registro(s)`,
      sections: [
        {
          columns: ["Data", "Advogado", "Nome do cliente", "CPF", "Telefone", "Atendente"],
          rows: filtered.map((r) => [br(r.data), r.advogado, r.nome_cliente, r.cpf || "—", r.telefone, r.atendente]),
        },
      ],
    });
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Recepção</h1>
          <p className="text-sm text-muted-foreground">Registro de atendimentos recebidos na recepção.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printList} className="flex-1 sm:flex-none">
            <Printer className="mr-2 h-4 w-4" /> Imprimir lista
          </Button>
          <Button onClick={openNew} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" /> Novo registro
          </Button>
        </div>
      </div>

      <Input
        placeholder="Buscar por cliente, advogado, atendente, CPF ou telefone"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Atendimentos ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum registro encontrado.</p>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="p-2">Data</th>
                      <th className="p-2">Advogado</th>
                      <th className="p-2">Nome do cliente</th>
                      <th className="p-2">CPF</th>
                      <th className="p-2">Telefone</th>
                      <th className="p-2">Atendente</th>
                      <th className="p-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{br(r.data)}</td>
                        <td className="p-2">{r.advogado}</td>
                        <td className="p-2 font-medium">{r.nome_cliente}</td>
                        <td className="p-2">{r.cpf || "—"}</td>
                        <td className="p-2 whitespace-nowrap">{r.telefone}</td>
                        <td className="p-2">{r.atendente}</td>
                        <td className="p-2">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Excluir" onClick={() => setToDelete(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Imprimir" onClick={() => printOne(r)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="space-y-3 p-3 md:hidden">
                {filtered.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{r.nome_cliente}</p>
                        <p className="text-xs text-muted-foreground">{br(r.data)}</p>
                      </div>
                    </div>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Advogado</dt>
                        <dd className="truncate text-right">{r.advogado}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">CPF</dt>
                        <dd className="text-right">{r.cpf || "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Telefone</dt>
                        <dd className="text-right">{r.telefone}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Atendente</dt>
                        <dd className="truncate text-right">{r.atendente}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Pencil className="mr-1 h-4 w-4" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setToDelete(r)}>
                        <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Excluir
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => printOne(r)}>
                        <Printer className="mr-1 h-4 w-4" /> Imprimir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar registro" : "Novo registro de atendimento"}</DialogTitle>
            <DialogDescription>Preencha os dados do atendimento da recepção.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="r-data">Data</Label>
              <Input id="r-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-adv">Advogado</Label>
              <Input id="r-adv" value={form.advogado} onChange={(e) => setForm({ ...form, advogado: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-cli">Nome do cliente</Label>
              <Input id="r-cli" value={form.nome_cliente} onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-cpf">CPF</Label>
              <Input id="r-cpf" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-tel">Telefone</Label>
              <Input id="r-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-at">Atendente</Label>
              <Input id="r-at" value={form.atendente} onChange={(e) => setForm({ ...form, atendente: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o atendimento de {toDelete?.nome_cliente}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
