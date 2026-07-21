import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Scale, ShieldCheck, FileSearch, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Sistema de Gestão de Documentos Judiciais" },
      { name: "description", content: "Gerencie petições, contratos e sentenças com controle de versão e trilha de auditoria." },
      { property: "og:title", content: "Sistema de Gestão de Documentos Judiciais" },
      { property: "og:description", content: "Gerencie petições, contratos e sentenças com controle de versão e trilha de auditoria." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-sidebar-primary" />
            <span className="font-semibold tracking-tight">Gestão Judicial</span>
          </div>
          <Link to="/auth">
            <Button variant="secondary" size="sm">Entrar</Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Sistema de Gestão de Documentos Judiciais
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Organize petições, procurações, sentenças e ofícios com metadados detalhados,
            controle de versão e trilha de auditoria completa.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth">
              <Button size="lg">Acessar Sistema</Button>
            </Link>
          </div>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {[
            { icon: FileSearch, title: "Busca Avançada", desc: "Filtros combinados por advogado, processo, data e status." },
            { icon: History, title: "Versionamento", desc: "Histórico completo de todas as revisões de documentos." },
            { icon: ShieldCheck, title: "Auditoria", desc: "Registro imutável de cada visualização e edição." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-lg border bg-card p-6 shadow-sm">
              <Icon className="h-8 w-8 text-primary" />
              <h3 className="mt-4 font-semibold text-card-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}