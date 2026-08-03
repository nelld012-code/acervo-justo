import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CARGO_OPTIONS, type Cargo } from "@/hooks/use-profile";
import { toast } from "sonner";
import { Scale } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Entrar - Gestão Judicial" },
      { name: "description", content: "Acesse o sistema de gestão de documentos judiciais." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState<Cargo>("assistente");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Falha no login", { description: error.message });
      return;
    }
    toast.success("Bem-vindo(a)!");
    navigate({ to: "/dashboard" });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { nome, cargo },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Falha no cadastro", { description: error.message });
      return;
    }
    toast.success("Cadastro realizado", { description: "Verifique seu e-mail para confirmar a conta." });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-2">
          <Scale className="h-6 w-6 text-primary" />
          <span className="font-semibold text-card-foreground">Gestão Judicial</span>
        </div>
        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Cadastrar</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@escritorio.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome-s">Nome completo</Label>
                <Input id="nome-s" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-s">E-mail</Label>
                <Input id="email-s" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-s">Senha (mín. 6 caracteres)</Label>
                <Input id="password-s" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cargo-s">Cargo / Função</Label>
                <Select value={cargo} onValueChange={(v) => setCargo(v as Cargo)}>
                  <SelectTrigger id="cargo-s"><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                  <SelectContent>
                    {CARGO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  O cargo define as permissões: administrador tem acesso total; advogado acessa processos, clientes e financeiro;
                  secretário(a) gerencia clientes e documentos; assistente tem acesso somente de leitura.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Cadastrando..." : "Criar Conta"}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}