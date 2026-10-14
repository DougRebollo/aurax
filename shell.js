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
    out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  function item(id, href, iconName, label, active) {
    return '<a class="nav-item" data-nav="' + id + '" href="' + href + '"' + (active === id ? ' aria-current="page"' : "") + ">" + icon(iconName) + label + "</a>";
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
      '<button type="button" class="nav-item" id="shellLogout">' + icon("out") + "Sair</button>";

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
