// Envia por e-mail o convite de time que o gestor criou (em vez de ele ter que mandar o link pelo WhatsApp).
//
// O navegador do gestor chama esta função com o id do convite. A função NÃO confia no que recebe:
//   1. confere quem está logado (token do usuário);
//   2. só envia se o convite for desse gestor e ainda estiver pendente;
//   3. no máximo 1 e-mail a cada 5 minutos por convite (evita spam / reenvio em loop).
// O e-mail sai em nome do AuraX, com "responder para" = e-mail do gestor.
//
// Segredos (Supabase -> Edge Functions -> Secrets):
//   RESEND_API_KEY        - já criado para o notify-admin
//   INVITE_FROM_EMAIL     - opcional; padrão: AuraX <convites@auraxoficial.com.br> (domínio já verificado no Resend)
//   SITE_URL (opcional)   - padrão https://auraxoficial.com.br
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - já vêm preenchidos
//
// Deploy: supabase functions deploy send-team-invite --no-verify-jwt   (Verify JWT desligado; a função valida o usuário sozinha)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://auraxoficial.com.br";
const MIN_GAP_MS = 5 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Não autenticado." }, 401);

    const { inviteId } = await req.json();
    if (typeof inviteId !== "string") return json({ error: "Pedido inválido." }, 400);

    const { data: inv } = await admin
      .from("team_invites")
      .select("id, email, token, status, manager_id, last_emailed_at")
      .eq("id", inviteId)
      .eq("manager_id", user.id)
      .single();
    if (!inv || inv.status !== "pendente") return json({ error: "Convite não encontrado ou já utilizado." }, 404);

    if (inv.last_emailed_at && Date.now() - new Date(inv.last_emailed_at).getTime() < MIN_GAP_MS) {
      return json({ error: "Esse convite acabou de ser enviado. Aguarde alguns minutos para reenviar." }, 429);
    }

    const { data: mgr } = await admin.from("profiles").select("name, email, empresa").eq("id", user.id).single();
    const managerName = mgr?.name || "Um gestor";
    const link = `${SITE_URL}/login.html?convite=${encodeURIComponent(inv.token)}`;

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#f4ede0"><div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#14213d;line-height:1.55">
      <p style="font-size:18px;margin:0 0 6px"><b>${esc(managerName)}</b> convidou você para o time dele no AuraX</p>
      <p style="margin:0 0 18px;color:#4b566e">O AuraX é uma ferramenta de autoavaliação de oratória para quem vende: ela analisa a sua própria fala nas calls (ritmo, vícios de linguagem, gírias) e entrega uma nota e o que melhorar na próxima reunião. Você acompanha a sua evolução e ${esc(managerName)} acompanha a do time.</p>
      <p style="margin:22px 0"><a href="${link}" style="background:#0e8a7e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700;display:inline-block">Criar minha conta e entrar no time</a></p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Se o botão não abrir, copie este endereço no navegador:</p>
      <p style="margin:0 0 20px;font-size:13px;word-break:break-all"><a href="${link}" style="color:#0e8a7e">${link}</a></p>
      <p style="margin:0;font-size:12.5px;color:#6b7280">Você recebeu este e-mail porque ${esc(managerName)} informou o seu endereço. Se não conhece essa pessoa, é só ignorar: nada acontece sem você criar a conta.</p>
    </div></body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY") ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("INVITE_FROM_EMAIL") ?? "AuraX <convites@auraxoficial.com.br>",
        to: [inv.email],
        ...(mgr?.email ? { reply_to: mgr.email } : {}),
        subject: `${managerName} convidou você para o time dele no AuraX`,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend falhou:", res.status, await res.text());
      return json({ error: "Não foi possível enviar o e-mail agora." }, 502);
    }
    await admin.from("team_invites").update({ last_emailed_at: new Date().toISOString() }).eq("id", inv.id);
    return json({ ok: true });
  } catch (err) {
    console.error("send-team-invite:", err);
    return json({ error: "Erro interno." }, 500);
  }
});
