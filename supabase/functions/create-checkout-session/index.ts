// Cria uma Stripe Checkout Session (assinatura do plano AuraX) pro gestor
// logado e devolve a URL pra redirecionar o navegador.
//
// Segredos necessários (Supabase -> Project Settings -> Edge Functions):
//   STRIPE_SECRET_KEY      - chave secreta do Stripe (test ou live)
//   STRIPE_PRICE_ID        - id do Price da assinatura de R$219/mês
//   SUPABASE_URL           - já vem preenchido automaticamente
//   SUPABASE_SERVICE_ROLE_KEY - já vem preenchido automaticamente
//   SITE_URL (opcional)    - base do site pra redirect (default abaixo)
//
// Deploy: supabase functions deploy create-checkout-session

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

const PRICE_ID = Deno.env.get("STRIPE_PRICE_ID") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://dougrebollo.github.io/aurax";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !user) {
      return json({ error: "Não autenticado." }, 401);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, stripe_customer_id, manager_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return json({ error: "Perfil não encontrado." }, 404);
    }
    // Só quem paga (o gestor, sem manager_id) pode abrir um checkout — um
    // funcionário não tem assinatura própria pra contratar.
    if (profile.manager_id) {
      return json({ error: "Só o gestor da conta pode contratar o plano." }, 403);
    }

    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${SITE_URL}/index.html?checkout=success`,
      cancel_url: `${SITE_URL}/pagamento-pendente.html?checkout=cancel`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("Erro criando checkout session:", err);
    return json({ error: "Não foi possível iniciar o checkout." }, 500);
  }
});
