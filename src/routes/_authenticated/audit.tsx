import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MessageAttachment } from "@/components/message-attachment";
import { useProfile } from "@/hooks/use-profile";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessagesSquare, Paperclip, Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Auditoria - Gestão Judicial" }] }),
  component: AuditPage,
});

const LABEL: Record<string, string> = {
  viewed: "Visualização",
  uploaded: "Envio",
  edited: "Edição",
  deleted: "Exclusão",
  downloaded: "Download",
};

type MensagemAudit = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
};

type UsuarioAudit = {
  id: string;
  nome: string | null;
  cargo: string | null;
};

function dataHora(iso: string) {
  return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

function AuditPage() {
  const { perms } = useProfile();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["audit-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, timestamp, document_id, user_id, details")
        .order("timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const usuariosQuery = useQuery({
    queryKey: ["admin-message-users"],
    enabled: perms.isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, cargo")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UsuarioAudit[];
    },
    staleTime: 60_000,
  });

  const mensagensQuery = useQuery({
    queryKey: ["admin-all-messages"],
    enabled: perms.isAdmin,
    queryFn: async () => {
      // Carrega todas as mensagens ainda disponíveis no histórico de 60 dias.
      // A paginação mantém o painel completo sem depender de um limite fixo.
      const tamanhoPagina = 500;
      const todas: MensagemAudit[] = [];
      for (let inicio = 0; ; inicio += tamanhoPagina) {
        const { data, error } = await supabase
          .from("messages")
          .select("id, sender_id, recipient_id, body, read_at, created_at, attachment_path, attachment_name, attachment_type, attachment_size, expires_at")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .range(inicio, inicio + tamanhoPagina - 1);
        if (error) throw error;
        const lote = (data ?? []) as MensagemAudit[];
        todas.push(...lote);
        if (lote.length < tamanhoPagina) break;
      }
      return todas;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!perms.isAdmin) return;
    const channel = supabase
      .channel("audit-admin-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-all-messages"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [perms.isAdmin, queryClient]);

  const mensagens = mensagensQuery.data ?? [];
  const usuarios = usuariosQuery.data ?? [];
  const nomesUsuarios = new Map(usuarios.map((u) => [u.id, u.nome?.trim() || "Usuário"]));
  const naoLidas = mensagens.filter((m) => !m.read_at).length;
  const comAnexo = mensagens.filter((m) => !!m.attachment_path).length;

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Registro de Auditoria</h2>
        <p className="text-sm text-muted-foreground">Últimas 200 ações no sistema.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y md:hidden">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : data && data.length > 0 ? (
              data.map((r) => (
                <div key={r.id} className="space-y-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{format(new Date(r.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</span>
                    <Badge variant="outline" className="shrink-0">{LABEL[r.action] ?? r.action}</Badge>
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">Doc: {r.document_id?.slice(0, 8) ?? "—"} · Usuário: {r.user_id?.slice(0, 8) ?? "—"}</p>
                  {r.details ? <p className="break-all text-xs text-muted-foreground">{JSON.stringify(r.details)}</p> : null}
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem registros.</p>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : data && data.length > 0 ? (
                  data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{format(new Date(r.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</TableCell>
                      <TableCell><Badge variant="outline">{LABEL[r.action] ?? r.action}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.document_id?.slice(0, 8) ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.user_id?.slice(0, 8) ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.details ? JSON.stringify(r.details) : "—"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sem registros.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {perms.isAdmin && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">Auditoria de mensagens internas</h3>
              <p className="text-sm text-muted-foreground">Resumo e histórico de mensagens enviadas entre os usuários nos últimos 60 dias.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><MessagesSquare className="h-5 w-5" /></div>
                <div><p className="text-xs text-muted-foreground">Mensagens no histórico</p><p className="text-2xl font-semibold tabular-nums">{mensagens.length}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-muted p-2"><Inbox className="h-5 w-5" /></div>
                <div><p className="text-xs text-muted-foreground">Não lidas</p><p className="text-2xl font-semibold tabular-nums">{mensagensQuery.isLoading ? "—" : naoLidas}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-muted p-2"><Paperclip className="h-5 w-5" /></div>
                <div><p className="text-xs text-muted-foreground">Com anexos</p><p className="text-2xl font-semibold tabular-nums">{mensagensQuery.isLoading ? "—" : comAnexo}</p></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Histórico completo de mensagens</CardTitle>
              <CardDescription>Somente administradores podem consultar este painel. As mensagens e anexos permanecem sujeitos à retenção de 60 dias.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mensagensQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando mensagens...</p>}
              {mensagensQuery.isError && <p className="text-sm text-destructive">Não foi possível carregar as mensagens. Verifique a política de acesso administrativo.</p>}
              {usuariosQuery.isError && <p className="text-sm text-destructive">Não foi possível carregar os nomes dos usuários.</p>}
              {!mensagensQuery.isLoading && !mensagensQuery.isError && !mensagens.length && <p className="text-sm text-muted-foreground">Nenhuma mensagem no período.</p>}
              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {mensagens.map((m) => (
                  <div key={m.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{nomesUsuarios.get(m.sender_id) ?? "Usuário"} → {nomesUsuarios.get(m.recipient_id) ?? "Usuário"}</span>
                      <span>{dataHora(m.created_at)}</span>
                    </div>
                    {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
                    {m.attachment_path && <MessageAttachment path={m.attachment_path} name={m.attachment_name} type={m.attachment_type} size={m.attachment_size} minha={false} />}
                    {!m.read_at && <Badge variant="outline">Não lida pelo destinatário</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
