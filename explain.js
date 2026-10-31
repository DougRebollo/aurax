/* AuraExplain — "Como esta nota é calculada".
 * Mostra, para cada dimensão da nota de oratória, o critério usado e o valor da própria sessão, para a
 * pessoa entender por que recebeu aquela pontuação. Os números abaixo espelham computeOratoriaScore (app.html)
 * e lang.js: se mudar um critério lá, mude aqui também.
 *
 * Entrada (formato da tabela `sessions`): { oratoria_subscores, wpm, pauses, filler_counts, slang_counts, transcript } */
(function () {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const words = (h) => (h.transcript || []).reduce((n, l) => n + String((l && l.text) || "").split(/\s+/).filter(Boolean).length, 0);

  function heavyTerms(h) {
    const L = window.AuraLang;
    if (!L) return [];
    const w = words(h);
    return L.analyzeFillers(h.filler_counts, w).concat(L.analyze(h.slang_counts, w)).filter((r) => r.status === "pesa");
  }

  const CRITERIA = {
    ritmo: (h) => `Você falou <b>${esc(h.wpm)}</b> palavras por minuto. De 110 a 160 vale 100. Abaixo de 110 a nota cai na mesma proporção; acima de 160 ela cai aos poucos.`,
    pausas: (h) => `<b>${esc(h.pauses || 0)}</b> ${h.pauses === 1 ? "pausa longa" : "pausas longas"} (silêncio de mais de 1min30). Até 2 não descontam; cada pausa a mais tira 10 pontos.`,
    vicios: (h) => {
      const heavy = heavyTerms(h).sort((a, b) => b.penalty - a.penalty).slice(0, 4);
      return "Vícios e gírias só descontam o que passa da tolerância por 100 palavras (de 0,5 a 1,5, conforme o peso da expressão). Um uso isolado não pesa. "
        + (heavy.length ? `Pesaram nesta sessão: ${heavy.map((r) => `<b>“${esc(r.key)}”</b> ×${r.count}`).join(", ")}.` : "Nesta sessão nada passou da tolerância.");
    },
    clareza: () => "Média da confiança com que o reconhecimento de fala do navegador entendeu você. É um indicador indireto: ruído, microfone e sotaque também baixam esse número, não só a dicção.",
    projecao: () => "Mede o quanto o volume da sua voz variou (de 15% a 45% de variação vale 100). Depende do microfone: a distância e o ganho dele mudam o resultado, e ele não mede se a voz chega bem ao cliente.",
  };

  function html(h) {
    const subs = (h && h.oratoria_subscores) || [];
    if (!subs.length) return "";
    const counted = subs.filter((s) => !s.excluded);
    const dropped = subs.length - counted.length;
    const rows = subs.map((s) => {
      const fn = CRITERIA[s.key];
      return `<li${s.excluded ? ' style="opacity:.55"' : ""}><span class="se-name">${esc(s.label)} <b>${Math.round(s.score)}</b>${s.excluded ? " (fora da nota)" : ""}</span>${fn ? `<span class="se-text">${fn(h)}</span>` : ""}</li>`;
    }).join("");
    return `<details class="score-explain">
      <summary>Como esta nota é calculada</summary>
      <p>A nota geral é a <b>média simples</b> das dimensões que puderam ser medidas nesta sessão (<b>${counted.length} de 5</b>). Uma dimensão sem dados suficientes fica de fora, em vez de entrar como zero.${dropped ? " Nesta sessão você falou pouco (menos de 35% do tempo), então ritmo, pausas e projeção — que medem a sua fala, não o seu silêncio — aparecem esmaecidos e não entram na nota." : ""}</p>
      <ul>${rows}</ul>
      <p class="se-foot">São aproximações automáticas para você acompanhar a sua própria evolução, sessão após sessão. Não são uma avaliação fonoaudiológica nem um julgamento sobre você.</p>
    </details>`;
  }

  window.AuraExplain = { html };
})();
