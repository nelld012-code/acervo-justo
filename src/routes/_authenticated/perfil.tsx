import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, CARGO_LABELS, CARGO_OPTIONS, type Cargo } from "@/hooks/use-profile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

type AdminUser = { id: string; nome: string; email: string | null; cargo: Cargo; telefone: string | null; created_at: string; updated_at: string };

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({ meta: [
    { title: "Meu Perfil - Gestão Judicial" },
    { name: "description", content: "Atualize seus dados pessoais, senha e administração de usuários." },
    { property: "og:title", content: "Meu Perfil - Gestão Judicial" },
    { property: "og:description", content: "Atualize seus dados pessoais e senha de acesso." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PerfilPage,
});

async function callAdminUsers(payload: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");
  const { data, error } = await supabase.functions.invoke("admin-users", { body: payload, headers: { Authorization: `Bearer ${token}` } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

function PerfilPage() {
  const qc = useQueryClient();
  const { profile, cargo, isLoading, perms } = useProfile();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [userSaving, setUserSaving] = useState(false);
  const [userForm, setUserForm] = useState({ nome: "", email: "", telefone: "", cargo: "assistente" as Cargo, password: "" });

  useEffect(() => {
    if (profile) { setNome(profile.nome ?? ""); setTelefone((profile as { telefone?: string | null }).telefone ?? ""); }
  }, [profile]);

  useEffect(() => { if (perms.isAdmin) void loadUsers(); }, [perms.isAdmin]);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, cargo, telefone, created_at, updated_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setUsers((data ?? []) as AdminUser[]);
    } catch (e) {
      toast.error("Não foi possível carregar os usuários", { description: e instanceof Error ? e.message : "" });
    } finally { setUsersLoading(false); }
  }

  async function saveInfo() {
    if (!profile) return;
    if (!nome.trim()) return toast.error("Informe seu nome");
    setSavingInfo(true);
    try {
      const { error } = await supabase.from("profiles").update({ nome: nome.trim(), telefone: telefone.trim() || null }).eq("id", profile.id);
      if (error) throw error;
      toast.success("Dados atualizados"); qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (e) { toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : "" }); }
    finally { setSavingInfo(false); }
  }

  async function savePassword() {
    if (senha.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres");
    if (senha !== senha2) return toast.error("As senhas não coincidem");
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setSenha(""); setSenha2(""); toast.success("Senha alterada com sucesso");
    } catch (e) { toast.error("Erro ao alterar senha", { description: e instanceof Error ? e.message : "" }); }
    finally { setSavingPass(false); }
  }

  function openCreateUser() {
    setEditingUser(null); setUserForm({ nome: "", email: "", telefone: "", cargo: "assistente", password: "" }); setUserDialogOpen(true);
  }

  function openEditUser(user: AdminUser) {
    setEditingUser(user); setUserForm({ nome: user.nome ?? "", email: user.email ?? "", telefone: user.telefone ?? "", cargo: user.cargo, password: "" }); setUserDialogOpen(true);
  }

  async function saveUser() {
    if (!userForm.nome.trim() || !userForm.email.trim()) return toast.error("Informe nome e e-mail");
    if (!editingUser && userForm.password.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres");
    setUserSaving(true);
    try {
      await callAdminUsers({ action: editingUser ? "update" : "create", ...(editingUser ? { id: editingUser.id } : {}), nome: userForm.nome.trim(), email: userForm.email.trim(), telefone: userForm.telefone.trim(), cargo: userForm.cargo, password: userForm.password });
      toast.success(editingUser ? "Usuário atualizado" : "Usuário criado");
      setUserDialogOpen(false); await loadUsers();
    } catch (e) { toast.error("Erro ao salvar usuário", { description: e instanceof Error ? e.message : "" }); }
    finally { setUserSaving(false); }
  }

  async function confirmDeleteUser() {
    if (!deleteUser) return;
    setUserSaving(true);
    try { await callAdminUsers({ action: "delete", id: deleteUser.id }); toast.success("Usuário excluído"); setDeleteUser(null); await loadUsers(); }
    catch (e) { toast.error("Erro ao excluir usuário", { description: e instanceof Error ? e.message : "" }); }
    finally { setUserSaving(false); }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight text-foreground">Meu Perfil</h1><p className="text-sm text-muted-foreground">Atualize seus dados pessoais e sua senha de acesso.</p></div>

      <Card><CardHeader><CardTitle className="text-base">Dados pessoais</CardTitle><CardDescription>{isLoading ? "Carregando..." : `${profile?.email ?? "—"} · ${CARGO_LABELS[cargo as Cargo]}`}</CardDescription></CardHeader><CardContent className="grid gap-3">
        <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} /></div>
        <div className="space-y-1.5"><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 91234-5678" maxLength={30} /></div>
        <div className="space-y-1.5"><Label>E-mail</Label><Input value={profile?.email ?? ""} disabled /></div>
        <div><Button onClick={saveInfo} disabled={savingInfo || !profile}>{savingInfo ? "Salvando..." : "Salvar dados"}</Button></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Alterar senha</CardTitle><CardDescription>Use ao menos 6 caracteres.</CardDescription></CardHeader><CardContent className="grid gap-3">
        <div className="space-y-1.5"><Label>Nova senha</Label><Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Confirmar nova senha</Label><Input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} /></div>
        <div><Button onClick={savePassword} disabled={savingPass} variant="outline">{savingPass ? "Alterando..." : "Alterar senha"}</Button></div>
      </CardContent></Card>

      {perms.isAdmin && <Card className="border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Administração de usuários</CardTitle><CardDescription>Crie, edite ou exclua usuários do sistema. Esta área é exclusiva do administrador.</CardDescription></div><Button onClick={openCreateUser}><UserPlus className="mr-2 h-4 w-4" />Novo usuário</Button></CardHeader>
        <CardContent>
          {usersLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando usuários...</p> : users.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p> : <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr className="text-left"><th className="px-3 py-2 font-medium">Nome</th><th className="px-3 py-2 font-medium">E-mail</th><th className="px-3 py-2 font-medium">Cargo</th><th className="px-3 py-2 font-medium">Telefone</th><th className="px-3 py-2 text-right font-medium">Ações</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t"><td className="px-3 py-2 font-medium">{user.nome || "—"}{user.id === profile?.id && <Badge variant="secondary" className="ml-2">Você</Badge>}</td><td className="px-3 py-2">{user.email || "—"}</td><td className="px-3 py-2">{CARGO_LABELS[user.cargo]}</td><td className="px-3 py-2">{user.telefone || "—"}</td><td className="px-3 py-2"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => openEditUser(user)} title="Editar"><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" disabled={user.id === profile?.id} onClick={() => setDeleteUser(user)} title="Excluir"><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>}

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}><DialogContent className="sm:max-w-[520px]"><DialogHeader><DialogTitle>{editingUser ? "Editar usuário" : "Novo usuário"}</DialogTitle><DialogDescription>{editingUser ? "Atualize os dados e, se desejar, informe uma nova senha." : "Crie um novo acesso ao sistema."}</DialogDescription></DialogHeader><div className="grid gap-3 py-2">
        <div className="space-y-1.5"><Label>Nome</Label><Input value={userForm.nome} onChange={(e) => setUserForm((f) => ({ ...f, nome: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Telefone</Label><Input value={userForm.telefone} onChange={(e) => setUserForm((f) => ({ ...f, telefone: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Cargo</Label><Select value={userForm.cargo} onValueChange={(value) => setUserForm((f) => ({ ...f, cargo: value as Cargo }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CARGO_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>{editingUser ? "Nova senha (opcional)" : "Senha inicial"}</Label><Input type="password" value={userForm.password} onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" /></div>
      </div><DialogFooter><Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancelar</Button><Button onClick={saveUser} disabled={userSaving}>{userSaving ? "Salvando..." : editingUser ? "Salvar alterações" : "Criar usuário"}</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir usuário?</AlertDialogTitle><AlertDialogDescription>O acesso de <strong>{deleteUser?.nome}</strong> será excluído permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={userSaving}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteUser} disabled={userSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{userSaving ? "Excluindo..." : "Excluir usuário"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
