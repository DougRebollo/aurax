/* AuraFocus — transforma a nota de uma sessão em UMA recomendação prática.
 *
 * Tudo aqui é regra (sem IA generativa): escolhe o ponto de maior impacto,
 * mostra a frase da própria transcrição que o justifica, sugere uma ação e
 * uma meta para a próxima reunião e compara com as sessões anteriores.
 *
 * Entrada (mesmo formato da tabela `sessions`):
 *   h    = { oratoria_score, oratoria_subscores, wpm, pauses, transcript,
 *            filler_counts, slang_counts,
 *            objections, tips, dynamics }
 *   prev = sessões anteriores (mais recentes primeiro), só pra comparar.
 */
(function () {
  const SLANG_SWAPS = {
    beleza: "perfeito", valeu: "obrigado", sussa: "tranquilo", "da hora": "interessante",
    show: "ótimo", top: "excelente", galera: "equipe", "de boa": "sem problema",
  };

  const SUB_LABELS = {
    ritmo: "Ritmo de fala", pausas: "Pausas", vicios: "Vícios de linguagem",
    clareza: "Clareza/dicção", projecao: "Projeção de voz",
  };

  const ACTIONS = {
    vicios: "Escolha UM vício (o que mais aparece) e troque por uma pausa curta de meio segundo. Antes de responder, respire — a pausa soa mais segura que o \"né\".",
    ritmo_rapido: "Respire antes das frases-chave e faça pausas curtas entre as ideias. Grave um trecho seu e ouça pra calibrar o ritmo.",
    ritmo_lento: "Prepare a abertura e as frases principais antes da call; ensaiar em voz alta dá mais energia e fluidez.",
    pausas: "Prepare frases-ponte (\"deixa eu te mostrar um ponto…\") pra usar quando precisar de um segundo, em vez de deixar o silêncio se estender.",
    clareza: "Articule o final das palavras e fale um pouco mais perto do microfone. Se puder, use um fone com microfone melhor.",
    projecao: "Varie o tom nos pontos-chave: desacelere e fale com mais firmeza na proposta e no preço; a fala sem variação cansa quem ouve.",
    objecao_tensa: "Monte um roteiro de 2–3 frases para as objeções mais comuns (preço, prazo, concorrente) antes da próxima call, pra não improvisar na hora.",
    falou_por_cima: "Conte até dois depois que o cliente terminar antes de responder — o silêncio curto mostra que você realmente ouviu.",
    monologo_longo: "Depois de uns 60 segundos falando, faça uma pergunta ao cliente. Falas mais curtas mantêm a conversa equilibrada.",
    dominou_conversa: "Troque uma afirmação por uma pergunta aberta a cada poucos minutos e espere a resposta completa antes de continuar.",
    muitas_girias: "Grave um trecho seu e ouça de fora: a maioria das gírias é hábito automático que só percebemos ouvindo depois.",
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const clock = (n) => { const v = Math.round(n || 0); return Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0"); };
  const fmtS = (n) => { const v = Math.round(n || 0); return v < 60 ? v + "s" : Math.floor(v / 60) + "min" + String(v % 60).padStart(2, "0"); };
  const cleanTok = (t) => t.toLowerCase().replace(/[.,!?;:"'()]/g, "");

  const youLines = (h) => (h.transcript || []).filter((l) => l && l.text);   // análise individual: toda fala transcrita é do usuário
  const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
  const totalWords = (h) => youLines(h).reduce((n, l) => n + wordCount(l.text), 0);
  const subScore = (h, key) => {
    const s = (h.oratoria_subscores || []).find((x) => x.key === key);
    return s ? s.score : null;
  };
  const tipKeys = (h) => new Set((h.tips || []).filter((t) => t && t.type === "melhorar").map((t) => t.key));

  // Trecho citado: corta em ~200 caracteres e destaca (<mark>) as palavras dadas.
  function quote(text, highlight) {
    let t = text.trim();
    if (t.length > 200) t = t.slice(0, 200).replace(/\s+\S*$/, "") + "…";
    const set = new Set(highlight || []);
    return t.split(/(\s+)/).map((tok) => (set.has(cleanTok(tok)) ? `<mark>${esc(tok)}</mark>` : esc(tok))).join("");
  }

  // "então" não é vício; "é" só é vício quando puxado ("éé") ou repetido ("é é").
  const STRETCHED_E = /^é{2,}$/;
  const clean = (counts) => {
    const out = {};
    Object.entries(counts || {}).forEach(([w, c]) => { if (w !== "então") out[w] = c; });
    return out;
  };
  function fillerFlags(toks, keys) {
    return toks.map((t, i) => {
      if (STRETCHED_E.test(t)) return true;
      if (t === "é") return toks[i - 1] === "é" || toks[i + 1] === "é" || STRETCHED_E.test(toks[i - 1] || "") || STRETCHED_E.test(toks[i + 1] || "");
      return keys.includes(t);
    });
  }
  // Igual ao quote(), mas destaca por posição da palavra (flags[i] = a i-ésima palavra é vício).
  function quoteFlags(text, flags) {
    let t = text.trim();
    if (t.length > 200) t = t.slice(0, 200).replace(/\s+\S*$/, "") + "…";
    let wi = 0;
    return t.split(/(\s+)/).map((tok) => {
      if (/^\s+$/.test(tok) || !tok) return esc(tok);
      const hit = flags[wi++];
      return hit ? `<mark>${esc(tok)}</mark>` : esc(tok);
    }).join("");
  }

  // Fala informal que atrapalha negociação: uma recomendação por categoria (a biblioteca vive em lang.js).
  const CAT_FOCUS = {
    palavrao: { weight: 75, title: "Palavrões", action: "Palavrão sai no automático quando a conversa esquenta. Pratique uma frase de respiro (\"deixa eu pensar nesse ponto\") para o momento de tensão.", goal: "Meta: zero palavrões na próxima reunião." },
    inseguranca: { weight: 52, title: "Marcadores de insegurança", action: "Nas 3 frases que mais importam (preço, prazo e próximo passo), troque \"acho que\" e \"talvez\" por \"recomendo\" ou \"o prazo é\". Se faltar certeza, diga \"vou confirmar e te retorno\".", goal: "Meta: nenhum \"acho que\" nas frases de preço e prazo." },
    minimizador: { weight: 50, title: "Minimizadores", action: "Diga o tempo e o valor com o nome certo: \"15 minutos\" no lugar de \"rapidinho\", \"o investimento é\" no lugar de \"valorzinho\".", goal: "Meta: zero diminutivos ao falar de preço e tempo." },
    intimidade: { weight: 48, title: "Intimidade excessiva", action: "Chame o cliente pelo nome e guarde apelidos para quando ele usar primeiro. A distância profissional vale mais no primeiro contato.", goal: "Meta: usar só o nome da pessoa." },
    validacao: { weight: 46, title: "Busca de validação", action: "Em vez de \"entendeu?\" ou \"tá?\" a cada frase, pergunte uma vez ao fim de um bloco: \"faz sentido até aqui?\".", goal: "Meta: uma checagem por bloco, não por frase." },
    vagueza: { weight: 44, title: "Fala vaga", action: "Onde você diz \"coisa\" ou \"e tal\", nomeie: o item, o número, o prazo. Fale de olho nas anotações da proposta.", goal: "Meta: nomear o que for \"coisa\" nas partes de proposta." },
    muleta: { weight: 36, title: "Muletas de fala", action: "Corte \"basicamente\", \"na verdade\" e \"sinceramente\": elas enchem a frase e, no caso de \"sinceramente\", sugerem que o resto não é sincero.", goal: "Meta: reduzir pela metade as muletas." },
    exclamacao: { weight: 36, title: "Exclamações informais", action: "Troque a exclamação por uma pausa curta, que soa mais segura que \"eita\" ou \"caramba\".", goal: "Meta: sem exclamações informais." },
    informal: { weight: 36, title: "Fala coloquial", action: "Em reunião com cliente, fale \"estou\", \"vamos\" e \"você\" no lugar de \"tô\", \"vamo\" e \"cê\".", goal: "Meta: fala completa nas frases de proposta." },
  };
  function pickCandidate(h) {
    const cands = [];
    (h.oratoria_subscores || []).forEach((s) => {
      if (s.excluded) return; // sessão de escuta: ritmo/pausas/projeção não são o foco
      const key = s.key === "ritmo" ? (h.wpm > 160 ? "ritmo_rapido" : "ritmo_lento") : s.key;
      cands.push({ key, sub: s.key, weight: 100 - s.score });
    });
    const tips = tipKeys(h);
    const tipWeights = { objecao_tensa: 55, falou_por_cima: 45, monologo_longo: 45, dominou_conversa: 45, muitas_girias: 40 };
    Object.keys(tipWeights).forEach((k) => { if (tips.has(k)) cands.push({ key: k, sub: null, weight: tipWeights[k] }); });
    Object.keys(CAT_FOCUS).forEach((cat) => { if (tips.has("fala_" + cat)) cands.push({ key: "fala_" + cat, sub: null, weight: CAT_FOCUS[cat].weight }); });
    cands.sort((a, b) => b.weight - a.weight);
    return cands[0] || null;
  }

  // Cada builder devolve { title, why, example?: {label, html}, goal } — a ação vem de ACTIONS[key].
  const BUILDERS = {
    vicios(h) {
      const counts = clean(h.filler_counts);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const words = totalWords(h);
      const rate = words >= 50 ? Math.round((total / words) * 100) : null; // transcrição curta demais: taxa não é confiável
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const keys = Object.keys(counts).filter((k) => !k.includes(" ") && k !== "é");
      let best = null;
      youLines(h).forEach((l) => {
        const toks = l.text.split(/\s+/).map(cleanTok);
        const flags = fillerFlags(toks, keys);
        const n = flags.filter(Boolean).length;
        if (n >= 2 && toks.length >= 6 && (!best || n > best.n)) best = { n, line: l, flags };
      });
      return {
        title: "Vícios de linguagem",
        why: total
          ? `${total} ocorrências${rate != null ? ` (${rate} a cada 100 palavras)` : ""}` + (top.length ? ` — mais frequentes: ${top.map(([w, c]) => `“${esc(w)}” ×${c}`).join(", ")}.` : ".")
          : "Vícios de linguagem acima do ideal.",
        example: best ? { label: `Um trecho seu (${clock(best.line.t)})`, html: quoteFlags(best.line.text, best.flags) } : null,
        goal: rate != null ? `Meta: ${Math.max(3, Math.round(rate * 0.7))} vícios a cada 100 palavras (hoje: ${rate}).` : "Meta: reduzir pela metade o vício mais frequente.",
      };
    },
    ritmo_rapido(h) {
      let longest = null;
      youLines(h).forEach((l) => { const n = wordCount(l.text); if (n >= 25 && (!longest || n > longest.n)) longest = { n, line: l }; });
      return {
        title: "Ritmo de fala acelerado",
        why: `${h.wpm} palavras por minuto — o ideal para negociação fica entre 110 e 160.`,
        example: longest ? { label: `Trecho longo sem respirar (${longest.n} palavras, ${clock(longest.line.t)})`, html: quote(longest.line.text) } : null,
        goal: "Meta: ficar entre 130 e 150 palavras/min.",
      };
    },
    ritmo_lento(h) {
      return {
        title: "Ritmo de fala devagar",
        why: `${h.wpm} palavras por minuto — abaixo de 110 a fala pode soar insegura ou perder a atenção.`,
        example: null,
        goal: "Meta: chegar a 110–130 palavras/min.",
      };
    },
    pausas(h) {
      return {
        title: "Pausas longas",
        why: `${h.pauses || 0} pausas longas nesta sessão — podem passar hesitação na condução.`,
        example: null,
        goal: "Meta: no máximo 2 pausas longas por reunião.",
      };
    },
    clareza(h) {
      const s = subScore(h, "clareza");
      return {
        title: "Clareza e dicção",
        why: `O reconhecimento de fala teve dificuldade em entender parte da sua fala (nota ${Math.round(s)}/100). Pode ser dicção, ritmo ou o microfone captando baixo.`,
        example: null,
        goal: "Meta: clareza acima de 80.",
      };
    },
    projecao(h) {
      const s = subScore(h, "projecao");
      return {
        title: "Projeção e variação de voz",
        why: `O volume da sua voz variou pouco (nota ${Math.round(s)}/100) — fala sem variação cansa quem ouve.`,
        example: null,
        goal: "Meta: projeção acima de 80.",
      };
    },
    objecao_tensa(h) {
      const o = (h.objections || [])[0];
      return {
        title: "Resposta a objeções",
        why: "A resposta ao cliente nas objeções pareceu tensa ou hesitante.",
        example: o ? { label: `Objeção do cliente (${clock(o.t)})`, html: `“${esc(o.phrase)}” → ${esc(o.result)}` } : null,
        goal: "Meta: ter uma resposta pronta para as 2 objeções mais comuns.",
      };
    },
    falou_por_cima(h) {
      const n = (h.dynamics && h.dynamics.interruptions) || 0;
      return {
        title: "Falar por cima do cliente",
        why: `Você começou a falar no meio da fala do cliente ${n} ${n === 1 ? "vez" : "vezes"}.`,
        example: null,
        goal: "Meta: no máximo 1 vez por reunião.",
      };
    },
    monologo_longo(h) {
      const s = (h.dynamics && h.dynamics.longestYou) || 0;
      return {
        title: "Falas longas sem pausa",
        why: `Sua fala mais longa durou ${fmtS(s)} seguidos — o cliente ficou muito tempo só ouvindo.`,
        example: null,
        goal: "Meta: falas de no máximo 60 segundos seguidos.",
      };
    },
    dominou_conversa(h) {
      const p = (h.dynamics && h.dynamics.pctYou) || 0;
      return {
        title: "Você dominou a conversa",
        why: `Você ficou com ${p}% do tempo de fala — pouco espaço para o cliente.`,
        example: null,
        goal: "Meta: ficar abaixo de 60% do tempo de fala.",
      };
    },
    muitas_girias(h) {
      const L0 = window.AuraLang;
      const counts = Object.fromEntries(Object.entries(h.slang_counts || {}).filter(([k]) => !L0 || L0.categoryOf(k) === "giria"));
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const total = top.reduce((n, [, c]) => n + c, 0);
      const word = top[0] && top[0][0];
      const line = word ? youLines(h).find((l) => (" " + l.text.toLowerCase() + " ").includes(" " + word + " ")) : null;
      return {
        title: "Gírias e informalidades",
        why: `${total} ocorrências` + (top.length ? ` — mais frequentes: ${top.slice(0, 3).map(([w, c]) => `“${esc(w)}” ×${c}${(L0 && L0.swaps[w]) || SLANG_SWAPS[w] ? ` → ${esc((L0 && L0.swaps[w]) || SLANG_SWAPS[w])}` : ""}`).join(", ")}.` : "."),
        example: line ? { label: `Um trecho seu (${clock(line.t)})`, html: quote(line.text, [word]) } : null,
        goal: "Meta: no máximo 2 gírias por reunião.",
      };
    },
  };

  Object.keys(CAT_FOCUS).forEach((cat) => {
    ACTIONS["fala_" + cat] = CAT_FOCUS[cat].action;
    BUILDERS["fala_" + cat] = (h) => {
      const L = window.AuraLang, cfg = CAT_FOCUS[cat];
      const row = L ? L.byCategory(h.slang_counts, totalWords(h)).find((c) => c.cat === cat) : null;
      const terms = row ? row.terms.slice().sort((a, b) => b.count - a.count).slice(0, 3) : [];
      const line = L ? youLines(h).find((l) => L.detectSlang(l.text).some((k) => L.categoryOf(k) === cat)) : null;
      return {
        title: cfg.title,
        why: row
          ? `${row.count} ${row.count === 1 ? "ocorrência" : "ocorrências"} (${terms.map((t) => `“${esc(t.key)}” ×${t.count}`).join(", ")}) — ${esc(L.CATEGORY_WHY[cat])}.`
          : "Esse tipo de fala informal apareceu acima do ideal.",
        example: line ? { label: `Um trecho seu (${clock(line.t)})`, html: quote(line.text) } : null,
        goal: cfg.goal,
      };
    };
  });

  function compare(h, prev, cand) {
    const key = cand.sub;
    const read = (s) => (key ? subScore(s, key) : s.oratoria_score);
    const vals = (prev || []).map(read).filter((v) => v != null);
    const now = read(h);
    if (!vals.length || now == null) return null;
    const mean = Math.round(avg(vals));
    return { label: key ? SUB_LABELS[key] : "Nota geral", n: vals.length, mean, now: Math.round(now), diff: Math.round(now) - mean };
  }

  function build(h, prev) {
    if (!h) return null;
    const cand = pickCandidate(h);
    if (!cand || !BUILDERS[cand.key]) return null;
    const b = BUILDERS[cand.key](h);
    const subs = (h.oratoria_subscores || []).filter((x) => !x.excluded).sort((x, y) => y.score - x.score);
    const best = subs[0] && subs[0].score >= 80 && subs[0].key !== cand.sub ? subs[0] : null;
    const polish = cand.weight < 25; // nada realmente fraco: o foco é só o critério mais baixo
    if (polish && cand.sub) {
      b.why = `Seu critério mais baixo (${SUB_LABELS[cand.sub]}: ${Math.round(100 - cand.weight)}/100) — um ajuste pequeno aqui eleva a nota geral.`;
    }
    return {
      eyebrow: polish ? "Para subir de nível" : "Foco para a próxima reunião",
      ...b,
      action: ACTIONS[cand.key],
      compare: compare(h, prev, cand),
      strength: best ? { label: SUB_LABELS[best.key] || best.label, score: Math.round(best.score) } : null,
    };
  }

  function render(h, prev) {
    const f = build(h, prev);
    if (!f) return "";
    const cmp = f.compare
      ? `<div class="fn-compare">Nas suas últimas ${f.compare.n} ${f.compare.n === 1 ? "sessão" : "sessões"}, <b>${esc(f.compare.label)}</b> ficou em média <b>${f.compare.mean}</b>; hoje: <b>${f.compare.now}</b> `
        + `<span class="${f.compare.diff > 0 ? "up" : f.compare.diff < 0 ? "down" : ""}">${f.compare.diff > 0 ? "▲ +" + f.compare.diff : f.compare.diff < 0 ? "▼ " + f.compare.diff : "= igual"}</span></div>`
      : "";
    return `<div class="focus-next">
      <div class="fn-eyebrow">${esc(f.eyebrow)}</div>
      <h3>${esc(f.title)}</h3>
      <p class="fn-why">${f.why}</p>
      ${f.example ? `<div class="fn-example"><span>${esc(f.example.label)}</span><blockquote>${f.example.html}</blockquote></div>` : ""}
      <div class="fn-action"><b>Na próxima reunião:</b> ${esc(f.action)}<div class="fn-goal">${esc(f.goal)}</div></div>
      ${cmp}
      ${f.strength ? `<div class="fn-strength">✓ Ponto forte: ${esc(f.strength.label)} (${f.strength.score}/100) — mantenha.</div>` : ""}
    </div>`;
  }

  // ----- Resumo em texto puro para colar numa nota de CRM -----
  const plain = (html) => { const d = document.createElement("div"); d.innerHTML = html || ""; return d.textContent.replace(/\s+/g, " ").trim(); };
  const RANKS = [[90, "Excelente"], [70, "Bom"], [50, "Médio"], [0, "Precisa de atenção"]];

  /* h: sessão no formato da tabela (client_name, date, duration, id, ...).
   * Não leva a transcrição: só nota, números e foco — nada falado pelo cliente. */
  function crmNote(h, prev) {
    // Cada linha começa com "•": se o CRM juntar tudo num parágrafo (perdendo as
    // quebras de linha), os tópicos continuam separados e legíveis.
    const SHORT = { ritmo: "Ritmo", pausas: "Pausas", vicios: "Vícios", clareza: "Clareza", projecao: "Projeção" };
    const L = [];
    const when = h.date ? new Date(h.date) : new Date();
    L.push(`AuraX · Análise da call${h.client_name ? " — " + h.client_name : ""} · ${when.toLocaleDateString("pt-BR")}${h.duration ? " · " + fmtS(h.duration) : ""}`);
    if (h.oratoria_score != null) {
      const rank = RANKS.find(([min]) => h.oratoria_score >= min)[1];
      L.push(`• Nota de oratória: ${h.oratoria_score}/100 (${rank})`);
    }
    const subs = h.oratoria_subscores || [];
    if (subs.length) L.push("• Critérios: " + subs.map((x) => `${SHORT[x.key] || x.label} ${Math.round(x.score)}`).join(" · "));
    const facts = [];
    if (h.wpm) facts.push(`${h.wpm} palavras/min`);
    if (h.pauses) facts.push(`${h.pauses} ${h.pauses === 1 ? "pausa longa" : "pausas longas"}`);
    if (facts.length) L.push("• Ritmo: " + facts.join(" · "));
    if (h.objections && h.objections.length) {
      L.push("• Objeções: " + h.objections.map((o) => `${clock(o.t)} "${o.phrase}" → ${o.result}`).join("; "));
    }
    const AL = window.AuraLang;
    if (AL && h.slang_counts) {
      const cats = AL.byCategory(h.slang_counts, totalWords(h)).filter((c) => c.penalty > 0);
      if (cats.length) {
        L.push("• Fala informal que pesou: " + cats.slice(0, 3).map((c) =>
          `${c.label} (${c.terms.filter((r) => r.status === "pesa").slice(0, 2).map((r) => `"${r.key}" ×${r.count}`).join(", ")})`).join(" · "));
      }
    }
    const f = build(h, prev);
    if (f) {
      L.push(`• Foco para a próxima reunião: ${f.title} — ${plain(f.why).split(" — mais frequentes")[0].replace(/\.$/, "")}`);
      L.push(`• ${f.goal}`);
    }
    if (h.id) {
      let link = "sessoes.html?id=" + encodeURIComponent(h.id);
      try { link = new URL(link, location.href).href; } catch (e) { /* mantém o link relativo */ }
      L.push("• Análise completa: " + link);
    }
    return L.join("\n");
  }

  // Copia pro clipboard (com plano B pra navegadores que bloqueiam a API).
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { /* sem permissão */ }
      ta.remove();
      return ok;
    }
  }

  window.AuraFocus = { build, render, crmNote, copyText, ACTIONS };
})();
