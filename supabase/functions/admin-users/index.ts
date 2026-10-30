import { withSupabase } from "npm:@supabase/server@1.9.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const VALID_CARGOS = ["administrador", "advogado", "secretaria", "assistente", "financeiro"];

const adminUsersHandler = withSupabase({ auth: "none" }, async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  // A chave da aplicação identifica o projeto; a sessão do usuário é validada separadamente
  // pelo Auth antes de qualquer operação privilegiada.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Sessão não enviada. Entre novamente no sistema." }, 401);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return json({ error: "Sessão inválida. Entre novamente no sistema." }, 401);

  const admin = ctx.supabaseAdmin;
  const { data: authResult, error: userError } = await admin.auth.getUser(token);
  if (userError || !authResult.user) {
    console.error("[admin-users] Falha ao validar a sessão do solicitante:", userError?.message ?? "usuário não encontrado");
    return json({ error: "Sua sessão expirou ou é inválida. Entre novamente no sistema." }, 401);
  }
  const callerId = authResult.user.id;

  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("cargo")
    .eq("id", callerId)
    .maybeSingle();

  if (callerError) {
    console.error("[admin-users] Falha ao consultar o perfil do solicitante:", callerError.message);
    return json({ error: "Não foi possível validar as permissões do administrador." }, 500);
  }
  if (caller?.cargo !== "administrador") {
    return json({ error: "Acesso restrito ao administrador." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "list") {
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authError) {
      console.error("[admin-users] Falha ao listar usuários:", authError.message);
      return json({ error: authError.message }, 400);
    }

    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, nome, email, cargo, telefone, created_at, updated_at");
    if (profileError) {
      console.error("[admin-users] Falha ao listar perfis:", profileError.message);
      return json({ error: profileError.message }, 400);
    }

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const users = (authData.users ?? []).map((authUser) => {
      const profile = profileById.get(authUser.id);
      const metadata = authUser.user_metadata as { nome?: string; cargo?: string; telefone?: string } | null;
      return {
        id: authUser.id,
        nome: profile?.nome ?? metadata?.nome ?? "",
        email: profile?.email ?? authUser.email ?? null,
        cargo: profile?.cargo ?? metadata?.cargo ?? "assistente",
        telefone: profile?.telefone ?? metadata?.telefone ?? null,
        created_at: profile?.created_at ?? authUser.created_at,
        updated_at: profile?.updated_at ?? authUser.updated_at ?? authUser.created_at,
      };
    });
    users.sort((a, b) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "", "pt-BR"));
    return json({ users });
  }

  if (action === "create") {
    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const cargo = String(body?.cargo ?? "assistente");
    const telefone = String(body?.telefone ?? "").trim();
    const password = String(body?.password ?? "");

    if (!nome || !email || password.length < 6) {
      return json({ error: "Nome, e-mail e senha (mínimo 6 caracteres) são obrigatórios." }, 400);
    }
    if (!VALID_CARGOS.includes(cargo)) return json({ error: "Cargo inválido." }, 400);

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, cargo, telefone },
    });
    if (error) {
      console.error("[admin-users] Falha ao criar usuário:", error.message);
      return json({ error: error.message }, 400);
    }

    if (created.user) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({ nome, email, cargo, telefone: telefone || null })
        .eq("id", created.user.id);
      if (profileError) {
        console.error("[admin-users] Usuário criado, mas o perfil não foi atualizado:", profileError.message);
        return json({
          error: `Usuário criado, mas o perfil não foi atualizado: ${profileError.message}`,
          userCreated: true,
        }, 400);
      }
    }
    return json({ ok: true });
  }

  if (action === "update") {
    const id = String(body?.id ?? "");
    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const cargo = String(body?.cargo ?? "assistente");
    const telefone = String(body?.telefone ?? "").trim();
    const password = String(body?.password ?? "");

    if (!id) return json({ error: "Usuário não informado." }, 400);
    if (!VALID_CARGOS.includes(cargo)) return json({ error: "Cargo inválido." }, 400);
    if (id === callerId && cargo !== "administrador") {
      return json({ error: "Você não pode remover seu próprio acesso de administrador." }, 400);
    }

    // Compatibilidade com versões anteriores do painel que enviavam apenas id + cargo.
    if (!nome && !email) {
      const { error } = await admin.from("profiles").update({ cargo }).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (!nome || !email) return json({ error: "Nome e e-mail são obrigatórios." }, 400);
    if (password && password.length < 6) {
      return json({ error: "A nova senha deve ter ao menos 6 caracteres." }, 400);
    }

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(id);
    if (targetError || !target.user) {
      return json({ error: targetError?.message ?? "Usuário não encontrado." }, 404);
    }

    const authUpdate: { email?: string; password?: string } = {};
    if ((target.user.email ?? "").toLowerCase() !== email) authUpdate.email = email;
    if (password) authUpdate.password = password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdate);
      if (authError) {
        console.error("[admin-users] Falha ao atualizar autenticação do usuário:", authError.message);
        return json({ error: authError.message }, 400);
      }
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ nome, email, cargo, telefone: telefone || null })
      .eq("id", id);
    if (profileError) {
      console.error("[admin-users] Falha ao atualizar perfil do usuário:", profileError.message);
      return json({
        error: `A autenticação foi atualizada, mas os dados do perfil não foram salvos: ${profileError.message}`,
        authUpdated: Object.keys(authUpdate).length > 0,
      }, 400);
    }
    return json({ ok: true });
  }

  // Atualização de senha isolada: não tenta alterar e-mail nem os demais dados do perfil.
  if (action === "set-password") {
    const id = String(body?.id ?? "");
    const password = String(body?.password ?? "");
    if (!id) return json({ error: "Usuário não informado." }, 400);
    if (password.length < 6) return json({ error: "A nova senha deve ter ao menos 6 caracteres." }, 400);

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(id);
    if (targetError || !target.user) {
      return json({ error: targetError?.message ?? "Usuário não encontrado." }, 404);
    }

    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) {
      console.error("[admin-users] Falha ao redefinir senha:", error.message);
      return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body?.id ?? "");
    if (!id) return json({ error: "Usuário não informado." }, 400);
    if (id === callerId) return json({ error: "Você não pode excluir seu próprio usuário." }, 400);

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      console.error("[admin-users] Falha ao excluir usuário:", error.message);
      return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  return json({ error: "Ação inválida." }, 400);
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const response = await adminUsersHandler(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno inesperado.";
    console.error("[admin-users] Erro não tratado:", message);
    return json({ error: "Falha interna ao processar a administração de usuários." }, 500);
  }
});
