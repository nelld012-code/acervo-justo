import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Configuração do servidor incompleta" }, 500);
  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user) return json({ error: "Sessão inválida" }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller, error: callerError } = await admin.from("profiles").select("cargo").eq("id", user.id).single();
  if (callerError || caller?.cargo !== "administrador") return json({ error: "Acesso restrito ao administrador" }, 403);
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "list") {
    const { data, error } = await admin.from("profiles").select("id, nome, email, cargo, telefone, created_at, updated_at").order("nome");
    if (error) return json({ error: error.message }, 400);
    return json({ users: data ?? [] });
  }

  if (action === "create") {
    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const cargo = String(body?.cargo ?? "assistente");
    const telefone = String(body?.telefone ?? "").trim();
    const password = String(body?.password ?? "");
    if (!nome || !email || password.length < 6) return json({ error: "Nome, e-mail e senha (mínimo 6 caracteres) são obrigatórios" }, 400);
    if (!["administrador", "advogado", "secretaria", "assistente"].includes(cargo)) return json({ error: "Cargo inválido" }, 400);
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome, cargo } });
    if (error) return json({ error: error.message }, 400);
    if (created.user) {
      const { error: profileError } = await admin.from("profiles").update({ nome, email, cargo, telefone: telefone || null }).eq("id", created.user.id);
      if (profileError) return json({ error: `Usuário criado, mas perfil não atualizado: ${profileError.message}` }, 400);
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
    if (!id || !nome || !email) return json({ error: "Dados obrigatórios ausentes" }, 400);
    if (!["administrador", "advogado", "secretaria", "assistente"].includes(cargo)) return json({ error: "Cargo inválido" }, 400);
    if (id === user.id && cargo !== "administrador") return json({ error: "Você não pode remover seu próprio acesso de administrador" }, 400);
    const authUpdate: { email: string; password?: string } = { email };
    if (password) { if (password.length < 6) return json({ error: "A nova senha deve ter ao menos 6 caracteres" }, 400); authUpdate.password = password; }
    const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (authError) return json({ error: authError.message }, 400);
    const { error } = await admin.from("profiles").update({ nome, email, cargo, telefone: telefone || null }).eq("id", id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body?.id ?? "");
    if (!id) return json({ error: "Usuário não informado" }, 400);
    if (id === user.id) return json({ error: "Você não pode excluir seu próprio usuário" }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  return json({ error: "Ação inválida" }, 400);
});
