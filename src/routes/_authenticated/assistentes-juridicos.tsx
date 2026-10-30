import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bot, Download, FileText, FolderTree, Landmark, LoaderCircle, MessageSquare,
  Printer, RefreshCw, Scale, Send, ShieldCheck, Copy, Save, Paperclip, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { openPrintDocument } from "@/lib/print-doc";

export const Route = createFileRoute("/_authenticated/assistentes-juridicos")({
  head: () => ({ meta: [{ title: "Assistentes Jurídicos IA - Acervo Justo" }] }),
  component: AssistentesJuridicosPage,
});

const WORKER_URL = "https://acervo-assistente-juridico.nelld012.workers.dev/chat";

const SPECIALTIES = [
  {
    id: "inventarios",
    title: "Inventários e Sucessões",
    description: "Inventários judiciais e extrajudiciais, herdeiros, partilhas e alvarás.",
    icon: FolderTree,
    example: "Analise este caso de inventário e prepare uma minuta de primeiras declarações. Organize os dados dos herdeiros, bens, dívidas e documentos que ainda faltam.",
  },
  {
    id: "previdenciario",
    title: "Direito Previdenciário",
    description: "INSS, aposentadorias, benefícios, BPC/LOAS e recursos.",
    icon: Landmark,
    example: "Analise a situação previdenciária descrita abaixo, identifique os requisitos que precisam ser comprovados e prepare uma minuta de requerimento administrativo.",
  },
  {
    id: "civil",
    title: "Direito Civil",
    description: "Contratos, cobranças, indenizações, obrigações e ações cíveis.",
    icon: Scale,
    example: "Organize os fatos, identifique os fundamentos jurídicos que precisam ser conferidos e elabore uma minuta de petição inicial cível.",
  },
  {
    id: "criminal",
    title: "Direito Criminal e Penal",
    description: "Defesa criminal, liberdade provisória, habeas corpus e execução penal.",
    icon: ShieldCheck,
    example: "Analise a cronologia dos fatos e os documentos disponíveis. Identifique questões defensivas e prepare uma minuta de resposta à acusação, sem presumir fatos não informados.",
  },
] as const;

type Specialty = (typeof SPECIALTIES)[number]["id"];
type ChatMessage = { role: "user" | "assistant"; content: string };
const MAX_ATTACHMENT_CHARS = 5_000;

async function extractDocxText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Não consegui ler este DOCX. Salve novamente no Word e tente outra vez.");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name === "word/document.xml") {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(start, start + compressedSize);
      let raw: Uint8Array;
      if (method === 0) raw = compressed;
      else if (method === 8 && typeof DecompressionStream !== "undefined") {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
        raw = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error("Este navegador não consegue abrir o DOCX. Converta para TXT ou PDF pesquisável.");
      const xml = new DOMParser().parseFromString(new TextDecoder().decode(raw), "application/xml");
      return Array.from(xml.getElementsByTagName("w:p")).map((p) =>
        Array.from(p.getElementsByTagName("w:t")).map((t) => t.textContent ?? "").join(""),
      ).join("\n").trim();
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("O texto principal não foi encontrado neste DOCX.");
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const pdfjs = await import(/* @vite-ignore */ pdfjsUrl);
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 25); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: { str?: string }) => item.str ?? "").join(" "));
    if (pages.join("\n").length >= MAX_ATTACHMENT_CHARS) break;
  }
  const text = pages.join("\n").trim();
  if (!text) throw new Error("Não encontrei texto neste PDF. Se for digitalização/imagem, faça OCR ou envie um PDF pesquisável.");
  return text;
}

