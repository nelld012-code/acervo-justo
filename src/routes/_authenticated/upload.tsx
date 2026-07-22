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
import { UploadCloud, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { TIPOS_DOCUMENTO, MATERIAS, ESTADOS, CONFIDENCIALIDADES, buildStoragePath, logAudit, type Cliente } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Enviar Documento - Gestão Judicial" }] }),
  component: UploadPage,
});

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
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

  function handleFile(f: File) {
    if (!ACCEPTED.includes(f.type)) {
      toast.error("Formato não suportado", { description: "Aceitamos PDF, DOCX, PNG ou JPG." });
      return;
    }
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Selecione um arquivo");
      return;
    }
    // Validate required
    const required: (keyof typeof form)[] = ["advogado", "numero_processo", "data_documento", "tipo_documento", "cliente", "materia", "estado_processual", "confidencialidade"];
    for (const k of required) {
      if (!form[k]) {
        toast.error("Preencha todos os campos obrigatórios", { description: `Campo faltando: ${k}` });
        return;
      }
    }
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const ext = file.name.split(".").pop() ?? "bin";
      const storagePath = buildStoragePath({
        cliente: form.cliente,
        numero_processo: form.numero_processo,
        tipo_documento: form.tipo_documento,
        data_documento: form.data_documento,
        originalExt: ext,
      });

      // Check for existing doc with same numero_processo + tipo -> version bump
      const { data: existing } = await supabase
        .from("documents")
        .select("id, current_version")
        .eq("numero_processo", form.numero_processo)
        .eq("tipo_documento", form.tipo_documento)
        .maybeSingle();

      const finalPath = existing ? `${storagePath.replace(/\.([^.]+)$/, `_v${existing.current_version + 1}.$1`)}` : storagePath;

      const { error: upErr } = await supabase.storage.from("legal_docs").upload(finalPath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;

      const palavras = form.palavras_chave
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (existing) {
        const newVersion = existing.current_version + 1;
        const { error: verErr } = await supabase.from("document_versions").insert({
          document_id: existing.id,
          version_number: newVersion,
          file_url: finalPath,
          file_name: file.name,
          file_size: Math.round(file.size / 1024),
          uploaded_by: userId,
          change_notes: "Nova versão enviada",
        });
        if (verErr) throw verErr;

        const { error: updErr } = await supabase
          .from("documents")
          .update({
            file_url: finalPath,
            file_name: file.name,
            file_size: Math.round(file.size / 1024),
            current_version: newVersion,
          })
          .eq("id", existing.id);
        if (updErr) throw updErr;

        await logAudit(existing.id, "uploaded", { version: newVersion });
        toast.success(`Nova versão (v${newVersion}) registrada`);
        navigate({ to: "/search" });
      } else {
        const insertPayload = {
          advogado: form.advogado,
          numero_processo: form.numero_processo,
          data_documento: form.data_documento,
          data_processo: form.data_processo || null,
          tipo_documento: form.tipo_documento,
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
          file_url: finalPath,
          file_name: file.name,
          file_size: Math.round(file.size / 1024),
          created_by: userId,
          internal_id: "", // will be auto-generated by trigger
        };
        const { data: inserted, error: insErr } = await supabase
          .from("documents")
          .insert(insertPayload)
          .select("id, internal_id")
          .single();
        if (insErr) throw insErr;

        await supabase.from("document_versions").insert({
          document_id: inserted.id,
          version_number: 1,
          file_url: finalPath,
          file_name: file.name,
          file_size: Math.round(file.size / 1024),
          uploaded_by: userId,
          change_notes: "Versão inicial",
        });

        await logAudit(inserted.id, "uploaded", { internal_id: inserted.internal_id });
        toast.success(`Documento ${inserted.internal_id} cadastrado`);
        navigate({ to: "/search" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Falha no envio", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Enviar Documento</h2>
        <p className="text-sm text-muted-foreground">Envie um arquivo (PDF, DOCX, PNG ou JPG) e preencha os metadados.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${drag ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <UploadCloud className="h-12 w-12 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">Arraste um arquivo ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground">PDF, DOCX, PNG ou JPG</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {file && (
        <Card>
          <CardHeader>
            <CardTitle>Metadados do Documento</CardTitle>
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
                <Button type="button" variant="outline" onClick={() => { setFile(null); }}>Cancelar</Button>
                <Button type="submit" disabled={submitting}>{submitting ? "Enviando..." : "Salvar Documento"}</Button>
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