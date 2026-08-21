// Gera um resumo estruturado da call (objetivo / objeção / próximo passo)
// via Claude, a partir da transcrição já salva. Essa é a ÚNICA chamada de
// IA generativa de verdade no AuraX hoje — a nota de oratória, vícios de
// linguagem e detecção de objeção continuam sendo regra escrita, não IA.
// Vale deixar isso claro se alguém perguntar sobre "IA" no produto.
//
// Segredos necessários (Supabase -> Project Settings -> Edge Functions):
//   ANTHROPIC_API_KEY      - chave da API da Anthropic (console.anthropic.com)
//   SUPABASE_URL / SUPABASE_ANON_KEY - já vêm preenchidos automaticamente
//
// Autenticado com o próprio token do usuário (não service role) — o select
// e o update na sessão passam pelas policies normais de RLS, então só dá
// pra gerar resumo (e só grava) na PRÓPRIA sessão de quem chamou.
//
// Deploy: supabase functions deploy summarize-session

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.70.0";
import { zodOutputFormat } from "https://esm.sh/@anthropic-ai/sdk@0.70.0/helpers/zod";
import { z } from "https://esm.sh/zod@3.24.1";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

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

const SummarySchema = z.object({
  objetivo: z
    .string()
    .describe("O objetivo da call em uma frase curta — o que essa conversa tentou alcançar."),
  objecao: z
    .string()
    .describe(
      "A principal objeção/obstáculo levantado pelo cliente durante a call. Se não houve nenhuma objeção clara na transcrição, diga isso explicitamente em vez de inventar uma."
    ),
  proximo_passo: z
    .string()
    .describe(
      "O próximo passo combinado ao final da call (prazo, ação, quem fica responsável). Se não ficou nenhum combinado claro na transcrição, diga isso explicitamente."
    ),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { sessionId } = await req.json();
    if (!sessionId) return json({ error: "sessionId é obrigatório." }, 400);

    // RLS ("Ver as proprias sessoes") já garante que só vem sessão de quem
    // está autenticado nessa chamada — não precisa checar user_id de novo.
    const { data: sessionRow, error: fetchError } = await supabase
      .from("sessions")
      .select("transcript, client_name")
      .eq("id", sessionId)
      .single();

    if (fetchError || !sessionRow) {
      return json({ error: "Sessão não encontrada ou sem permissão." }, 404);
    }

    const transcript = sessionRow.transcript as Array<{ speaker?: string; text?: string }> | null;
    if (!Array.isArray(transcript) || transcript.length < 4) {
      return json({ error: "Transcrição curta demais pra gerar um resumo." }, 422);
    }

    const transcriptText = transcript
      .map((line) => `[${line.speaker || "?"}] ${line.text ?? ""}`)
      .join("\n");

    const response = await anthropic.messages.parse({
      model: "claude-opus-5",
      max_tokens: 1024,
      system:
        "Você resume calls de vendas/negociação em português do Brasil, de forma objetiva e curta. Baseie-se só no que está na transcrição — nunca invente informação que não apareceu ali.",
      messages: [
        {
          role: "user",
          content: `Transcrição da call${sessionRow.client_name ? ` com ${sessionRow.client_name}` : ""}:\n\n${transcriptText}`,
        },
      ],
      output_config: { format: zodOutputFormat(SummarySchema) },
    });

    if (!response.parsed_output) {
      return json({ error: "Não foi possível gerar o resumo." }, 500);
    }

    const { error: updateError } = await supabase
      .from("sessions")
      .update({ ai_summary: response.parsed_output })
      .eq("id", sessionId);

    if (updateError) {
      console.error("Erro salvando ai_summary:", updateError.message);
      return json({ error: "Resumo gerado, mas não foi possível salvar." }, 500);
    }

    return json({ summary: response.parsed_output });
  } catch (err) {
    console.error("Erro gerando resumo:", err);
    return json({ error: "Não foi possível gerar o resumo agora." }, 500);
  }
});