async function extractAttachment(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdfText(file);
  if (name.endsWith(".docx")) return extractDocxText(file);
  if (/\.(txt|md|csv|json|html|rtf)$/i.test(name) || file.type.startsWith("text/")) return (await file.text()).slice(0, MAX_ATTACHMENT_CHARS);
  throw new Error("Formato não suportado. Envie PDF pesquisável, Word (.docx), TXT, MD, CSV, JSON, HTML ou RTF.");
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

function buildDocumentHtml(title: string, body: string) {
  const paragraphs = body.split(/\n{2,}/).map((part) =>
    "<p>" + escapeHtml(part).replace(/\n/g, "<br>") + "</p>",
  ).join("\n");
  return "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>" +
    escapeHtml(title) +
    "</title><style>@page{size:A4;margin:2.5cm}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#222}h1{font-family:Arial,sans-serif;font-size:16pt;text-align:center;margin-bottom:24pt}.meta{font-family:Arial,sans-serif;font-size:9pt;color:#555;text-align:center;margin-bottom:24pt}p{text-align:justify;margin:0 0 12pt;white-space:pre-wrap}.notice{font-family:Arial,sans-serif;font-size:9pt;color:#555;border-top:1px solid #ccc;padding-top:12pt;margin-top:30pt}</style></head><body><h1>" +
    escapeHtml(title) +
    "</h1><div class='meta'>Acervo Justo · Assistente Jurídico IA · " +
    new Date().toLocaleDateString("pt-BR") +
    "</div>" + paragraphs +
    "<div class='notice'>Minuta elaborada com apoio de inteligência artificial. Conferir fatos, documentos, legislação, prazos e jurisprudência. Revisão obrigatória pelo advogado responsável antes de utilização ou protocolo.</div></body></html>";
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function safeFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "documento-juridico";
}

function fitHistory(history: ChatMessage[]) {
  const kept: ChatMessage[] = [];
  let total = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (kept.length >= 12 || total + message.content.length > 15_000) break;
    kept.unshift(message);
    total += message.content.length;
  }
  return kept;
}

