/* AuraMeeting — tipo de reunião e "pausas no meio da frase".
 *
 * Tipo de reunião: o quanto o vendedor deve falar muda com o objetivo da call (numa descoberta,
 * ouvir é o trabalho; numa apresentação, é ele quem conduz). Cada tipo tem uma faixa ideal de
 * "tempo falando" usada nas dicas e no detalhe da sessão. "Interna" não gera dica de tempo de fala.
 *
 * Pausas no meio da frase (hesitação): silêncio de 2,5 a 8 s logo depois de uma palavra que deixa a
 * frase incompleta ("de", "que", "e", "para"...). Com fone, um silêncio longo costuma ser o cliente
 * falando — por isso não medimos mais "pausas longas"; medimos a pausa que acontece DENTRO da sua frase.
 */
(function () {
  const TYPES = [
    { id: "geral", label: "Venda", long: "Venda (geral)", ideal: [25, 65], dominate: 75 },
    { id: "descoberta", label: "Descoberta", long: "Descoberta", ideal: [25, 45], dominate: 55 },
    { id: "apresentacao", label: "Apresentação", long: "Apresentação / demo", ideal: [45, 70], dominate: 80, few: 35 },
    { id: "negociacao", label: "Negociação", long: "Negociação", ideal: [35, 55], dominate: 65 },
    { id: "followup", label: "Follow-up", long: "Follow-up", ideal: [30, 55], dominate: 65 },
    { id: "interna", label: "Interna", long: "Reunião interna", ideal: null },
  ];
  const get = (id) => TYPES.find((t) => t.id === id) || TYPES[0];

  // Veredito do tempo de fala para o tipo de reunião: { key, type, text } (formato das dicas) ou null.
  function talkTip(pctYou, typeId) {
    const t = get(typeId);
    if (!t.ideal || typeof pctYou !== "number") return null;
    const [a, b] = t.ideal;
    const faixa = `${a}% a ${b}%`;
    if (pctYou >= t.dominate) {
      return { key: "dominou_conversa", type: "melhorar", text: `Você falou ${pctYou}% do tempo — para ${t.long} o ideal é de ${faixa}. Abra mais espaço para o cliente falar.` };
    }
    if (t.few && pctYou < t.few) {
      return { key: "pouca_conducao", type: "melhorar", text: `Você falou ${pctYou}% do tempo — numa apresentação o ideal é de ${faixa}: é você quem conduz a demonstração.` };
    }
    if (pctYou >= a && pctYou <= b) {
      return { key: "fala_no_ideal", type: "positivo", text: `Você falou ${pctYou}% do tempo — dentro do ideal para ${t.long} (${faixa}).` };
    }
    return null;
  }

  // Texto curto da faixa ideal, para mostrar ao lado do "Você falou X%".
  function idealLabel(typeId) {
    const t = get(typeId);
    return t.ideal ? `ideal para ${t.long}: ${t.ideal[0]}% a ${t.ideal[1]}%` : "";
  }

  // Palavras que deixam a frase incompleta: parar logo depois delas é sinal de hesitação.
  const MID_PHRASE = new Set(("e o a os as um uma uns umas de do da dos das que para pra pro pros pras com em no na nos nas " +
    "por pelo pela pelos pelas mas porque se entao como quando onde ou nem mais muito muita seu sua seus suas nosso nossa " +
    "esse essa este esta ao aos tipo eh ah ahn hum hm").split(" "));
  const norm = (w) => String(w || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  function endsMidPhrase(lastWord) {
    const w = norm(lastWord);
    return !!w && (MID_PHRASE.has(w) || /^e{2,}$/.test(w));
  }
  const HESITATION_MIN_MS = 2500;
  const HESITATION_MAX_MS = 8000;

  // Nota do critério "Pausas" a partir das pausas no meio da frase, por 100 palavras:
  // até 1 a cada 100 palavras não desconta; 5 ou mais por 100 palavras zera.
  function hesitationScore(count, words) {
    if (!words || words < 50) return 100;
    const rate = (count / words) * 100;
    return Math.max(0, Math.min(1, 1 - Math.max(0, rate - 1) / 4)) * 100;
  }

  window.AuraMeeting = { TYPES, get, talkTip, idealLabel, endsMidPhrase, hesitationScore, HESITATION_MIN_MS, HESITATION_MAX_MS };
})();
