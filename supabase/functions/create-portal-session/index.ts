// Abre o Portal do Cliente do Stripe (trocar cartão, ver faturas, cancelar a assinatura)
// pra quem já tem assinatura. Só quem tem stripe_customer_id no próprio perfil consegue.
//
// Segredos: STRIPE_SECRET_KEY (os de Supabase vêm automáticos). SITE_URL é opcional.
// Antes de usar: Stripe -> Settings -> Billing -> Customer portal -> ativar e salvar.
//
// Deploy: supabase functions deploy create-portal-session

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://auraxoficial.com.br";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Não autenticado." }, 401);

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("stripe_customer_id, manager_id").eq("id", user.id).single();
    if (!profile || profile.manager_id) return json({ error: "Só o titular da assinatura pode gerenciá-la." }, 403);
    if (!profile.stripe_customer_id) return json({ error: "Você ainda não tem uma assinatura." }, 404);

    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id as string,
      return_url: `${SITE_URL}/app.html`,
    });
    return json({ url: portal.url });
  } catch (err) {
    console.error("Erro abrindo o portal:", err);
    return json({ error: "Não foi possível abrir o portal agora." }, 500);
  }
});
