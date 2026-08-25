import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText, Loader2 } from "lucide-react";

export const TIPOS_IMAGEM = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const TIPOS_DOCUMENTO_ANEXO = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const TIPOS_ANEXO_PERMITIDOS = [...TIPOS_IMAGEM, ...TIPOS_DOCUMENTO_ANEXO];
export const TAMANHO_MAX_ANEXO = 10 * 1024 * 1024;

export function ehImagem(tipo: string | null | undefined) {
  return !!tipo && TIPOS_IMAGEM.includes(tipo);
}

export function formatarTamanho(bytes: number | null | undefined) {
  const n = Number(bytes ?? 0);
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function assinar(path: string) {
  const { data, error } = await supabase.storage
    .from("message_attachments")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

type Props = {
  path: string;
  name: string | null;
  type: string | null;
  size: number | null;
  minha: boolean;
};

export function MessageAttachment({ path, name, type, size, minha }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [ampliada, setAmpliada] = useState(false);

  useEffect(() => {
    let ativo = true;
    assinar(path)
      .then((u) => ativo && setUrl(u))
      .catch(() => ativo && setErro(true));
    return () => {
      ativo = false;
    };
  }, [path]);

  const nome = name || "arquivo";

  if (erro) {
    return <p className="text-xs italic opacity-80">Não foi possível carregar o anexo.</p>;
  }

  if (ehImagem(type)) {
    return (
      <>
        <button
          type="button"
          onClick={() => url && setAmpliada(true)}
          className="block max-w-[220px] overflow-hidden rounded-md border bg-background/20"
          aria-label={`Ampliar imagem ${nome}`}
        >
          {url ? (
            <img src={url} alt={nome} loading="lazy" className="h-auto w-full object-cover" />
          ) : (
            <span className="flex h-24 w-[220px] items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          )}
        </button>
        <Dialog open={ampliada} onOpenChange={setAmpliada}>
          <DialogContent className="max-w-[95vw] sm:max-w-3xl">
            <DialogTitle className="text-base">{nome}</DialogTitle>
            {url && <img src={url} alt={nome} className="max-h-[75vh] w-full object-contain" />}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div
      className={`flex max-w-[240px] items-center gap-2 rounded-md border p-2 ${minha ? "bg-primary-foreground/10" : "bg-background"}`}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{nome}</span>
        {size ? <span className="block text-[11px] opacity-70">{formatarTamanho(size)}</span> : null}
      </span>
      <Button
        asChild={!!url}
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={!url}
        aria-label={`Abrir ${nome}`}
      >
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" download={nome}>
            <Download className="h-3.5 w-3.5" />
          </a>
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )}
      </Button>
    </div>
  );
}
