// Sidebar compartilhada do AuraX. Cada página tem um <aside id="shellSidebar">
// vazio e chama AuraShell.init({ active, client, session }) depois do login.
(function () {
  const WHATSAPP_URL = "https://wa.me/5551984026354?text=" + encodeURIComponent("Olá! Quero falar com o time comercial sobre o AuraX.");
  const SUPPORT_WHATSAPP_URL = "https://wa.me/5551984026354?text=" + encodeURIComponent("Olá! Preciso de ajuda com o AuraX.");
  // Preencher quando o e-mail da AuraX existir: aparece como alternativa no suporte.
  const SUPPORT_EMAIL = "auraxcontato@gmail.com";
  // Ligar (true) depois do deploy da Edge Function support-notify, que manda o aviso por e-mail.
  const SUPPORT_NOTIFY_ENABLED = false;

  const ICONS = {
    record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
    list: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15l3.5-4 3 2.5L19 8"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 17h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    support: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.7 5.7l3.8 3.8M14.5 14.5l3.8 3.8M18.3 5.7l-3.8 3.8M9.5 14.5l-3.8 3.8"/>',
    whatsapp: '<path d="M20 11.5a8 8 0 0 1-11.9 7l-4.1 1.2 1.3-4A8 8 0 1 1 20 11.5z"/><path d="M9 8.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-.8.8c-.8-.4-1.5-1.1-1.9-1.9l.8-.8-1-2z"/>',
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


  // ===== Suporte: WhatsApp + formulário =====
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function openSupport({ client, session, name }) {
    let overlay = document.getElementById("supOverlay");
    if (overlay) overlay.remove();
    const email = (session && session.user && session.user.email) || "";

    overlay = document.createElement("div");
    overlay.id = "supOverlay";
    overlay.className = "sup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "supTitle");
    overlay.innerHTML =
      '<div class="sup-card">' +
        '<button type="button" class="sup-x" aria-label="Fechar">×</button>' +
        '<h3 id="supTitle">Suporte</h3>' +
        '<p class="sup-sub">Como podemos ajudar? Fale com a gente pelo WhatsApp ou mande uma mensagem aqui.</p>' +
        '<a class="sup-wa" id="supWa" href="' + SUPPORT_WHATSAPP_URL + '" target="_blank" rel="noopener">' + icon("whatsapp") + "Falar no WhatsApp</a>" +
        '<div class="sup-or"><span>ou envie uma mensagem</span></div>' +
        '<form id="supForm" novalidate>' +
          '<label class="sup-field">Assunto<select name="category">' +
            '<option value="duvida">Dúvida sobre o uso</option>' +
            '<option value="problema">Problema técnico</option>' +
            '<option value="cobranca">Cobrança / assinatura</option>' +
            '<option value="sugestao">Sugestão</option>' +
          "</select></label>" +
          '<label class="sup-field">Mensagem<textarea name="message" rows="5" maxlength="4000" required placeholder="Conte o que aconteceu ou o que você precisa…"></textarea></label>' +
          '<div class="sup-meta">Vamos responder no e-mail <b>' + esc(email) + "</b>. Junto vão a página em que você está e o navegador, pra ajudar a entender o problema." +
            (SUPPORT_EMAIL ? ' Se preferir, escreva para <a href="mailto:' + esc(SUPPORT_EMAIL) + '">' + esc(SUPPORT_EMAIL) + "</a>." : "") + "</div>" +
          '<div class="sup-msg" id="supMsg" role="status" aria-live="polite"></div>' +
          '<button type="submit" class="btn" id="supSend">Enviar mensagem</button>' +
        "</form>" +
      "</div>";
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".sup-x").addEventListener("click", close);
    document.getElementById("supWa").addEventListener("click", () => { if (window.posthog) window.posthog.capture("support_whatsapp_click"); });

    const form = document.getElementById("supForm");
    const msgEl = document.getElementById("supMsg");
    const sendBtn = document.getElementById("supSend");
    form.message.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = form.message.value.trim();
      msgEl.className = "sup-msg";
      if (message.length < 5) {
        msgEl.textContent = "Escreva um pouco mais pra gente entender como ajudar.";
        msgEl.classList.add("error");
        return;
      }
      sendBtn.disabled = true;
      sendBtn.textContent = "Enviando…";
      const { data, error } = await client.from("support_requests").insert({
        user_id: session.user.id,
        email,
        name,
        category: form.category.value,
        message,
        page: location.pathname.split("/").pop() || "app.html",
        user_agent: navigator.userAgent.slice(0, 250),
      }).select("id").single();

      if (error) {
        console.error("Suporte: erro ao enviar", error.message);
        msgEl.textContent = "Não foi possível enviar agora. Sua mensagem continua aqui — tente de novo ou fale pelo WhatsApp.";
        msgEl.classList.add("error");
        sendBtn.disabled = false;
        sendBtn.textContent = "Enviar mensagem";
        return;
      }
      if (window.posthog) window.posthog.capture("support_request_sent", { category: form.category.value });

      // Aviso por e-mail pra caixa da AuraX — em segundo plano; a mensagem já está salva.
      if (SUPPORT_NOTIFY_ENABLED && data && data.id) {
        fetch(client.supabaseUrl + "/functions/v1/support-notify", {
          method: "POST",
          headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: data.id }),
        }).catch(() => {});
      }

      overlay.querySelector(".sup-card").innerHTML =
        '<button type="button" class="sup-x" aria-label="Fechar">×</button>' +
        '<div class="sup-done"><div class="sup-check" aria-hidden="true">✓</div><h3>Mensagem enviada</h3>' +
        '<p class="sup-sub">Recebemos seu pedido e vamos responder em <b>' + esc(email) + "</b>.</p>" +
        '<button type="button" class="btn ghost" id="supCloseBtn">Fechar</button></div>';
      overlay.querySelector(".sup-x").addEventListener("click", close);
      document.getElementById("supCloseBtn").addEventListener("click", close);
    });
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
      '<a class="brand" href="app.html"><div class="brand-name">AuraX</div></a>' +
      '<nav class="nav-group" aria-label="Principal"><div class="nav-label">Principal</div>' +
        item("gravar", "app.html", "record", "Gravar sessão", active) +
        item("sessoes", "sessoes.html", "list", "Minhas Sessões", active) +
        item("insights", "insights.html", "chart", "Meus Insights", active) +
      "</nav>" +
      (isGestor
        ? '<nav class="nav-group" aria-label="Gestão"><div class="nav-label">Gestão</div>' + item("painel", "painel-gestor.html", "grid", "Painel do Gestor", active) + "</nav>"
        : "") +
      '<nav class="nav-group" aria-label="Ajuda">' + item("ajuda", "app.html?onboarding=1", "help", "Como funciona", active) +
        '<button type="button" class="nav-item" id="shellSupport">' + icon("support") + "Suporte</button></nav>" +
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

    document.getElementById("shellSupport").addEventListener("click", () => {
      if (window.posthog) window.posthog.capture("support_opened");
      openSupport({ client, session, name });
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

  // Sessões antigas guardaram "então" como vício de linguagem; hoje ele não conta.
  // Usado nas telas que somam/mostram os vícios já salvos.
  const IGNORED_FILLERS = ["então"];
  function cleanFillers(counts) {
    const out = {};
    Object.entries(counts || {}).forEach(([w, c]) => { if (!IGNORED_FILLERS.includes(w)) out[w] = c; });
    return out;
  }

  window.AuraShell = { init, cleanFillers };
})();
