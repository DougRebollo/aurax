/* AuraX — transição entre páginas: uma "cortina" que SOBREPÕE a página atual.
 * Ao clicar num link interno, um painel desliza da direita cobrindo a tela; a página nova já abre coberta
 * e o painel sai para a esquerda revelando o conteúdo. Funciona em qualquer navegador (não depende da API
 * de View Transitions). Com "reduzir movimento" ligado no sistema vira só um fade curto.
 * As durações e a cor ficam no shell.css (--vt-leave, --vt-enter). */
(function () {
  var KEY = "aurax_vt";
  var root = document.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* ok */ }

  function ms(name, fallback) {
    var v = (getComputedStyle(root).getPropertyValue(name) || "").trim();
    var n = parseFloat(v);
    if (isNaN(n)) return fallback;
    return /ms$/.test(v) ? n : n * 1000;
  }
  function clearAll() {
    root.classList.remove("vt-leave", "vt-leave-fade", "vt-enter", "vt-enter-fade");
  }

  // Entrada: a página nova abre coberta e a cortina sai.
  var flagged = false;
  try { flagged = sessionStorage.getItem(KEY) === "1"; sessionStorage.removeItem(KEY); } catch (e) { /* ok */ }
  if (flagged) {
    root.classList.add(reduce ? "vt-enter-fade" : "vt-enter");
    setTimeout(clearAll, ms("--vt-enter", 500) + 400);
  }

  // Saída: cobre a tela e só então navega.
  function go(href) {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* ok */ }
    root.classList.add(reduce ? "vt-leave-fade" : "vt-leave");
    setTimeout(function () { window.location.href = href; }, reduce ? 120 : ms("--vt-leave", 360));
  }
  window.AuraGo = go;   // para navegações feitas por script (ex.: o X da tela de plano)

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    var url;
    try { url = new URL(a.href, window.location.href); } catch (err) { return; }
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;   // âncora na mesma página
    e.preventDefault();
    go(url.href);
  }, true);

  // Voltar pelo histórico (cache de página): não deixa a cortina presa.
  window.addEventListener("pageshow", function (e) { if (e.persisted) clearAll(); });
})();
