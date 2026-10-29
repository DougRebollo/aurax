# AuraX — ativar o Stripe (modo teste primeiro)

O código já está pronto no repositório (nada de chave aqui; **chaves nunca no chat**, só direto no painel).

## 1. No Stripe (conta em modo teste/sandbox)
1. **Produtos** (Catálogo de produtos → Adicionar), cobrança recorrente mensal em BRL:
   - `AuraX Profissional` — R$ 219,00/mês → copiar o **Price ID** (`price_...`)
   - `AuraX Individual` — R$ 119,90/mês → copiar o **Price ID**
2. **Chave secreta de teste**: Desenvolvedores → Chaves de API → `sk_test_...` (revelar e copiar direto pro Supabase, passo 2).
3. **Portal do cliente**: Configurações → Faturamento → Portal do cliente → ativar; permitir cancelar assinatura, atualizar forma de pagamento e ver faturas → Salvar.
4. (Opcional) **Cupom para amigos testarem sem cartão**: Cupons → 100% de desconto, "para sempre" → criar um **código promocional** (ex.: `AMIGO`). O checkout já aceita código e não pede cartão quando o total é zero.

## 2. No Supabase (projeto tpjdogzhwandxwpwafzz) → Edge Functions → Secrets
| Nome | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_PRICE_ID` | price do Profissional |
| `STRIPE_PRICE_ID_INDIVIDUAL` | price do Individual |
| `STRIPE_WEBHOOK_SECRET` | (vem no passo 4) |

## 3. Publicar as 3 funções
Pasta `supabase/functions/`: `create-checkout-session`, `create-portal-session`, `stripe-webhook` (esta **sem** verificação de JWT).
- Sem CLI instalado: Supabase → Edge Functions → *Deploy a new function* → *Via Editor*, colar o `index.ts` de cada uma. Na `stripe-webhook`, desligar "Verify JWT".
- Com CLI: `supabase functions deploy <nome>` (e `--no-verify-jwt` na do webhook).

## 4. Webhook no Stripe
Desenvolvedores → Webhooks → Adicionar endpoint:
- URL: `https://tpjdogzhwandxwpwafzz.supabase.co/functions/v1/stripe-webhook`
- Eventos: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- Copiar o **Signing secret** (`whsec_...`) → secret `STRIPE_WEBHOOK_SECRET` no Supabase (passo 2).

## 5. Teste de ponta a ponta (cartão de teste `4242 4242 4242 4242`, qualquer data futura/CVC)
1. Criar conta nova (gestor) → entra sem plano → tentar gravar → "Ver planos" → **Assinar e continuar**.
2. Pagar no Stripe → volta pro AuraX → conta deve virar **ativa** (confirmar em `profiles.account_status`).
3. Repetir com conta **Individual** (deve cobrar R$ 119,90).
4. Barra lateral → **Gerenciar assinatura** → abre o portal → cancelar → conta vira **bloqueada**.
5. Falha de pagamento: cartão `4000 0000 0000 0341` na renovação → `bloqueada`.
6. Reenvio do mesmo evento não pode duplicar (tabela `stripe_webhook_events`).

## 6. Ir pro ar (modo real)
Trocar `sk_test` → `sk_live`, recriar os 2 preços e o webhook no modo real, atualizar os 4 secrets. Antes: termos de uso/privacidade publicados e CNPJ/MEI definido na conta Stripe.
