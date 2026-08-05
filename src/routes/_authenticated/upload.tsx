import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadCloud, FileText, X, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { TIPOS_DOCUMENTO, MATERIAS, ESTADOS, CONFIDENCIALIDADES, buildStoragePath, logAudit, type Cliente } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Enviar Documento - Gestão Judicial" }] }),
  component: UploadPage,
});

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

type QueueItem = {
  id: string;
  file: File;
  tipo_documento: string;
  status: "pendente" | "enviando" | "concluido" | "erro";
  message?: string;
};

function AccessDenied({ msg }: { msg: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold text-foreground">Acesso restrito</h2>
      <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function UploadPage() {
  const { perms, isLoading: loadingPerms } = useProfile();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    advogado: "",
    numero_processo: "",
    data_documento: new Date().toISOString().slice(0, 10),
    data_processo: "",
    tipo_documento: "",
    cliente: "",
    cliente_id: "",
    valor_total_processo: "",
    parte_autora: "",
    parte_re: "",
    orgao_judicial: "",
    materia: "",
    estado_processual: "Aberto",
    confidencialidade: "Público",
    palavras_chave: "",
  });

  const { data: clientes } = useQuery({
    queryKey: ["clients-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, nome, telefone, cpf_cnpj, email, endereco, observacoes, created_at").order("nome");
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    const validos = files.filter((f) => ACCEPTED.includes(f.type));
    if (validos.length < files.length) {
      toast.error("Alguns arquivos foram ignorados", { description: "Aceitamos apenas PDF, DOCX, PNG ou JPG." });
    }
    if (!validos.length) return;
    setQueue((q) => [
      ...q,
      ...validos.map((f) => ({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        tipo_documento: form.tipo_documento,
        status: "pendente" as const,
      })),
    ]);
  }

  function removeFromQueue(id: string) {
    setQueue((q) => q.filter((i) => i.id !== id));
    setActiveId((a) => (a === id ? null : a));
  }

  function aplicarATodos() {
    if (!form.tipo_documento) {
      toast.error("Selecione um Tipo de Documento antes de aplicar a todos");
      return;
    }
    setQueue((q) => q.map((i) => (i.status === "concluido" ? i : { ...i, tipo_documento: form.tipo_documento })));
    toast.success("Metadados aplicados a todos os arquivos");
  }

  function setItemTipo(id: string, tipo: string) {
    setQueue((q) => q.map((i) => (i.id === id ? { ...i, tipo_documento: tipo } : i)));
  }

  async function uploadOne(item: QueueItem, userId: string) {
    const tipo = item.tipo_documento || form.tipo_documento;
    if (!tipo) throw new Error("Tipo de documento não definido");
    const file = item.file;
    const ext = file.name.split(".").pop() ?? "bin";
    const storagePath = buildStoragePath({
      cliente: form.cliente,
      numero_processo: form.numero_processo,
      tipo_documento: tipo,
      data_documento: form.data_documento,
      originalExt: ext,
    });

    const { data: existing } = await supabase
      .from("documents")
      .select("id, current_version")
      .eq("numero_processo", form.numero_processo)
      .eq("tipo_documento", tipo)
      .maybeSingle();

    const versionSuffix = existing ? existing.current_version + 1 : 0;
    const finalPath = existing
      ? storagePath.replace(/\.([^.]+)$/, `_v${versionSuffix}_${Date.now()}.$1`)
      : storagePath.replace(/\.([^.]+)$/, `_${Date.now()}.$1`);

    const { error: upErr } = await supabase.storage.from("legal_docs").upload(finalPath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) throw upErr;

    const fileMeta = {
      file_url: finalPath,
      file_name: file.name,
      file_size: Math.round(file.size / 1024),
    };

    const palavras = form.palavras_chave.split(",").map((s) => s.trim()).filter(Boolean);

    if (existing) {
      const newVersion = existing.current_version + 1;
      const { error: verErr } = await supabase.from("document_versions").insert({
        document_id: existing.id,
        version_number: newVersion,
        ...fileMeta,
        uploaded_by: userId,
        change_notes: "Nova versão enviada",
      });
      if (verErr) throw verErr;
      const { error: updErr } = await supabase
        .from("documents")
        .update({ ...fileMeta, current_version: newVersion })
        .eq("id", existing.id);
      if (updErr) throw updErr;
      await logAudit(existing.id, "uploaded", { version: newVersion });
      return `v${newVersion}`;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("documents")
      .insert({
        advogado: form.advogado,
        numero_processo: form.numero_processo,
        data_documento: form.data_documento,
        data_processo: form.data_processo || null,
        tipo_documento: tipo,
        cliente: form.cliente,
        cliente_id: form.cliente_id || null,
        valor_total_processo: form.valor_total_processo ? Number(form.valor_total_processo) : null,
        parte_autora: form.parte_autora || null,
        parte_re: form.parte_re || null,
        orgao_judicial: form.orgao_judicial || null,
        materia: form.materia,
        estado_processual: form.estado_processual,
        confidencialidade: form.confidencialidade,
        palavras_chave: palavras,
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
    return inserted.internal_id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pendentes = queue.filter((i) => i.status !== "concluido");
    if (!pendentes.length) {
      toast.error("Selecione ao menos um arquivo");
      return;
    }
    // Validate required
    const required: (keyof typeof form)[] = ["advogado", "numero_processo", "data_documento", "cliente", "materia", "estado_processual", "confidencialidade"];
    for (const k of required) {
      if (!form[k]) {
        toast.error("Preencha todos os campos obrigatórios", { description: `Campo faltando: ${k}` });
        return;
      }
    }
    const semTipo = pendentes.filter((i) => !(i.tipo_documento || form.tipo_documento));
    if (semTipo.length) {
      toast.error("Defina o Tipo de Documento de todos os arquivos", { description: "Use \"Aplicar a todos\" ou preencha individualmente." });
      return;
    }
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      let sucesso = 0;
      let falhas = 0;
      for (const item of pendentes) {
        setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "enviando", message: undefined } : i)));
        try {
          const ref = await uploadOne(item, userId);
          sucesso++;
          setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "concluido", message: ref } : i)));
        } catch (err) {
          falhas++;
          const msg = err instanceof Error ? err.message : "Erro desconhecido";
          setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "erro", message: msg } : i)));
        }
      }

      if (sucesso) toast.success(`${sucesso} arquivo(s) enviado(s) com sucesso`);
      if (falhas) toast.error(`${falhas} arquivo(s) falharam`, { description: "Verifique a lista e tente novamente." });
      if (sucesso && !falhas) navigate({ to: "/search" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Falha no envio", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }


  if (loadingPerms) return null;
  if (!perms.canManageDocuments) return <AccessDenied msg={"Seu cargo permite apenas a consulta de documentos."} />;

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Enviar Documento</h2>
        <p className="text-sm text-muted-foreground">Envie um ou vários arquivos (PDF, DOCX, PNG ou JPG) e preencha os metadados.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 sm:p-10 transition-colors ${drag ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
            />
            <UploadCloud className="h-12 w-12 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">Arraste vários arquivos ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, PNG ou JPG · seleção múltipla permitida</p>
          </div>
        </CardContent>
      </Card>

      {queue.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Arquivos selecionados ({queue.length})</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={aplicarATodos}>
              Aplicar a todos
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg border p-3 ${activeId === item.id ? "border-primary" : "border-border"}`}
              >
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setActiveId((a) => (a === item.id ? null : item.id))}
                  >
                    <p className="break-words text-sm font-medium text-foreground">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(item.file.size / 1024).toFixed(1)} KB · {item.tipo_documento || "Tipo não definido"}
                    </p>
                    {item.message && (
                      <p className="break-words text-xs text-muted-foreground">{item.message}</p>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.status === "enviando" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {item.status === "concluido" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    {item.status === "erro" && <AlertCircle className="h-4 w-4 text-destructive" />}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Remover da lista"
                      onClick={() => removeFromQueue(item.id)}
                      disabled={submitting}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {activeId === item.id && (
                  <div className="mt-3 space-y-1.5">
                    <Label>Tipo de Documento (deste arquivo)</Label>
                    <Select value={item.tipo_documento} onValueChange={(v) => setItemTipo(item.id, v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{TIPOS_DOCUMENTO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {queue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Metadados dos Documentos</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Advogado *"><Input value={form.advogado} onChange={(e) => set("advogado", e.target.value)} required /></Field>
              <Field label="Número do Processo *"><Input value={form.numero_processo} onChange={(e) => set("numero_processo", e.target.value)} required /></Field>
              <Field label="Cliente Cadastrado">
                <Select
                  value={form.cliente_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") { set("cliente_id", ""); return; }
                    const c = clientes?.find((x) => x.id === v);
                    setForm((f) => ({ ...f, cliente_id: v, cliente: c?.nome ?? f.cliente }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nenhum —</SelectItem>
                    {clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Cliente (nome) *"><Input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} required /></Field>
              <Field label="Valor Total do Processo (R$)">
                <Input type="number" step="0.01" min="0" value={form.valor_total_processo} onChange={(e) => set("valor_total_processo", e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Órgão Judicial"><Input value={form.orgao_judicial} onChange={(e) => set("orgao_judicial", e.target.value)} /></Field>
              <Field label="Parte Autora"><Input value={form.parte_autora} onChange={(e) => set("parte_autora", e.target.value)} /></Field>
              <Field label="Parte Ré"><Input value={form.parte_re} onChange={(e) => set("parte_re", e.target.value)} /></Field>
              <Field label="Data do Documento *"><Input type="date" value={form.data_documento} onChange={(e) => set("data_documento", e.target.value)} required /></Field>
              <Field label="Data do Processo"><Input type="date" value={form.data_processo} onChange={(e) => set("data_processo", e.target.value)} /></Field>
              <Field label="Tipo de Documento (padrão) *">
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ESTADOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Confidencialidade *">
                <Select value={form.confidencialidade} onValueChange={(v) => set("confidencialidade", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONFIDENCIALIDADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Label>Palavras-chave (separadas por vírgula)</Label>
                <Textarea value={form.palavras_chave} onChange={(e) => set("palavras_chave", e.target.value)} placeholder="urgente, prazo, recurso" />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setQueue([]); setActiveId(null); }} disabled={submitting}>Cancelar</Button>
                <Button type="submit" disabled={submitting}>{submitting ? "Enviando..." : "Enviar Todos"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}