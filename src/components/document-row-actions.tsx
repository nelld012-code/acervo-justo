import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Pencil, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import {
  TIPOS_DOCUMENTO,
  MATERIAS,
  ESTADOS,
  CONFIDENCIALIDADES,
  buildStoragePath,
  logAudit,
  type Documento,
} from "@/lib/documents";

const ACCEPTED = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Modal de edição dos metadados de um documento. */
export function DocumentEditDialog({
  doc,
  open,
  onOpenChange,
  onSaved,
}: {
  doc: Documento | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    advogado: "",
    numero_processo: "",
    cliente: "",
    tipo_documento: "",
    materia: "",
    estado_processual: "",
    confidencialidade: "",
    data_documento: "",
    data_processo: "",
    orgao_judicial: "",
    parte_autora: "",
    parte_re: "",
    palavras_chave: "",
  });

  useEffect(() => {
    if (!doc) return;
    setForm({
      advogado: doc.advogado ?? "",
      numero_processo: doc.numero_processo ?? "",
      cliente: doc.cliente ?? "",
      tipo_documento: doc.tipo_documento ?? "",
      materia: doc.materia ?? "",
      estado_processual: doc.estado_processual ?? "",
      confidencialidade: doc.confidencialidade ?? "",
      data_documento: doc.data_documento ?? "",
      data_processo: doc.data_processo ?? "",
      orgao_judicial: doc.orgao_judicial ?? "",
      parte_autora: doc.parte_autora ?? "",
      parte_re: doc.parte_re ?? "",
      palavras_chave: (doc.palavras_chave ?? []).join(", "),
    });
  }, [doc]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!doc) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          advogado: form.advogado,
          numero_processo: form.numero_processo,
          cliente: form.cliente,
          tipo_documento: form.tipo_documento,
          materia: form.materia,
          estado_processual: form.estado_processual,
          confidencialidade: form.confidencialidade,
          data_documento: form.data_documento,
          data_processo: form.data_processo || null,
          orgao_judicial: form.orgao_judicial || null,
          parte_autora: form.parte_autora || null,
          parte_re: form.parte_re || null,
          palavras_chave: form.palavras_chave
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        })
        .eq("id", doc.id);
      if (error) throw error;
      await logAudit(doc.id, "edited", { internal_id: doc.internal_id });
      toast.success("Documento atualizado");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error("Não foi possível salvar", {
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Documento</DialogTitle>
          <DialogDescription>Atualize os metadados de {doc?.internal_id}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Advogado *">
            <Input value={form.advogado} onChange={(e) => set("advogado", e.target.value)} required />
          </Field>
          <Field label="Número do Processo *">
            <Input value={form.numero_processo} onChange={(e) => set("numero_processo", e.target.value)} required />
          </Field>
          <Field label="Cliente *">
            <Input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} required />
          </Field>
          <Field label="Tipo de Documento *">
            <Select value={form.tipo_documento} onValueChange={(v) => set("tipo_documento", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{TIPOS_DOCUMENTO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Matéria *">
            <Select value={form.materia} onValueChange={(v) => set("materia", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{MATERIAS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Estado Processual *">
            <Select value={form.estado_processual} onValueChange={(v) => set("estado_processual", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{ESTADOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Confidencialidade *">
            <Select value={form.confidencialidade} onValueChange={(v) => set("confidencialidade", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{CONFIDENCIALIDADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Data do Documento *">
            <Input type="date" value={form.data_documento} onChange={(e) => set("data_documento", e.target.value)} required />
          </Field>
          <Field label="Data do Processo">
            <Input type="date" value={form.data_processo} onChange={(e) => set("data_processo", e.target.value)} />
          </Field>
          <Field label="Órgão Judicial">
            <Input value={form.orgao_judicial} onChange={(e) => set("orgao_judicial", e.target.value)} />
          </Field>
          <Field label="Parte Autora">
            <Input value={form.parte_autora} onChange={(e) => set("parte_autora", e.target.value)} />
          </Field>
          <Field label="Parte Ré">
            <Input value={form.parte_re} onChange={(e) => set("parte_re", e.target.value)} />
          </Field>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Palavras-chave (separadas por vírgula)</Label>
            <Textarea value={form.palavras_chave} onChange={(e) => set("palavras_chave", e.target.value)} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmação de exclusão de um documento. */
export function DocumentDeleteDialog({
  doc,
  open,
  onOpenChange,
  onDeleted,
}: {
  doc: Documento | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!doc) return;
    setDeleting(true);
    try {
      await logAudit(doc.id, "deleted", { internal_id: doc.internal_id });
      await supabase.from("audit_logs").delete().eq("document_id", doc.id);
      await supabase.from("document_versions").delete().eq("document_id", doc.id);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
      toast.success("Documento excluído");
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      toast.error("Não foi possível excluir", {
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja excluir este documento?</AlertDialogTitle>
          <AlertDialogDescription>
            {doc ? `${doc.internal_id} · ${doc.numero_processo} · ${doc.tipo_documento}` : ""} — esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void remove(); }}
            disabled={deleting}
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Anexar novo arquivo a um processo/cliente já existente.
 * Só pede o "Tipo de Documento" — cliente e número do processo vêm do contexto da linha.
 */
export function DocumentUploadDialog({
  doc,
  open,
  onOpenChange,
  onUploaded,
}: {
  doc: Documento | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploaded?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [tipo, setTipo] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setFile(null); setTipo(doc?.tipo_documento ?? ""); }
  }, [open, doc]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!doc) return;
    if (!file) return toast.error("Selecione um arquivo");
    if (!tipo) return toast.error("Selecione o tipo de documento");
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const ext = file.name.split(".").pop() ?? "bin";
      const data_documento = new Date().toISOString().slice(0, 10);
      const basePath = buildStoragePath({
        cliente: doc.cliente,
        numero_processo: doc.numero_processo,
        tipo_documento: tipo,
        data_documento,
        originalExt: ext,
      });

      const { data: existing } = await supabase
        .from("documents")
        .select("id, current_version")
        .eq("numero_processo", doc.numero_processo)
        .eq("tipo_documento", tipo)
        .maybeSingle();

      const finalPath = existing
        ? basePath.replace(/\.([^.]+)$/, `_v${existing.current_version + 1}.$1`)
        : basePath;

      const { error: upErr } = await supabase.storage
        .from("legal_docs")
        .upload(finalPath, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const fileMeta = {
        file_url: finalPath,
        file_name: file.name,
        file_size: Math.round(file.size / 1024),
      };

      if (existing) {
        const newVersion = existing.current_version + 1;
        await supabase.from("document_versions").insert({
          document_id: existing.id,
          version_number: newVersion,
          ...fileMeta,
          uploaded_by: userId,
          change_notes: "Nova versão enviada",
        });
        const { error: updErr } = await supabase
          .from("documents")
          .update({ ...fileMeta, current_version: newVersion })
          .eq("id", existing.id);
        if (updErr) throw updErr;
        await logAudit(existing.id, "uploaded", { version: newVersion });
        toast.success(`Nova versão (v${newVersion}) anexada`);
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("documents")
          .insert({
            advogado: doc.advogado,
            numero_processo: doc.numero_processo,
            data_documento,
            data_processo: doc.data_processo,
            tipo_documento: tipo,
            cliente: doc.cliente,
            cliente_id: doc.cliente_id ?? null,
            parte_autora: doc.parte_autora,
            parte_re: doc.parte_re,
            orgao_judicial: doc.orgao_judicial,
            materia: doc.materia,
            estado_processual: doc.estado_processual,
            confidencialidade: doc.confidencialidade,
            palavras_chave: doc.palavras_chave ?? [],
            ...fileMeta,
            created_by: userId,
            internal_id: "",
          })
          .select("id, internal_id")
          .single();
        if (insErr) throw insErr;
        await supabase.from("document_versions").insert({
          document_id: inserted.id,
          version_number: 1,
          ...fileMeta,
          uploaded_by: userId,
          change_notes: "Versão inicial",
        });
        await logAudit(inserted.id, "uploaded", { internal_id: inserted.internal_id });
        toast.success(`Documento ${inserted.internal_id} anexado ao processo`);
      }
      onOpenChange(false);
      onUploaded?.();
    } catch (err) {
      toast.error("Falha no envio", {
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anexar documento ao processo</DialogTitle>
          <DialogDescription>
            {doc ? `${doc.cliente} · ${doc.numero_processo}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Tipo de Documento *">
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{TIPOS_DOCUMENTO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (!ACCEPTED.includes(f.type)) {
                  toast.error("Formato não suportado", { description: "Aceitamos PDF, DOCX, PNG ou JPG." });
                  return;
                }
                setFile(f);
              }}
            />
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 break-words text-sm font-medium text-foreground">
              {file ? file.name : "Clique para selecionar o arquivo"}
            </p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, PNG ou JPG</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Enviando..." : "Enviar arquivo"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Hook utilitário: estado compartilhado das ações por linha. */
export function useDocumentRowActions(queryKeys: string[][]) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Documento | null>(null);
  const [deleting, setDeleting] = useState<Documento | null>(null);
  const [uploading, setUploading] = useState<Documento | null>(null);

  function refresh() {
    queryKeys.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
  }

  return { editing, setEditing, deleting, setDeleting, uploading, setUploading, refresh };
}

export const RowActionIcons = { Pencil, Trash2, UploadCloud };