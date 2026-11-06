// Avisa o dono da plataforma por e-mail quando acontece algo importante:
//   - "signup": alguém criou uma conta nova
//   - "paid":   uma conta virou "ativa" (assinatura confirmada pelo Stripe)
//
// Quem chama é o banco (trigger em profiles, via pg_net) — ver supabase-schema-16-admin-notify.sql.
// A função NÃO confia no que recebe: só usa o id, busca o perfil com a service role, confere se o
// evento é recente/real e registra em admin_notifications (cada aviso sai uma única vez). Assim, mesmo
// que alguém descubra a URL, não consegue disparar e-mails.
//
// Segredos (Supabase -> Edge Functions -> Secrets):
//   RESEND_API_KEY        - chave da API do Resend (permissão de envio)
//   ADMIN_NOTIFY_EMAIL    - e-mail que recebe os avisos (o seu)
//   NOTIFY_FROM_EMAIL     - remetente no domínio verificado, ex.: AuraX Avisos <avisos@auraxoficial.com.br>
//   SITE_URL (opcional)   - padrão https://auraxoficial.com.br
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - já vêm preenchidos
//
// Deploy: supabase functions deploy notify-admin --no-verify-jwt   (Verify JWT desligado)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://auraxoficial.com.br";
const PRICE: Record<string, string> = { Individual: "R$ 119,90/mês", Gestor: "R$ 219,00/mês" };
const SIGNUP_MAX_AGE_MS = 30 * 60 * 1000;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  try {
    const { type, id } = await req.json();
    if ((type !== "signup" && type !== "paid") || typeof id !== "string") return ok({ error: "pedido inválido" }, 400);

    const { data: p } = await admin
      .from("profiles")
      .select("id, name, email, role, cargo, empresa, manager_id, account_status, stripe_customer_id, created_at")
      .eq("id", id)
      .single();
    if (!p) return ok({ skipped: "perfil não encontrado" });

    // Confere se o evento é verdadeiro e recente
    if (type === "signup" && Date.now() - new Date(p.created_at).getTime() > SIGNUP_MAX_AGE_MS) return ok({ skipped: "cadastro antigo" });
    if (type === "paid" && (p.account_status !== "ativa" || !p.stripe_customer_id)) return ok({ skipped: "sem pagamento confirmado" });

    // Cada aviso sai uma vez só
    const { error: dupError } = await admin.from("admin_notifications").insert({ profile_id: id, type });
    if (dupError) return ok({ skipped: "já avisado" });

    const tipo = p.role === "gestor" ? "Gestor" : p.manager_id ? "Colaborador" : "Individual";
    const title = type === "signup" ? "Novo cadastro no AuraX" : "Nova assinatura no AuraX";
    const subject = `${title}: ${p.name || p.email} (${tipo})`;
    const row = (k: string, v: unknown) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#6b7280">${k}</td><td style="padding:6px 0"><b>${esc(v || "—")}</b></td></tr>`;
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#14213d">
      <h2 style="margin:0 0 4px">${title}</h2>
      <p style="margin:0 0 16px;color:#6b7280">${type === "signup" ? "Alguém acabou de criar uma conta." : "O Stripe confirmou o pagamento e a conta foi liberada."}</p>
      <table style="border-collapse:collapse;font-size:15px">
        ${row("Nome", p.name)}${row("E-mail", p.email)}${row("Tipo", tipo)}${row("Empresa", p.empresa)}${row("Cargo", p.cargo)}
        ${type === "paid" ? row("Plano", PRICE[tipo] ?? "") : row("Status", p.account_status === "ativa" ? "Ativa" : "Aguardando plano")}
      </table>
      <p style="margin:22px 0 0"><a href="${SITE_URL}/admin.html" style="background:#14213d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">Abrir o painel admin</a></p>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY") ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("NOTIFY_FROM_EMAIL") ?? "AuraX Avisos <avisos@auraxoficial.com.br>",
        to: [Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? ""],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend falhou:", res.status, await res.text());
      await admin.from("admin_notifications").delete().eq("profile_id", id).eq("type", type); // deixa tentar de novo
      return ok({ error: "falha ao enviar" }, 502);
    }
    return ok();
  } catch (err) {
    console.error("notify-admin:", err);
    return ok({ error: "erro interno" }, 500);
  }
});
