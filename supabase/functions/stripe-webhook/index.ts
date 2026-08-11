// Webhook do Stripe — única fonte de verdade pra liberar/bloquear uma conta.
// O front-end NUNCA marca a conta como paga sozinho (o retorno do checkout
// no navegador pode ser fechado, atualizado ou simulado) — só esse endpoint,
// depois de validar a assinatura do Stripe, decide isso.
//
// Segredos necessários (Supabase -> Project Settings -> Edge Functions):
//   STRIPE_SECRET_KEY      - chave secreta do Stripe
//   STRIPE_WEBHOOK_SECRET  - "signing secret" do endpoint (Stripe Dashboard
//                            -> Developers -> Webhooks -> esse endpoint)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - já vêm preenchidos
//
// Esse endpoint precisa aceitar requisições SEM um JWT do Supabase (quem
// chama é o Stripe, não um usuário logado) — configurado em
// supabase/config.toml com verify_jwt = false pra essa função.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Depois, registrar a URL no Stripe Dashboard (Developers -> Webhooks) e
// colar o "signing secret" gerado como STRIPE_WEBHOOK_SECRET.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

async function setStatusByCustomer(customerId: string, status: string, extra: Record<string, unknown> = {}) {
  await supabaseAdmin
    .from("profiles")
    .update({ account_status: status, ...extra })
    .eq("stripe_customer_id", customerId);
}

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  if (!signature) {
    return new Response("Assinatura ausente.", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Assinatura do webhook inválida:", (err as Error).message);
    return new Response("Assinatura inválida.", { status: 400 });
  }

  // Idempotência: registra o evento ANTES de processar. Se já existir (chave
  // primária duplicada), é um reenvio — responde 200 sem aplicar de novo.
  // Trade-off consciente: se o processamento falhar DEPOIS desse insert, o
  // evento fica marcado como "visto" sem ter sido aplicado. Pra esse volume
  // de eventos (uma assinatura por conta), simplicidade > exatidão perfeita
  // nesse caso raro — dá pra reconciliar manualmente se acontecer.
  const { error: insertError } = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ id: event.id, event_type: event.type });
  if (insertError) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.customer === "string" && typeof session.subscription === "string") {
          await setStatusByCustomer(session.customer, "ativa", {
            stripe_subscription_id: session.subscription,
          });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (typeof invoice.customer === "string") {
          await setStatusByCustomer(invoice.customer, "ativa");
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (typeof invoice.customer === "string") {
          // Falha na primeira cobrança (assinatura ainda nem começou de
          // verdade) mantém "pendente_pagamento" — só marca "bloqueada"
          // quando já era uma assinatura ativa que parou de pagar.
          const status = invoice.billing_reason === "subscription_create" ? "pendente_pagamento" : "bloqueada";
          await setStatusByCustomer(invoice.customer, status);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        if (typeof subscription.customer === "string") {
          await setStatusByCustomer(subscription.customer, "bloqueada");
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Erro processando evento do Stripe:", err);
    return new Response(JSON.stringify({ error: "Erro ao processar evento." }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
