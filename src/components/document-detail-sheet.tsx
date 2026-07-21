import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, ExternalLink } from "lucide-react";
import { type Documento, badgeVariantForStatus, formatFileSize, getSignedUrl, logAudit } from "@/lib/documents";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

type Version = {
  id: string;
  version_number: number;
  file_url: string;
  uploaded_at: string;
  change_notes: string | null;
};

type AuditEntry = {
  id: string;
  action: string;
  timestamp: string;
  user_id: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  viewed: "Visualização",
  uploaded: "Envio",
  edited: "Edição",
  deleted: "Exclusão",
  downloaded: "Download",
};

export function DocumentDetailSheet({ doc, open, onOpenChange }: { doc: Documento | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [audits, setAudits] = useState<AuditEntry[]>([]);

  useEffect(() => {
    if (!doc || !open) return;
    logAudit(doc.id, "viewed");
    (async () => {
      const [{ data: v }, { data: a }] = await Promise.all([
        supabase.from("document_versions").select("id, version_number, file_url, uploaded_at, change_notes").eq("document_id", doc.id).order("version_number", { ascending: false }),
        supabase.from("audit_logs").select("id, action, timestamp, user_id").eq("document_id", doc.id).order("timestamp", { ascending: false }).limit(50),
      ]);
      setVersions(v ?? []);
      setAudits(a ?? []);
    })();
  }, [doc, open]);

  async function handleDownload(url: string, name: string) {
    try {
      const signed = await getSignedUrl(url);
      const a = document.createElement("a");
      a.href = signed;
      a.download = name;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (doc) await logAudit(doc.id, "downloaded", { file_name: name });
    } catch (e) {
      toast.error("Falha ao baixar arquivo", { description: e instanceof Error ? e.message : "" });
    }
  }

  if (!doc) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{doc.internal_id}</SheetTitle>
          <SheetDescription>
            Processo {doc.numero_processo} — {doc.tipo_documento}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="versions">Histórico de Versões</TabsTrigger>
            <TabsTrigger value="audit">Auditoria</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={badgeVariantForStatus(doc.estado_processual)}>{doc.estado_processual}</Badge>
              <Badge variant="outline">{doc.materia}</Badge>
              <Badge variant="outline">{doc.confidencialidade}</Badge>
              <Badge variant="secondary">v{doc.current_version}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Info label="Advogado" value={doc.advogado} />
              <Info label="Cliente" value={doc.cliente} />
              <Info label="Parte Autora" value={doc.parte_autora} />
              <Info label="Parte Ré" value={doc.parte_re} />
              <Info label="Órgão Judicial" value={doc.orgao_judicial} />
              <Info label="Data do Documento" value={format(new Date(doc.data_documento), "dd/MM/yyyy")} />
              <Info label="Data de Ingresso" value={format(new Date(doc.data_ingresso), "dd/MM/yyyy")} />
              <Info label="Data do Processo" value={doc.data_processo ? format(new Date(doc.data_processo), "dd/MM/yyyy") : "—"} />
              <Info label="Arquivo" value={doc.file_name} />
              <Info label="Tamanho" value={formatFileSize(doc.file_size)} />
            </div>
            {doc.palavras_chave && doc.palavras_chave.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Palavras-chave</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {doc.palavras_chave.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => handleDownload(doc.file_url, doc.file_name)}>
                <Download className="mr-2 h-4 w-4" />Baixar arquivo atual
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="versions" className="pt-4">
            {versions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma versão registrada.</p> : (
              <ul className="space-y-3">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">Versão {v.version_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(v.uploaded_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                      {v.change_notes && <p className="mt-1 text-xs text-muted-foreground">{v.change_notes}</p>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleDownload(v.file_url, doc.file_name)}>
                      <ExternalLink className="mr-2 h-3 w-3" />Abrir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="audit" className="pt-4">
            {audits.length === 0 ? <p className="text-sm text-muted-foreground">Sem registros de auditoria.</p> : (
              <ul className="space-y-2">
                {audits.map((a) => (
                  <li key={a.id} className="flex items-center justify-between border-b py-2 text-sm last:border-none">
                    <Badge variant="outline">{ACTION_LABEL[a.action] ?? a.action}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(a.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-foreground">{value || "—"}</p>
    </div>
  );
}