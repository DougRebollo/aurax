/* AuraLang — dicionário de gírias com PESO e a análise que decide o que pesa na nota.
 *
 * Regra de produto (essencial): detectar tudo, mas NÃO tratar toda gíria como erro.
 * O que conta é frequência, contexto e impacto:
 *   - frequência: cada peso tem uma tolerância (usos por 100 palavras) antes de descontar;
 *   - contexto: algumas expressões só contam em certos usos (ex.: "legal" como interjeição,
 *     não como "departamento legal"; "fechou" como confirmação, não "fechou o contrato");
 *   - impacto: o desconto cresce com o peso e tem teto por termo, para uma palavra só
 *     não derrubar a nota inteira.
 *
 * Pesos: 0 neutra (só mostra) · 1 leve · 2 média · 3 forte.
 * Para editar o dicionário, mexa só na lista ENTRIES abaixo.
 */
(function () {
  const WEIGHT_LABEL = ["neutra", "leve", "média", "forte"];
  const TOLERANCE = { 0: Infinity, 1: 1.5, 2: 0.5, 3: 0.1 };   // usos por 100 palavras sem desconto
  const FACTOR = { 0: 0, 1: 0.5, 2: 1, 3: 2 };                 // unidades de desconto por uso acima da tolerância
  const CAP_PER_TERM = 3;                                       // teto de unidades por termo
  const SCORE_SCALE = 12;                                       // 12 unidades = nota 0 (mesma escala dos vícios)

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[.,!?;:"'()…\-]/g, " ").replace(/\s+/g, " ").trim();
  const prevWord = (n, m) => (n.slice(0, m.index).trim().split(" ").pop() || "");
  const nextWord = (n, m) => (n.slice(m.index + m[0].length).trim().split(" ")[0] || "");
  const atStart = (n, m) => m.index === 0;

  // k = chave (como aparece nos relatórios), p = padrão (sem acento, aceita flexões), w = peso,
  // swap = troca sugerida, ctx = condição de contexto (opcional).
  const ENTRIES = [
    // ---- 0 · neutras: confirmações naturais em negociação (aparecem, não descontam) ----
    { k: "combinado", p: "combinado", w: 0, swap: "", ctx: (n, m) => atStart(n, m) || ["entao", "ta", "ok", "ficou"].includes(prevWord(n, m)) },
    { k: "fechou", p: "fechou", w: 0, swap: "", ctx: (n, m) => (atStart(n, m) || ["entao", "ta", "ok"].includes(prevWord(n, m))) && !["o", "a", "os", "as", "com", "um", "uma", "negocio", "contrato", "venda", "parceria", "pedido"].includes(nextWord(n, m)) },

    // ---- 1 · leves ----
    { k: "beleza", p: "beleza", w: 1, swap: "perfeito", ctx: (n, m) => !["a", "da", "de", "na", "uma", "essa", "sua", "toda", "pela", "com"].includes(prevWord(n, m)) },
    { k: "show", p: "show", w: 1, swap: "ótimo", ctx: (n, m) => !["o", "um", "no", "do", "este", "esse", "aquele"].includes(prevWord(n, m)) },
    { k: "legal", p: "legal", w: 1, swap: "ótimo / entendi",
      ctx: (n, m) => (atStart(n, m) || ["muito", "bem", "super", "achei", "ficou", "esta", "ta", "e", "foi", "isso"].includes(prevWord(n, m)))
        && !["departamento", "aspecto", "aspectos", "questao", "parte", "area", "time", "equipe", "consultoria", "assessoria", "responsabilidade", "representante", "juridico", "contrato", "pessoa", "entidade", "advogado"].includes(nextWord(n, m)) },
    { k: "massa", p: "massa", w: 1, swap: "ótimo", ctx: (n, m) => !["em", "de", "da", "na", "a", "uma", "essa", "dessa"].includes(prevWord(n, m)) && !["de", "salarial", "critica", "monetaria", "muscular"].includes(nextWord(n, m)) },
    { k: "bacana", p: "bacana", w: 1, swap: "interessante" },
    { k: "tranquilo", p: "tranquilo", w: 1, swap: "sem problemas", ctx: (n, m) => atStart(n, m) || ["ta", "esta", "ok", "entao", "beleza", "isso"].includes(prevWord(n, m)) },
    { k: "top", p: "top", w: 1, swap: "excelente", ctx: (n, m) => !["de", "of", "do", "line", "performer"].includes(nextWord(n, m)) && !/^\d+$/.test(nextWord(n, m)) },
    { k: "cara", p: "cara", w: 1, swap: "(pode omitir)", ctx: (n, m) => (atStart(n, m) || ["olha", "entao", "mas", "e", "po", "ei", "oi", "ah"].includes(prevWord(n, m))) && nextWord(n, m) !== "a" },
    { k: "valeu", p: "valeu", w: 1, swap: "obrigado" },
    { k: "pegar", p: "(?:vou|vamos|posso|podemos|preciso|precisa|vai)\\s+peg(?:ar|o)|pego\\s+(?:esses|essas|os|as|isso|esse|essa)", w: 1, swap: "levantar / obter" },
    { k: "dar uma olhada", p: "d(?:ar|ou|a|amos|ando|ei|aria|e)\\s+uma\\s+olhad(?:a|inha)", w: 1, swap: "analisar" },
    { k: "dar um toque", p: "d(?:ar|ou|a|amos|ando|ei|e)\\s+um\\s+toque", w: 1, swap: "avisar / retornar" },
    { k: "bater um papo", p: "bat(?:er|o|e|emos|endo|i)\\s+um\\s+papo|papinho", w: 1, swap: "conversar" },
    { k: "puxar", p: "pux(?:ar|o|a|amos|ando|ei)\\s+(?:esse|essa|isso|o|a|um|uma)", w: 1, swap: "tratar / levar" },

    // ---- 2 · médias ----
    { k: "sacou", p: "sacou", w: 2, swap: "entendeu?" },
    { k: "quebrar um galho", p: "quebr(?:ar|o|a|amos|ando|ei)\\s+um\\s+galho", w: 2, swap: "ajudar / flexibilizar" },
    { k: "correr atrás", p: "corr(?:er|o|e|emos|endo|i)\\s+atras", w: 2, swap: "buscar / providenciar" },
    { k: "de boa", p: "de\\s+boa", w: 2, swap: "sem problema" },
    { k: "na correria", p: "na\\s+correria", w: 2, swap: "com a agenda cheia" },
    { k: "bora", p: "bora", w: 2, swap: "vamos" },
    { k: "junto e misturado", p: "junto\\s+e\\s+misturado", w: 2, swap: "de forma integrada" },
    { k: "mandar ver", p: "mand(?:ar|o|a|amos|ando|ei|e)\\s+ver", w: 2, swap: "executar" },
    { k: "dar match", p: "d(?:ar|ou|a|amos|ando|eu|e)\\s+match", w: 2, swap: "ter aderência / atender" },
    { k: "sussa", p: "sussa", w: 2, swap: "sem problema" },
    { k: "da hora", p: "da\\s+hora", w: 2, swap: "interessante" },
    { k: "galera", p: "galera", w: 2, swap: "equipe / pessoal" },

    // ---- 3 · fortes ----
    { k: "mano", p: "mano", w: 3, swap: "(omitir)" },
    { k: "bagulho", p: "bagulho", w: 3, swap: "assunto" },
    { k: "treco", p: "treco", w: 3, swap: "item" },
    { k: "pô", p: "po", w: 3, swap: "(omitir)", ctx: (n, m) => atStart(n, m) || ["e", "mas", "ah", "ai", "nossa"].includes(prevWord(n, m)) },
  ];

  const BY_KEY = {};
  ENTRIES.forEach((e) => {
    e.re = new RegExp("(?<![a-z0-9])(?:" + e.p + ")(?![a-z0-9])", "g");
    BY_KEY[e.k] = e;
  });
  const swaps = {};
  ENTRIES.forEach((e) => { swaps[e.k] = e.swap; });

  // Todas as ocorrências (com repetição) na frase, já respeitando o contexto de cada termo.
  function detectSlang(text) {
    const n = norm(text), out = [];
    ENTRIES.forEach((e) => {
      e.re.lastIndex = 0;
      let m;
      while ((m = e.re.exec(n))) {
        if (!e.ctx || e.ctx(n, m)) out.push(e.k);
        if (m[0].length === 0) e.re.lastIndex++;
      }
    });
    return out;
  }

  const weightOf = (k) => (BY_KEY[k] ? BY_KEY[k].w : 1);   // termo fora do dicionário: tratado como leve

  // Para cada termo detectado: densidade, tolerância e se pesa na nota.
  function analyze(slangCounts, words) {
    const rows = Object.entries(slangCounts || {}).map(([k, count]) => {
      const w = weightOf(k), density = words > 0 ? (count / words) * 100 : 0, tol = TOLERANCE[w];
      const excess = Math.max(0, density - tol);
      const penalty = w === 0 ? 0 : Math.min(CAP_PER_TERM, excess * FACTOR[w]);
      return { key: k, count, weight: w, label: WEIGHT_LABEL[w], density, tolerance: tol, penalty, status: w === 0 ? "neutra" : penalty > 0 ? "pesa" : "ok", swap: swaps[k] || "" };
    });
    rows.sort((a, b) => b.penalty - a.penalty || b.weight - a.weight || b.count - a.count);
    return rows;
  }

  // Nota de "vícios e gírias": vícios contam como antes (taxa por 100 palavras); gírias entram só pelo que pesa.
  function languageScore(fillerCounts, slangCounts, words) {
    const totalFiller = Object.values(fillerCounts || {}).reduce((a, b) => a + b, 0);
    const fillerUnits = words > 0 ? (totalFiller / words) * 100 : 0;
    const slangUnits = analyze(slangCounts, words).reduce((a, r) => a + r.penalty, 0);
    const score = Math.max(0, Math.min(1, 1 - (fillerUnits + slangUnits) / SCORE_SCALE)) * 100;
    return { score, fillerUnits, slangUnits };
  }

  window.AuraLang = { ENTRIES, WEIGHT_LABEL, swaps, detectSlang, weightOf, analyze, languageScore, TOLERANCE };
})();
