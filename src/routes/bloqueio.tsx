import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LockKeyhole, Scale } from "lucide-react";
import { isSystemOwner } from "@/lib/system-access";

export const Route = createFileRoute("/bloqueio")({
  ssr: false,
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (isSystemOwner(auth.user?.id)) throw redirect({ to: "/recepcao" });
    const { data: access } = await supabase
      .from("system_settings")
      .select("is_active")
      .eq("id", "global")
      .maybeSingle();
    if (access?.is_active !== false) {
      throw redirect({ to: auth.user ? "/recepcao" : "/" });
    }
  },
  head: () => ({
    meta: [
      { title: "Acesso suspenso - Acervo Justo" },
      { name: "description", content: "Acesso temporariamente suspenso; entre com a conta proprietária para reativar o sistema." },
      { property: "og:title", content: "Acesso suspenso - Acervo Justo" },
      { property: "og:description", content: "Acesso temporariamente suspenso; os dados e documentos permanecem preservados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccessSuspendedPage,
});

function AccessSuspendedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
          <LockKeyhole className="h-8 w-8" />
        </div>
        <div className="mb-8 flex items-center justify-center gap-2 text-sm font-semibold tracking-[0.18em] text-slate-300">
          <Scale className="h-5 w-5 text-amber-400" />
          ACERVO JUSTO
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Acesso temporariamente suspenso</p>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Sistema indisponível</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-300">
          O acesso ao Acervo Justo encontra-se temporariamente suspenso devido a uma pendência financeira.
          Para regularizar o acesso, entre em contato com a administração do sistema.
        </p>
        <p className="mt-8 text-xs text-slate-500">Se você é o administrador, entre com sua conta para reativar o sistema.</p>
        <div className="mt-5">
          <Link to="/auth">
            <Button className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400">Acesso do administrador</Button>
          </Link>
        </div>
        <p className="mt-8 text-xs text-slate-500">Seus dados e documentos permanecem preservados.</p>
      </section>
    </main>
  );
}
