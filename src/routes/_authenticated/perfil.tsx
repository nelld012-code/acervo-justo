import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, CARGO_LABELS, type Cargo } from "@/hooks/use-profile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu Perfil - Gestão Judicial" },
      { name: "description", content: "Atualize seu nome, telefone e senha de acesso ao sistema de gestão judicial." },
      { property: "og:title", content: "Meu Perfil - Gestão Judicial" },
      { property: "og:description", content: "Atualize seus dados pessoais e senha de acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const qc = useQueryClient();
  const { profile, cargo, isLoading } = useProfile();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  useEffect(() => {
    if (profile) {
      setNome(profile.nome ?? "");
      setTelefone((profile as { telefone?: string | null }).telefone ?? "");
    }
  }, [profile]);

  async function saveInfo() {
    if (!profile) return;
    if (!nome.trim()) return toast.error("Informe seu nome");
    setSavingInfo(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ nome: nome.trim(), telefone: telefone.trim() || null })
        .eq("id", profile.id);
      if (error) throw error;
      toast.success("Dados atualizados");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSavingInfo(false);
    }
  }

  async function savePassword() {
    if (senha.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres");
    if (senha !== senha2) return toast.error("As senhas não coincidem");
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setSenha("");
      setSenha2("");
      toast.success("Senha alterada com sucesso");
    } catch (e) {
      toast.error("Erro ao alterar senha", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSavingPass(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground">Atualize seus dados pessoais e sua senha de acesso.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
          <CardDescription>
            {isLoading ? "Carregando..." : `${profile?.email ?? "—"} · ${CARGO_LABELS[cargo as Cargo]}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 91234-5678" maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input value={profile?.email ?? ""} disabled />
          </div>
          <div>
            <Button onClick={saveInfo} disabled={savingInfo || !profile} className="bg-primary hover:bg-primary/90">
              {savingInfo ? "Salvando..." : "Salvar dados"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alterar senha</CardTitle>
          <CardDescription>Use ao menos 6 caracteres.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} />
          </div>
          <div>
            <Button onClick={savePassword} disabled={savingPass} variant="outline">
              {savingPass ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}