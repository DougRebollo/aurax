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
 *
 * Categorias (campo cat; sem cat = gíria): o que cada tipo de fala informal faz com uma negociação.
 *   inseguranca  "acho que", "talvez", "vou tentar"   → enfraquecem proposta, preço e compromisso
 *   minimizador  "rapidinho", "só queria", "valorzinho" → encolhem o valor do que você oferece
 *   vagueza      "coisa", "e tal", "esse negócio"       → falta de precisão onde o cliente espera número
 *   validacao    "entendeu?", "tá?", "viu?"             → buscam aprovação a cada frase
 *   intimidade   "parceiro", "brother", "galera"        → familiaridade demais com quem você acabou de conhecer
 *   palavrao     palavrões                              → risco direto de imagem
 *   muleta       "basicamente", "na verdade", "sinceramente"
 *   exclamacao   "caramba", "eita", "meu Deus"
 *   informal     "tô", "vamo", "cê"                     → fala coloquial escrita
 *   giria        o resto das gírias
 * Vícios de preenchimento ("né", "tipo", "ahn"...) seguem a mesma lógica na lista FILLERS (mais abaixo).
 * Para editar o dicionário, mexa só nas listas ENTRIES (gírias e fala informal) e FILLERS (vícios).
 */
(function () {
  const WEIGHT_LABEL = ["neutra", "leve", "média", "forte"];
  const TOLERANCE = { 0: Infinity, 1: 1.5, 2: 0.5, 3: 0.1 };   // usos por 100 palavras sem desconto
  const FACTOR = { 0: 0, 1: 0.5, 2: 1, 3: 2 };                 // unidades de desconto por uso acima da tolerância
  const CAP_PER_TERM = 3;                                       // teto de unidades por termo
  // Soma geral: vários termos leves, cada um abaixo da própria tolerância, ainda somam fala informal demais.
  // Densidade ponderada = (usos x peso) por 100 palavras; acima de AGG_TOL, cada ponto vale AGG_FACTOR unidade.
  const AGG_TOL = 3, AGG_FACTOR = 1, AGG_CAP = 5, AGG_MIN_WORDS = 150;
  const SCORE_SCALE = 12;                                       // 12 unidades = nota 0 (mesma escala dos vícios)

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[.,!?;:"'()…\-]/g, " ").replace(/\s+/g, " ").trim();
  const prevWord = (n, m) => (n.slice(0, m.index).trim().split(" ").pop() || "");
  const nextWord = (n, m) => (n.slice(m.index + m[0].length).trim().split(" ")[0] || "");
  const atStart = (n, m) => m.index === 0;
  const atEnd = (n, m) => m.index + m[0].length === n.length;
  // vocativo: chamar a pessoa pelo apelido (começo/fim da fala ou depois de "e", "olha", "opa"...)
  const vocative = (n, m) => atStart(n, m) || ["olha", "oi", "ola", "opa", "fala", "bom", "entao", "valeu", "obrigado", "ta", "ai"].includes(prevWord(n, m));

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

    // ================= Biblioteca de negociação =================
    // ---- Insegurança: enfraquecem a proposta, o preço e o compromisso ----
    { k: "acho que", cat: "inseguranca", p: "(?:eu\\s+)?acho\\s+que", w: 2, swap: "recomendo / minha leitura é" },
    { k: "talvez", cat: "inseguranca", p: "talvez", w: 1, swap: "afirme, ou diga do que depende" },
    { k: "meio que", cat: "inseguranca", p: "meio\\s+que", w: 2, swap: "(omitir)" },
    { k: "mais ou menos", cat: "inseguranca", p: "mais\\s+ou\\s+menos", w: 1, swap: "aproximadamente (com o número)" },
    { k: "sei lá", cat: "inseguranca", p: "sei\\s+la", w: 2, swap: "vou confirmar e te retorno" },
    { k: "não sei", cat: "inseguranca", p: "nao\\s+sei(?:\\s+se)?", w: 1, swap: "vou confirmar e te retorno" },
    { k: "vou tentar", cat: "inseguranca", p: "(?:vou|vamos)\\s+tentar|(?:vou|vamos)\\s+ver\\s+se|a\\s+gente\\s+(?:tenta|ve\\s+se)", w: 2, swap: "vou fazer / me comprometo a" },
    { k: "de repente", cat: "inseguranca", p: "de\\s+repente", w: 1, swap: "afirme, ou ofereça uma opção" },
    { k: "quem sabe", cat: "inseguranca", p: "quem\\s+sabe", w: 1, swap: "proponho que" },
    { k: "qualquer coisa", cat: "inseguranca", p: "qualquer\\s+coisa", w: 1, swap: "se precisar de algo específico" },
    { k: "será que", cat: "inseguranca", p: "sera\\s+que", w: 1, swap: "pergunte direto" },
    { k: "se não for incomodar", cat: "inseguranca", p: "se\\s+nao\\s+for\\s+incomodar|desculp(?:a|e)\\s+(?:te\\s+)?incomodar|nao\\s+quero\\s+(?:te\\s+)?tomar\\s+(?:seu|o)\\s+tempo", w: 2, swap: "vá direto ao ponto" },

    // ---- Minimizadores: encolhem o valor ou o tempo do que você pede ----
    { k: "rapidinho", cat: "minimizador", p: "rapidinho|rapidao", w: 2, swap: "em poucos minutos (diga o tempo)" },
    { k: "minutinho", cat: "minimizador", p: "(?:um\\s+|uns\\s+)?minutinhos?", w: 2, swap: "um minuto" },
    { k: "pouquinho", cat: "minimizador", p: "pouquinho", w: 1, swap: "um pouco / o número exato" },
    { k: "valorzinho", cat: "minimizador", p: "valorzinho|descontinho|precinho|probleminha|detalhezinho|pedidinho", w: 2, swap: "use o termo normal (valor, desconto, preço)" },
    { k: "só queria", cat: "minimizador", p: "so\\s+(?:queria|pra|para|ligar|confirmar|checar|saber|ver|passar|perguntar)", w: 1, swap: "(omitir o \"só\")" },

    // ---- Vagueza: onde o cliente espera número, prazo e nome ----
    { k: "e tal", cat: "vagueza", p: "e\\s+tal|e\\s+coisa\\s+e\\s+tal", w: 2, swap: "complete a ideia" },
    { k: "e por aí vai", cat: "vagueza", p: "e\\s+por\\s+ai\\s+vai|e\\s+assim\\s+por\\s+diante", w: 1, swap: "cite os itens que importam" },
    { k: "essas coisas", cat: "vagueza", p: "(?:essas|aquelas|todas\\s+essas)\\s+coisas|tudo\\s+isso\\s+ai", w: 1, swap: "nomeie as coisas" },
    { k: "coisa", cat: "vagueza", p: "coisa", w: 1, swap: "diga o que é", ctx: (n, m) => ["essa", "aquela", "alguma", "qualquer", "nessa", "dessa", "outra", "mesma", "tal"].includes(prevWord(n, m)) },
    { k: "negócio", cat: "vagueza", p: "negocio", w: 1, swap: "diga o que é",
      ctx: (n, m) => ["esse", "aquele", "desse", "nesse", "daquele", "um"].includes(prevWord(n, m)) && !["de", "da", "do", "com", "entre", "fechado", "juridico", "que", "vai", "novo"].includes(nextWord(n, m)) },

    // ---- Busca de validação: pedir aprovação a cada frase ----
    { k: "entendeu?", cat: "validacao", p: "entendeu", w: 1, swap: "faz sentido? / ficou alguma dúvida?", ctx: (n, m) => !["se", "que", "quando", "ele", "ela", "ja"].includes(prevWord(n, m)) },
    { k: "tá ligado", cat: "validacao", p: "ta\\s+ligado", w: 2, swap: "(omitir)" },
    { k: "tá?", cat: "validacao", p: "ta", w: 1, swap: "(omitir)", ctx: atEnd },
    { k: "tá bom?", cat: "validacao", p: "ta\\s+bom", w: 1, swap: "faz sentido?", ctx: atEnd },
    { k: "certo?", cat: "validacao", p: "certo", w: 1, swap: "faz sentido?", ctx: (n, m) => atEnd(n, m) && !["esta", "e", "ficou", "foi", "nao", "tudo", "isso", "estava", "esta", "bem", "muito", "mais", "o", "um"].includes(prevWord(n, m)) },
    { k: "ok?", cat: "validacao", p: "ok", w: 1, swap: "faz sentido?", ctx: (n, m) => atEnd(n, m) && !["tudo", "esta", "ficou", "ja", "esta", "esta"].includes(prevWord(n, m)) },
    { k: "viu?", cat: "validacao", p: "viu", w: 1, swap: "(omitir)", ctx: (n, m) => atEnd(n, m) && !["ele", "ela", "eu", "quem", "que", "ja", "nunca"].includes(prevWord(n, m)) },

    // ---- Intimidade excessiva: apelidos e vocativos com quem é cliente ----
    { k: "parceiro", cat: "intimidade", p: "parceir[oa]", w: 2, swap: "use o nome da pessoa", ctx: (n, m) => vocative(n, m) && !["de", "comercial", "estrategico", "estrategica", "tecnologico"].includes(nextWord(n, m)) },
    { k: "brother", cat: "intimidade", p: "brother|irmao|amigao|campeao|vei", w: 2, swap: "use o nome da pessoa", ctx: vocative },
    { k: "meu querido", cat: "intimidade", p: "(?:meu|minha)\\s+(?:querid[oa]|amig[oa]|caro|cara)|querid[oa]|amig[oa]", w: 2, swap: "use o nome da pessoa", ctx: vocative },
    { k: "chefe", cat: "intimidade", p: "chefe|chefia", w: 2, swap: "use o nome da pessoa", ctx: vocative },

    // ---- Palavrões: risco direto de imagem ----
    { k: "palavrão", cat: "palavrao", p: "porra|caralho|merda|bosta|foda|fodido|foda\\s+se|puta\\s+que\\s+pariu|pqp|puta", w: 3, swap: "(omitir)" },
    { k: "cacete", cat: "palavrao", p: "cacete", w: 2, swap: "(omitir)" },

    // ---- Muletas: palavras que enchem sem acrescentar ----
    { k: "basicamente", cat: "muleta", p: "basicamente|praticamente", w: 1, swap: "(omitir) ou use o número" },
    { k: "na verdade", cat: "muleta", p: "na\\s+verdade", w: 1, swap: "(omitir)" },
    { k: "enfim", cat: "muleta", p: "enfim|digamos|vamos\\s+dizer|por\\s+assim\\s+dizer", w: 1, swap: "(omitir)" },
    { k: "sinceramente", cat: "muleta", p: "sinceramente|honestamente|francamente|falando\\s+a\\s+verdade|pra\\s+ser\\s+sincer[oa]|pra\\s+ser\\s+honest[oa]", w: 1, swap: "(omitir: sugere que o resto não é sincero)" },
    { k: "aí", cat: "muleta", p: "ai", w: 1, swap: "depois / em seguida", ctx: (n, m) => atStart(n, m) || (["e", "entao"].includes(prevWord(n, m)) && !["e", "e ai"].includes(n.slice(0, m.index).trim())) },

    // ---- Exclamações ----
    { k: "caramba", cat: "exclamacao", p: "caramba|uau|meu\\s+deus|nossa\\s+senhora|minha\\s+nossa", w: 1, swap: "(omitir)" },
    { k: "eita", cat: "exclamacao", p: "eita|putz", w: 2, swap: "(omitir)" },

    // ---- Fala informal escrita ----
    { k: "tô", cat: "informal", p: "to", w: 1, swap: "estou",
      ctx: (n, m) => /(?:ndo|ndo)$/.test(nextWord(n, m)) || ["com", "sem", "aqui", "te", "de", "em", "um", "uma", "so", "ligado", "certo", "ok"].includes(nextWord(n, m)) },
    { k: "tamo", cat: "informal", p: "tamo|tamos", w: 1, swap: "estamos" },
    { k: "vamo", cat: "informal", p: "vamo", w: 1, swap: "vamos" },
    { k: "cê", cat: "informal", p: "ce|oce", w: 1, swap: "você" },

    // ---- Mais gírias de bate-papo e de dinheiro ----
    { k: "suave", p: "suave", w: 2, swap: "sem problema", ctx: (n, m) => atStart(n, m) || ["ta", "esta", "ok", "entao", "e"].includes(prevWord(n, m)) },
    { k: "firmeza", p: "firmeza", w: 2, swap: "combinado", ctx: (n, m) => atStart(n, m) || ["e", "ta", "entao", "ok"].includes(prevWord(n, m)) },
    { k: "demorou", p: "demorou", w: 2, swap: "combinado", ctx: (n, m) => atStart(n, m) || ["ta", "entao", "e", "ok"].includes(prevWord(n, m)) },
    { k: "partiu", p: "partiu", w: 2, swap: "vamos" },
    { k: "trampo", p: "trampo", w: 2, swap: "trabalho" },
    { k: "grana", p: "grana", w: 2, swap: "valor / investimento" },
    { k: "mixaria", p: "mixaria|bufunfa", w: 3, swap: "valor baixo / valor" },
    { k: "pechincha", p: "pechincha", w: 2, swap: "condição especial" },
    { k: "jeitinho", p: "jeitinho", w: 2, swap: "alternativa" },
    { k: "dar um jeito", p: "d(?:ar|ou|a|amos|ando|ei|e)\\s+um\\s+jeito", w: 1, swap: "encontrar uma solução" },
    { k: "chutar", p: "chut(?:ar|o|a|amos|ando|ei)\\s+(?:um|uma|o|a)\\s+", w: 1, swap: "estimar" },
    { k: "chutômetro", p: "chutometro", w: 2, swap: "estimativa" },
    { k: "empurrar com a barriga", p: "empurr(?:ar|o|a|amos|ando|ei)\\s+com\\s+a\\s+barriga", w: 2, swap: "adiar / postergar" },
    { k: "papo reto", p: "papo\\s+reto", w: 2, swap: "direto ao ponto" },
    { k: "e aí", p: "e\\s+ai", w: 1, swap: "olá, tudo bem?", ctx: atStart },
    { k: "opa", p: "opa", w: 2, swap: "olá", ctx: atStart },
    { k: "blz", p: "blz|obrigadao", w: 1, swap: "perfeito / obrigado" },
    { k: "falou", p: "falou", w: 2, swap: "combinado / obrigado", ctx: (n, m) => atStart(n, m) && n.split(" ").length <= 3 },
  ];

  const CATEGORY_LABEL = {
    vicio: "Vício de linguagem", giria: "Gíria", inseguranca: "Insegurança", minimizador: "Minimizador", vagueza: "Vagueza",
    validacao: "Busca de validação", intimidade: "Intimidade excessiva", palavrao: "Palavrão",
    muleta: "Muleta de fala", exclamacao: "Exclamação", informal: "Fala informal",
  };
  // Por que cada categoria atrapalha uma negociação (usado no plano de foco e nos relatórios).
  const CATEGORY_WHY = {
    inseguranca: "marcadores de insegurança enfraquecem a proposta, o preço e o compromisso — o cliente lê dúvida onde você quis dar flexibilidade",
    minimizador: "diminutivos e \"só\" encolhem o valor do que você oferece e o tempo que você pede",
    vagueza: "palavras vagas deixam a fala imprecisa justamente onde o cliente espera número, prazo e nome",
    validacao: "pedir aprovação a cada frase (\"entendeu?\", \"tá?\") passa a ideia de que você duvida do que disse",
    intimidade: "apelidos e vocativos com quem é cliente quebram a distância profissional, principalmente no primeiro contato",
    palavrao: "palavrão é risco direto de imagem, mesmo em tom descontraído",
    muleta: "muletas enchem a fala sem acrescentar nada e roubam ênfase das frases importantes",
    exclamacao: "exclamações informais soam improvisadas numa conversa de negócio",
    informal: "a fala coloquial escrita (\"tô\", \"vamo\") soa descuidada numa proposta",
    giria: "gírias de bate-papo misturam registros e diminuem a autoridade da conversa",
  };

  const BY_KEY = {};
  ENTRIES.forEach((e) => {
    e.cat = e.cat || "giria";
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

  const weightOf = (k) => (BY_KEY[k] ? BY_KEY[k].w : 1);
  const categoryOf = (k) => (BY_KEY[k] ? BY_KEY[k].cat : "giria");
  const catLabel = (k) => CATEGORY_LABEL[categoryOf(k)] || "Gíria";   // termo fora do dicionário: tratado como leve

  // Para cada termo detectado: densidade, tolerância e se pesa na nota.
  function analyze(slangCounts, words) {
    const rows = Object.entries(slangCounts || {}).map(([k, count]) => {
      const w = weightOf(k), density = words > 0 ? (count / words) * 100 : 0, tol = TOLERANCE[w];
      const excess = Math.max(0, density - tol);
      const penalty = w === 0 ? 0 : Math.min(CAP_PER_TERM, excess * FACTOR[w]);
      return { key: k, cat: categoryOf(k), catLabel: catLabel(k), count, weight: w, label: WEIGHT_LABEL[w], density, tolerance: tol, penalty, status: w === 0 ? "neutra" : penalty > 0 ? "pesa" : "ok", swap: swaps[k] || "" };
    });
    rows.sort((a, b) => b.penalty - a.penalty || b.weight - a.weight || b.count - a.count);
    return rows;
  }


  // ===== Vícios de preenchimento ("né", "tipo", "ahn"...) — mesma lógica de peso, tolerância e contexto =====
  // Antes todo vício contava igual, desde o primeiro. Agora: uma pausa de vez em quando é natural; pesa a repetição.
  const FILLER_CAP = 6;   // teto por vício (unidades): o vício dominante pode pesar bastante na nota
  const FILLERS = [
    { k: "né", p: "ne", w: 2, swap: "corte a palavra ou faça uma pausa" },
    { k: "tipo", p: "tipo", w: 2, swap: "por exemplo",
      // "esse tipo de cliente", "um tipo de contrato" são o substantivo: não contam
      ctx: (n, m) => !["de", "do", "da", "dos", "das", "desse", "deste", "daquele", "ao"].includes(nextWord(n, m))
        && !["o", "um", "esse", "este", "aquele", "outro", "qual", "que", "do", "de", "no", "desse", "deste", "mesmo", "tal", "cada", "nenhum", "algum", "qualquer", "seu", "meu", "nosso", "este"].includes(prevWord(n, m)) },
    { k: "assim", p: "assim", w: 1, swap: "dessa forma",
      // "assim que", "como assim", "assim como" são normais; conta o "assim," de preenchimento
      ctx: (n, m) => (atStart(n, m) || ["tipo", "e", "entao", "mas", "ai"].includes(prevWord(n, m))) && !["que", "como", "mesmo", "por"].includes(nextWord(n, m)) },
    { k: "sabe", p: "sabe", w: 1, swap: "entende / compreende",
      // verbo ("ele sabe") não conta; só o "sabe?" no começo ou no fim da fala
      ctx: (n, m) => (atStart(n, m) || atEnd(n, m)) && !["ele", "ela", "quem", "que", "nao", "ja", "ninguem", "voce", "eu"].includes(prevWord(n, m)) },
  ];
  FILLERS.forEach((e) => { e.re = new RegExp("(?<![a-z0-9])(?:" + e.p + ")(?![a-z0-9])", "g"); });
  // Sons de hesitação pura não têm sinônimo: a troca é uma pausa silenciosa. Tokens crus (com acento),
  // porque "hã" e "é" perdem a diferença para "há" e "e" depois de normalizar.
  const SOUND_FILLERS = new Set(["an", "hã", "ahn", "eh", "hum", "hmm", "hmmm", "uhn", "uhm"]);
  const STRETCHED_E = /^é{2,}$/;
  const FILLER_META = {};
  FILLERS.forEach((e) => { FILLER_META[e.k] = { w: e.w, swap: e.swap }; });
  ["an", "hã", "ahn", "eh", "hum", "hmm", "hmmm", "uhn", "uhm"].forEach((k) => { FILLER_META[k] = { w: 2, swap: "uma pausa silenciosa" }; });
  FILLER_META["é"] = { w: 2, swap: "uma pausa silenciosa" };
  const fillerSwaps = {};
  Object.keys(FILLER_META).forEach((k) => { fillerSwaps[k] = FILLER_META[k].swap; });

  // "então" não é vício (conectivo normal). "é" só conta como hesitação: puxado ("éé") ou repetido ("é é").
  function detectFillers(text) {
    const out = [];
    const raw = String(text || "").toLowerCase().replace(/[.,!?;:"'()…\-]/g, " ").split(/\s+/).filter(Boolean);
    raw.forEach((t, i) => {
      if (STRETCHED_E.test(t)) { out.push("é"); return; }
      if (t === "é") {
        const p = raw[i - 1] || "", nx = raw[i + 1] || "";
        if (p === "é" || nx === "é" || STRETCHED_E.test(p) || STRETCHED_E.test(nx)) out.push("é");
        return;
      }
      if (SOUND_FILLERS.has(t)) out.push(t);
    });
    const n = norm(text);
    FILLERS.forEach((e) => {
      e.re.lastIndex = 0;
      let m;
      while ((m = e.re.exec(n))) {
        if (!e.ctx || e.ctx(n, m)) out.push(e.k);
        if (m[0].length === 0) e.re.lastIndex++;
      }
    });
    return out;
  }

  // Para cada vício contado: densidade, tolerância e se pesa na nota (mesmas tabelas das gírias).
  function analyzeFillers(fillerCounts, words) {
    const rows = Object.entries(fillerCounts || {}).filter(([k]) => k !== "então").map(([k, count]) => {
      const meta = FILLER_META[k] || { w: 1, swap: "" }, w = meta.w, density = words > 0 ? (count / words) * 100 : 0, tol = TOLERANCE[w];
      const excess = Math.max(0, density - tol);
      const penalty = Math.min(FILLER_CAP, excess * FACTOR[w]);
      return { key: k, cat: "vicio", catLabel: "Vício de linguagem", count, weight: w, label: WEIGHT_LABEL[w], density, tolerance: tol, penalty, status: penalty > 0 ? "pesa" : "ok", swap: meta.swap };
    });
    rows.sort((a, b) => b.penalty - a.penalty || b.count - a.count);
    return rows;
  }

  // Resumo por categoria: onde a fala informal mais pesa (ordenado pelo desconto, depois pela contagem).
  function byCategory(slangCounts, words) {
    const rows = analyze(slangCounts, words), acc = {};
    rows.forEach((r) => {
      const c = acc[r.cat] || (acc[r.cat] = { cat: r.cat, label: CATEGORY_LABEL[r.cat], count: 0, penalty: 0, terms: [] });
      c.count += r.count; c.penalty += r.penalty; c.terms.push(r);
    });
    return Object.values(acc).sort((a, b) => b.penalty - a.penalty || b.count - a.count);
  }

  // Nota de "vícios e gírias": vícios e gírias entram só pelo que pesa (peso x frequência acima da tolerância).
  function languageScore(fillerCounts, slangCounts, words) {
    const fillerUnits = analyzeFillers(fillerCounts, words).reduce((a, r) => a + r.penalty, 0);
    const slangUnits = analyze(slangCounts, words).reduce((a, r) => a + r.penalty, 0);
    let weighted = 0, informal = 0;
    analyzeFillers(fillerCounts, words).concat(analyze(slangCounts, words)).forEach((r) => {
      if (r.weight > 0) { weighted += r.count * r.weight; informal += r.count; }
    });
    const density = words > 0 ? (weighted / words) * 100 : 0;
    const aggUnits = words >= AGG_MIN_WORDS ? Math.min(AGG_CAP, Math.max(0, density - AGG_TOL) * AGG_FACTOR) : 0;
    // O desconto geral não soma com o por termo (evita contar duas vezes): vale o maior dos dois.
    const units = Math.max(fillerUnits + slangUnits, aggUnits);
    const score = Math.max(0, Math.min(1, 1 - units / SCORE_SCALE)) * 100;
    return { score, fillerUnits, slangUnits, aggUnits, density, informal };
  }

  window.AuraLang = { FILLERS, fillerSwaps, detectFillers, analyzeFillers, ENTRIES, WEIGHT_LABEL, CATEGORY_LABEL, CATEGORY_WHY, swaps, detectSlang, weightOf, categoryOf, catLabel, analyze, byCategory, languageScore, TOLERANCE, AGG_TOL };
})();