function AssistentesJuridicosPage() {
  const [specialty, setSpecialty] = useState<Specialty>("inventarios");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentText, setAttachmentText] = useState("");
  const [readingAttachment, setReadingAttachment] = useState(false);

  const selected = SPECIALTIES.find((item) => item.id === specialty) ?? SPECIALTIES[0];

  function newService() {
    setMessages([]);
    setPrompt("");
    setDraft("");
    setAttachmentName("");
    setAttachmentText("");
    toast.success("Novo atendimento iniciado. O anterior não foi salvo no sistema.");
  }

  async function sendMessage() {
    const text = prompt.trim();
    if (!text) {
      toast.error("Digite a solicitação ou descreva o caso.");
      return;
    }
    if (text.length > 8_000) {
      toast.error("Reduza a solicitação para até 8.000 caracteres.");
      return;
    }
    const requestText = attachmentText
      ? text + "\n\nARQUIVO ANEXADO: " + attachmentName + "\nTEXTO EXTRAÍDO DO ARQUIVO (trecho disponível):\n" + attachmentText.slice(0, Math.max(0, 7_800 - text.length))
      : text;
    if (requestText.length > 8_000) {
      toast.error("A solicitação e o arquivo ultrapassam o limite. Reduza a solicitação ou envie um arquivo menor.");
      return;
    }
    const visibleText = text + (attachmentName ? "\n\n[Arquivo anexado: " + attachmentName + "]" : "");

    setSending(true);
    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: requestText }];
    setMessages(nextHistory);
    setPrompt("");

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error("Sua sessão não foi encontrada. Entre novamente no Acervo Justo.");
      }

      const requestMessages = fitHistory(nextHistory);
      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ specialty, messages: requestMessages }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || "Não foi possível obter uma resposta da IA.");
      }
      if (typeof result?.answer !== "string" || !result.answer.trim()) {
        throw new Error("A IA não retornou um texto válido. Tente novamente.");
      }

      const answer = result.answer.trim();
      setMessages([...messages, { role: "user", content: visibleText }, { role: "assistant", content: answer }]);
      setDraft(answer);
      toast.success("Resposta gerada. Revise o texto antes de utilizar.");
    } catch (error) {
      toast.error("Não foi possível gerar a resposta.", {
        description: error instanceof Error ? error.message : "Erro inesperado.",
      });
    } finally {
      setSending(false);
    }
  }

  function exportWord() {
    if (!draft.trim()) return toast.error("Ainda não há texto para exportar.");
    const html = buildDocumentHtml("Minuta Jurídica - " + selected.title, draft);
    downloadFile(safeFilename(selected.title) + ".doc", "\ufeff" + html, "application/msword;charset=utf-8");
    toast.success("Arquivo Word baixado. Abra-o e escolha a pasta onde deseja guardá-lo.");
  }

  function exportPdf() {
    if (!draft.trim()) return toast.error("Ainda não há texto para imprimir.");
    const ok = openPrintDocument(buildDocumentHtml("Minuta Jurídica - " + selected.title, draft));
    if (!ok) toast.error("Não foi possível abrir a impressão. Verifique o bloqueio de janelas do navegador.");
  }

  function saveDraftText() {
    if (!messages.length && !draft.trim()) return toast.error("Não há rascunho para salvar.");
    const transcript = [
      "ACERVO JUSTO — RASCUNHO DE ATENDIMENTO",
      "Especialidade: " + selected.title,
      "Data: " + new Date().toLocaleString("pt-BR"),
      "",
      ...messages.map((message) => (message.role === "user" ? "SOLICITAÇÃO" : "ASSISTENTE") + "\n" + message.content + "\n"),
      draft.trim() ? "TEXTO FINAL EDITÁVEL\n" + draft : "",
    ].join("\n");
    downloadFile(safeFilename(selected.title) + "-rascunho.txt", transcript, "text/plain;charset=utf-8");
    toast.success("Rascunho baixado no computador.");
  }

  async function copyDraft() {
    if (!draft.trim()) return toast.error("Ainda não há texto para copiar.");
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Texto copiado.");
    } catch {
      toast.error("O navegador não permitiu copiar. Selecione o texto no editor e use Ctrl+C.");
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Assistentes Jurídicos IA</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Quatro especialidades para organizar casos, elaborar minutas e revisar documentos.
          </p>
        </div>
        <Button variant="outline" onClick={newService} disabled={sending}>
          <RefreshCw className="mr-2 h-4 w-4" />Novo atendimento
        </Button>
      </div>

      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardContent className="flex gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Privacidade e armazenamento local</p>
            <p className="text-muted-foreground">
              As conversas ficam apenas na memória desta página e não são gravadas no banco de dados.
              Ao fechar ou atualizar a página, elas desaparecem. Baixe o rascunho para continuar em outro computador.
              Evite enviar CPF, RG, endereço, dados médicos ou informações sigilosas desnecessárias.
              O texto final precisa ser conferido pelo advogado responsável.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SPECIALTIES.map((item) => {
          const SpecialtyIcon = item.icon;
          const active = specialty === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              variant={active ? "default" : "outline"}
              onClick={() => {
                if (specialty !== item.id && messages.length > 0) {
                  const confirmed = window.confirm("Trocar de especialidade inicia um novo atendimento. Salve o rascunho atual antes de continuar. Deseja trocar agora?");
                  if (!confirmed) return;
                  setMessages([]);
                  setPrompt("");
                  setDraft("");
                  setAttachmentName("");
                  setAttachmentText("");
                }
                setSpecialty(item.id);
              }}
              aria-pressed={active}
              className={"h-auto min-h-[112px] items-start justify-start whitespace-normal p-4 text-left " + (active ? "shadow-sm" : "")}
            >
              <span className="flex w-full flex-col items-start gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <SpecialtyIcon className="h-5 w-5 shrink-0" />{item.title}
                </span>
                <span className={"text-xs font-normal leading-5 " + (active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {item.description}
                </span>
              </span>
            </Button>
          );
        })}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5" />Atendimento — {selected.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground">Descreva os fatos e o documento que precisa elaborar.</p>
            </div>
            <Badge variant="outline">Groq IA</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[440px] min-h-[230px] space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
              {!messages.length && (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
                  <Bot className="h-10 w-10 text-primary/70" />
                  <div className="max-w-md space-y-1">
                    <p className="font-medium">Como posso ajudar?</p>
                    <p className="text-sm text-muted-foreground">{selected.description}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPrompt(selected.example)}>
                    Usar exemplo de solicitação
                  </Button>
                </div>
              )}
              {messages.map((message, index) => (
                <div key={index} className={"rounded-lg p-3 " + (message.role === "user" ? "ml-5 bg-primary text-primary-foreground" : "mr-5 border bg-card")}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    {message.role === "user" ? "Sua solicitação" : "Assistente jurídico"}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                </div>
              ))}
              {sending && (
                <div className="mr-5 flex items-center gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" />Preparando a resposta jurídica...
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4" />Anexar arquivo ao assistente {selected.title}</p>
                    <p className="text-xs text-muted-foreground">PDF pesquisável, Word (.docx), TXT, MD, CSV, JSON, HTML ou RTF · até 15 MB</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                    {readingAttachment ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
                    {readingAttachment ? "Lendo arquivo..." : "Escolher arquivo"}
                    <input type="file" className="sr-only" accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.rtf,text/*" disabled={sending || readingAttachment} onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (file.size > 15 * 1024 * 1024) { toast.error("O arquivo deve ter até 15 MB."); return; }
                      setReadingAttachment(true);
                      try {
                        const extracted = (await extractAttachment(file)).trim();
                        if (!extracted) throw new Error("O arquivo não contém texto legível.");
                        setAttachmentName(file.name);
                        setAttachmentText(extracted.slice(0, MAX_ATTACHMENT_CHARS));
                        toast.success("Arquivo lido. O conteúdo será enviado à IA somente quando você enviar a solicitação.");
                      } catch (error) {
                        toast.error("Não foi possível ler o arquivo.", { description: error instanceof Error ? error.message : "Verifique o formato do arquivo." });
                      } finally { setReadingAttachment(false); }
                    }} />
                  </label>
                </div>
                {attachmentName && <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 p-2 text-sm">
                  <span className="min-w-0 break-all"><FileText className="mr-2 inline h-4 w-4" />{attachmentName}<span className="ml-2 text-xs text-muted-foreground">({attachmentText.length.toLocaleString("pt-BR")} caracteres extraídos)</span></span>
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover arquivo" onClick={() => { setAttachmentName(""); setAttachmentText(""); }}><X className="h-4 w-4" /></Button>
                </div>}
                <p className="text-xs text-muted-foreground">O arquivo não é guardado no Acervo Justo. O texto extraído segue para a IA quando você clicar em “Enviar solicitação”. PDFs digitalizados como imagem podem precisar de OCR antes.</p>
              </div>
              <Label htmlFor="legal-assistant-prompt">Descreva o caso ou faça sua pergunta</Label>
              <Textarea
                id="legal-assistant-prompt"
                rows={5}
                maxLength={8000}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Informe os fatos, o objetivo do documento, os dados processuais necessários e quais documentos estão disponíveis. Evite dados pessoais identificáveis."
                disabled={sending}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{prompt.length}/8.000 caracteres · Ctrl+Enter para enviar</span>
                <Button onClick={() => void sendMessage()} disabled={sending || !prompt.trim()}>
                  {sending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Enviar solicitação
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />Editor do documento final
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Revise e edite a minuta. O conteúdo daqui não é enviado ao banco de dados.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={19}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="A resposta da IA aparecerá aqui. Você poderá editar o texto antes de baixar."
              className="min-h-[420px] font-serif text-sm leading-6"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportWord} disabled={!draft.trim()}>
                <Download className="mr-2 h-4 w-4" />Baixar Word (.doc)
              </Button>
              <Button variant="outline" onClick={exportPdf} disabled={!draft.trim()}>
                <Printer className="mr-2 h-4 w-4" />Imprimir / Salvar PDF
              </Button>
              <Button variant="outline" onClick={copyDraft} disabled={!draft.trim()}>
                <Copy className="mr-2 h-4 w-4" />Copiar texto
              </Button>
              <Button variant="outline" onClick={saveDraftText} disabled={!messages.length && !draft.trim()}>
                <Save className="mr-2 h-4 w-4" />Salvar rascunho (.txt)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O Word é baixado em formato .doc compatível. Para PDF, use “Salvar como PDF” na janela de impressão do navegador.
              O navegador salvará em Downloads ou permitirá escolher a pasta.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
