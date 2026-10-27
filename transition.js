/* AuraX — transição entre páginas por FADE (esmaecer).
 * Ao clicar num link interno, a página atual esmaece; a página nova abre invisível e aparece suavemente.
 * Funciona em qualquer navegador e é um movimento sutil (só opacidade), então vale também com "reduzir
 * movimento". As durações ficam no shell.css (--vt-leave, --vt-enter). */
(function () {
  var KEY = "aurax_vt";
  var root = document.documentElement;
  function ms(name, fallback) {
    var v = (getComputedStyle(root).getPropertyValue(name) || "").trim();
    var n = parseFloat(v);
    if (isNaN(n)) return fallback;
    return /ms$/.test(v) ? n : n * 1000;
  }
  function clearAll() {
    root.classList.remove("vt-leave", "vt-enter");
  }

  // Entrada: a página nova abre invisível e aparece.
  var flagged = false;
  try { flagged = sessionStorage.getItem(KEY) === "1"; sessionStorage.removeItem(KEY); } catch (e) { /* ok */ }
  if (flagged) {
    root.classList.add("vt-enter");
    setTimeout(clearAll, ms("--vt-enter", 380) + 300);
  }

  // Saída: esmaece a página atual e só então navega.
  function go(href) {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* ok */ }
    root.classList.add("vt-leave");
    setTimeout(function () { window.location.href = href; }, ms("--vt-leave", 220));
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

  // Voltar pelo histórico (cache de página): não deixa a página invisível.
  window.addEventListener("pageshow", function (e) { if (e.persisted) clearAll(); });
})();
