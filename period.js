/* AuraPeriod — filtro de período (Semana · Mês · Ano · Tudo) compartilhado entre Insights e Painel do Gestor.
 * Cuida do estado (modo + data de referência), das datas de cada período, do rótulo e dos botões; quem usa
 * só recebe o estado a cada mudança e filtra os próprios dados.
 *
 * HTML esperado (ids fixos): #periodBar, #periodTabs (botões data-p), #periodPrev, #periodNext,
 * #periodToday, #periodLabel e #periodNav (grupo das setas). */
(function () {
  const MODES = ["week", "month", "year", "all"];
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // segunda-feira

  function range(mode, cursor) {
    if (mode === "week") { const s = startOfWeek(cursor); return { start: s, end: addDays(s, 7) }; }
    if (mode === "month") return { start: new Date(cursor.getFullYear(), cursor.getMonth(), 1), end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) };
    if (mode === "year") return { start: new Date(cursor.getFullYear(), 0, 1), end: new Date(cursor.getFullYear() + 1, 0, 1) };
    return null;
  }
  function shift(mode, cursor, dir) {
    const c = new Date(cursor);
    if (mode === "week") c.setDate(c.getDate() + 7 * dir);
    else if (mode === "month") c.setMonth(c.getMonth() + dir, 1);
    else if (mode === "year") c.setFullYear(c.getFullYear() + dir);
    return c;
  }
  function label(mode, r) {
    if (mode === "all" || !r) return "Todo o período";
    if (mode === "year") return String(r.start.getFullYear());
    if (mode === "month") return r.start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const last = addDays(r.end, -1);
    const sm = r.start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    const em = last.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    return r.start.getMonth() === last.getMonth()
      ? `${r.start.getDate()} – ${last.getDate()} ${em} ${last.getFullYear()}`
      : `${r.start.getDate()} ${sm} – ${last.getDate()} ${em} ${last.getFullYear()}`;
  }
  // Itens cujo campo de data cai dentro do período (fim exclusivo).
  function inRange(list, r, field) {
    if (!r) return list;
    const f = field || "date";
    return list.filter((x) => { const t = new Date(x[f]); return t >= r.start && t < r.end; });
  }

  // opts: { storageKey, defaultMode, getEarliest(): Date|null, onChange(state) }
  function mount(opts) {
    const $ = (id) => document.getElementById(id);
    let mode = opts.defaultMode || "all";
    let cursor = new Date();
    try { const saved = localStorage.getItem(opts.storageKey); if (MODES.includes(saved)) mode = saved; } catch (e) { /* ok */ }

    function state() {
      const r = range(mode, cursor);
      return { mode, cursor, range: r, prevRange: r ? range(mode, shift(mode, cursor, -1)) : null, label: label(mode, r) };
    }
    function update() {
      const st = state();
      $("periodBar").hidden = false;
      document.querySelectorAll("#periodTabs button").forEach((b) => b.classList.toggle("active", b.dataset.p === mode));
      $("periodLabel").textContent = st.label;
      $("periodNav").style.visibility = mode === "all" ? "hidden" : "visible";
      if (st.range) {
        const now = new Date(), earliest = opts.getEarliest ? opts.getEarliest() : null;
        $("periodPrev").disabled = !earliest || earliest >= st.range.start;
        $("periodNext").disabled = st.range.end > now;
        $("periodToday").hidden = st.range.start <= now && now < st.range.end;
      }
      opts.onChange(st);
    }
    $("periodTabs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-p]");
      if (!b) return;
      mode = b.dataset.p; cursor = new Date();
      try { localStorage.setItem(opts.storageKey, mode); } catch (err) { /* ok */ }
      if (window.posthog) window.posthog.capture("period_filter", { page: opts.storageKey, mode });
      update();
    });
    $("periodPrev").addEventListener("click", () => { cursor = shift(mode, cursor, -1); update(); });
    $("periodNext").addEventListener("click", () => { cursor = shift(mode, cursor, 1); update(); });
    $("periodToday").addEventListener("click", () => { cursor = new Date(); update(); });
    update();
    return { state, update };
  }

  window.AuraPeriod = { mount, range, shift, label, inRange, startOfWeek, addDays, startOfDay };
})();
