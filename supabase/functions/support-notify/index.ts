// Avisa por e-mail (caixa de suporte da AuraX) quando alguém envia uma
// mensagem pelo formulário "Suporte". A mensagem já está salva na tabela
// support_requests; esta função só manda o aviso — se falhar, nada se perde.
//
// Segredos necessários (Supabase -> Project Settings -> Edge Functions):
//   RESEND_API_KEY       - chave da API do Resend (resend.com) com o domínio verificado
//   SUPPORT_TO_EMAIL     - e-mail da AuraX que recebe os pedidos (ex.: suporte@seudominio.com.br)
//   SUPPORT_FROM_EMAIL   - remetente no domínio verificado (ex.: "AuraX Suporte <suporte@seudominio.com.br>")
//   SUPABASE_URL / SUPABASE_ANON_KEY - já vêm preenchidos automaticamente
//
// Autenticado com o token do próprio usuário (não service role): o select na
// tabela passa pelo RLS, então só dá pra disparar o aviso de uma mensagem
// que a própria pessoa enviou.
//
// Deploy: supabase functions deploy support-notify

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const CATEGORY_LABELS: Record<string, string> = {
  duvida: "Dúvida",
  problema: "Problema técnico",
  cobranca: "Cobrança / assinatura",
  sugestao: "Sugestão",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { requestId } = await req.json();
    if (!requestId) return json({ error: "requestId é obrigatório" }, 400);

    const { data: row, error } = await supabase
      .from("support_requests")
      .select("id, email, name, category, message, page, user_agent, created_at")
      .eq("id", requestId)
      .single();
    if (error || !row) return json({ error: "Mensagem não encontrada" }, 404);

    const to = Deno.env.get("SUPPORT_TO_EMAIL");
    const from = Deno.env.get("SUPPORT_FROM_EMAIL");
    const key = Deno.env.get("RESEND_API_KEY");
    if (!to || !from || !key) return json({ error: "E-mail de suporte não configurado" }, 500);

    const category = CATEGORY_LABELS[row.category] ?? row.category;
    const html = `
      <p><b>${esc(row.name)}</b> &lt;${esc(row.email)}&gt; enviou uma mensagem pelo AuraX.</p>
      <p><b>Assunto:</b> ${esc(category)}</p>
      <blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #3b6fe0;white-space:pre-wrap">${esc(row.message)}</blockquote>
      <p style="color:#666;font-size:12px">Página: ${esc(row.page)}<br>Navegador: ${esc(row.user_agent)}<br>Enviado em: ${esc(row.created_at)}<br>ID: ${esc(row.id)}</p>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: row.email || undefined, // responder no e-mail já vai direto pro usuário
        subject: `[AuraX Suporte] ${category} — ${row.name || row.email}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend falhou:", res.status, await res.text());
      return json({ error: "Não foi possível enviar o aviso" }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("support-notify:", err);
    return json({ error: "Erro inesperado" }, 500);
  }
});
