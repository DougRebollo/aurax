// Sidebar compartilhada do AuraX. Cada página tem um <aside id="shellSidebar">
// vazio e chama AuraShell.init({ active, client, session }) depois do login.
(function () {
  const WHATSAPP_URL = "https://wa.me/5551984026354?text=" + encodeURIComponent("Olá! Quero falar com o time comercial sobre o AuraX.");

  const ICONS = {
    record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
    list: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15l3.5-4 3 2.5L19 8"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 17h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  function item(id, href, iconName, label, active) {
    return '<a class="nav-item" data-nav="' + id + '" href="' + href + '"' + (active === id ? ' aria-current="page"' : "") + ">" + icon(iconName) + label + "</a>";
  }

  function currentTheme() {
    const set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function themeButtonHtml() {
    const dark = currentTheme() === "dark";
    return '<button type="button" class="nav-item" id="shellTheme">' + icon(dark ? "sun" : "moon") + (dark ? "Tema claro" : "Tema escuro") + "</button>";
  }

  function initials(name) {
    return (name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }

  async function init({ active, client, session }) {
    const el = document.getElementById("shellSidebar");
    if (!el) return;

    let name = (session && session.user && session.user.email) || "";
    let role = "funcionario";
    try {
      const { data } = await client.from("profiles").select("name, role").eq("id", session.user.id).single();
      if (data) { name = data.name || name; role = data.role || role; }
    } catch (e) { /* segue com os valores padrão */ }
    const isGestor = role === "gestor";

    el.innerHTML =
      '<a class="brand" href="index.html"><div class="brand-mark">A</div><div class="brand-name">AuraX</div></a>' +
      '<nav class="nav-group" aria-label="Principal"><div class="nav-label">Principal</div>' +
        item("gravar", "index.html", "record", "Gravar sessão", active) +
        item("sessoes", "sessoes.html", "list", "Minhas Sessões", active) +
        item("insights", "insights.html", "chart", "Meus Insights", active) +
      "</nav>" +
      (isGestor
        ? '<nav class="nav-group" aria-label="Gestão"><div class="nav-label">Gestão</div>' + item("painel", "painel-gestor.html", "grid", "Painel do Gestor", active) + "</nav>"
        : "") +
      '<nav class="nav-group" aria-label="Ajuda">' + item("ajuda", "index.html?onboarding=1", "help", "Como funciona", active) + "</nav>" +
      '<div class="sidebar-spacer"></div>' +
      (isGestor
        ? '<div class="plan-box"><b>Plano Profissional</b><small>1 gestor + 5 colaboradores</small><a href="' + WHATSAPP_URL + '" target="_blank" rel="noopener">Falar com Vendas</a></div>'
        : "") +
      '<div class="user-chip"><div class="avatar">' + initials(name) + "</div><div><strong>" + name.replace(/</g, "&lt;") + "</strong><span>" + (isGestor ? "Gestor" : "Funcionário") + "</span></div></div>" +
      themeButtonHtml() +
      '<button type="button" class="nav-item" id="shellLogout">' + icon("out") + "Sair</button>";

    const themeBtn = document.getElementById("shellTheme");
    themeBtn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("aurax_theme", next); } catch (e) { /* sem armazenamento: vale só nesta página */ }
      themeBtn.innerHTML = icon(next === "dark" ? "sun" : "moon") + (next === "dark" ? "Tema claro" : "Tema escuro");
    });

    document.getElementById("shellLogout").addEventListener("click", async () => {
      await client.auth.signOut();
      window.location.href = "login.html";
    });

    el.querySelectorAll("[data-nav]").forEach((a) => {
      a.addEventListener("click", () => {
        const id = a.getAttribute("data-nav");
        if (window.posthog && id === "insights") window.posthog.capture("insights_opened");
        if (window.posthog && id === "sessoes") window.posthog.capture("sessions_ranking_opened");
      });
    });
  }

  window.AuraShell = { init };
})();
