/* AuraX — modal do código de verificação ("Glassy OTP").
 *
 * Uso:
 *   AuraOtp.open({
 *     email: "pessoa@empresa.com",
 *     length: 6,                      // tamanho do código (padrão do Supabase: 6)
 *     cooldown: 60,                   // segundos até poder reenviar
 *     verify: async (code) => ({ ok: true }) ou ({ ok: false, message: "..." }),
 *     resend: async () => ({ ok: true }) ou ({ ok: false, message: "..." }),
 *     onSuccess: () => { ... },       // chamado ~1,3s depois da tela de sucesso
 *     onCancel: () => { ... },        // "Usar outro e-mail" ou Esc
 *   });
 * O CSS vem de otp-modal.css. Não depende de Supabase: quem chama passa verify/resend. */
(function () {
  "use strict";

  var ICON = {
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2"/><path d="m17 6 3 3"/><path d="m14 9 2 2"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    spinner: '<svg class="otp-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.55" /></svg>',
  };

  var MIN_VERIFY_MS = 1400; // a animação de "verificando" aparece por pelo menos isso

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function open(opts) {
    var N = opts.length || 6;
    var cooldown = opts.cooldown || 60;
    var prevFocus = document.activeElement;
    var busy = false, closed = false, remaining = cooldown, timer = null;

    var overlay = document.createElement("div");
    overlay.className = "otp-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "otpTitle");

    var boxesHtml = "";
    for (var i = 0; i < N; i++) {
      boxesHtml += '<input class="otp-box" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="' + (i === 0 ? "one-time-code" : "off") + '" aria-label="Dígito ' + (i + 1) + ' de ' + N + '" />';
    }
    overlay.innerHTML =
      '<div class="otp-card" data-state="idle">' +
        '<div class="otp-tint"></div><div class="otp-shine"></div>' +
        '<div class="otp-icon" id="otpIcon">' + ICON.key + '</div>' +
        '<h2 class="otp-title" id="otpTitle">Verificar <span>código</span></h2>' +
        '<p class="otp-sub" id="otpSub">Enviamos um código de ' + N + ' dígitos para <b id="otpEmail"></b></p>' +
        '<div class="otp-boxes" id="otpBoxes">' + boxesHtml +
          '<div class="otp-check" aria-hidden="true">' + ICON.check + '<i></i></div></div>' +
        '<p class="otp-msg" id="otpMsg" role="status" aria-live="polite"></p>' +
        '<p class="otp-resend" id="otpResend"></p>' +
        '<button type="button" class="otp-btn" id="otpBtn" disabled></button>' +
        '<button type="button" class="otp-cancel" id="otpCancel">Usar outro e-mail</button>' +
      "</div>";
    document.body.appendChild(overlay);

    var $ = function (id) { return overlay.querySelector("#" + id); };
    var card = overlay.querySelector(".otp-card");
    var boxesWrap = $("otpBoxes");
    var boxes = Array.prototype.slice.call(overlay.querySelectorAll(".otp-box"));
    var btn = $("otpBtn"), msg = $("otpMsg"), resendEl = $("otpResend");
    $("otpEmail").textContent = opts.email || "";

    function setBtn(label, icon) { btn.innerHTML = (icon || "") + "<span>" + label + "</span>"; }
    setBtn("Verificar e continuar", ICON.arrow);
    function setState(s) { card.setAttribute("data-state", s); }
    function code() { return boxes.map(function (b) { return b.value; }).join(""); }
    function refresh() {
      boxes.forEach(function (b) { b.classList.toggle("filled", !!b.value); });
      btn.disabled = busy || code().length !== N;
    }
    function say(text) { msg.textContent = text || ""; }

    // ---------- reenvio ----------
    function renderResend() {
      if (closed) return;
      if (remaining > 0) {
        resendEl.innerHTML = 'Não recebeu o código? Reenviar em <b>00:' + pad(remaining) + "</b>";
      } else {
        resendEl.innerHTML = 'Não recebeu o código? <button type="button" class="otp-inline" id="otpResendBtn">Reenviar código</button>';
        $("otpResendBtn").addEventListener("click", doResend);
      }
    }
    function startTimer() {
      clearInterval(timer); remaining = cooldown; renderResend();
      timer = setInterval(function () {
        remaining -= 1; renderResend();
        if (remaining <= 0) clearInterval(timer);
      }, 1000);
    }
    async function doResend() {
      var b = $("otpResendBtn"); if (b) b.disabled = true;
      var res;
      try { res = await opts.resend(); } catch (e) { res = { ok: false, message: "Não foi possível reenviar agora." }; }
      if (res && res.ok) { setState("idle"); say("Novo código enviado. Olhe também a caixa de spam."); startTimer(); }
      else { say((res && res.message) || "Não foi possível reenviar agora."); setState("error"); if (b) b.disabled = false; }
    }

    // ---------- animações ----------
    function gather() {
      var wrap = boxesWrap.getBoundingClientRect();
      var cx = wrap.left + wrap.width / 2, R = 30;
      boxes.forEach(function (b, i) {
        var r = b.getBoundingClientRect();
        var dx = r.left + r.width / 2 - cx;
        var a = (i / N) * Math.PI * 2;
        b.style.transform = "translate(" + (R * Math.sin(a) - dx) + "px," + (-R * Math.cos(a)) + "px) scale(0.68)";
      });
      setTimeout(function () { if (!closed && card.getAttribute("data-state") === "verifying") boxesWrap.classList.add("spin"); }, 650);
    }
    function ungather() {
      boxesWrap.classList.remove("spin");
      boxes.forEach(function (b) { b.style.transform = ""; });
    }

    async function submit() {
      if (busy || code().length !== N) return;
      busy = true; refresh(); say(""); setState("verifying");
      setBtn("Verificando código…", ICON.spinner);
      boxes.forEach(function (b) { b.readOnly = true; });
      gather();
      var t0 = Date.now(), res;
      try { res = await opts.verify(code()); } catch (e) { res = { ok: false, message: "Não foi possível verificar agora. Tente de novo." }; }
      await sleep(Math.max(0, MIN_VERIFY_MS - (Date.now() - t0)));
      if (closed) return;
      if (res && res.ok) success(); else fail(res && res.message);
    }

    function success() {
      clearInterval(timer);
      ungather(); boxesWrap.classList.add("gone");
      setState("success");
      $("otpIcon").innerHTML = ICON.shield;
      $("otpTitle").innerHTML = "Verificado com <span>sucesso</span>";
      $("otpSub").textContent = "Seu e-mail foi confirmado.";
      say("");
      setBtn("Conta verificada", ICON.shield);
      btn.disabled = false;
      setTimeout(function () { if (!closed && opts.onSuccess) opts.onSuccess(); }, 1300);
    }

    function fail(message) {
      ungather();
      busy = false;
      boxes.forEach(function (b) { b.readOnly = false; b.value = ""; });
      setState("error");
      say(message || "Código incorreto ou expirado. Confira e tente de novo.");
      setBtn("Verificar e continuar", ICON.arrow);
      refresh();
      boxesWrap.classList.remove("shake"); void boxesWrap.offsetWidth; boxesWrap.classList.add("shake");
      boxes[0].focus();
    }

    // ---------- digitação ----------
    function fill(start, digits) {
      for (var k = 0; k < digits.length && start + k < N; k++) boxes[start + k].value = digits[k];
      boxes[Math.min(start + digits.length, N - 1)].focus();
      refresh();
      if (code().length === N) submit();
    }
    function clearError() { if (card.getAttribute("data-state") === "error") { setState("idle"); say(""); } }

    boxes.forEach(function (b, i) {
      b.addEventListener("input", function () {
        var v = b.value.replace(/\D/g, "");
        clearError();
        if (v.length > 1) { b.value = ""; fill(i, v); return; } // colar ou preenchimento automático do celular
        b.value = v;
        if (v && i < N - 1) boxes[i + 1].focus();
        refresh();
        if (code().length === N) submit();
      });
      b.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ""; boxes[i - 1].focus(); refresh(); }
        else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
        else if (e.key === "ArrowRight" && i < N - 1) { e.preventDefault(); boxes[i + 1].focus(); }
        else if (e.key === "Enter") { e.preventDefault(); submit(); }
      });
      b.addEventListener("paste", function (e) {
        var t = ((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "");
        if (t) { e.preventDefault(); clearError(); fill(0, t); }
      });
      b.addEventListener("focus", function () { b.select(); });
    });

    btn.addEventListener("click", submit);
    function close(cancelled) {
      if (closed) return;
      closed = true; clearInterval(timer);
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ok */ }
      if (cancelled && opts.onCancel) opts.onCancel();
    }
    function onKey(e) { if (e.key === "Escape" && !busy && card.getAttribute("data-state") !== "success") close(true); }
    document.addEventListener("keydown", onKey);
    $("otpCancel").addEventListener("click", function () { if (!busy) close(true); });

    startTimer();
    setTimeout(function () { boxes[0].focus(); }, 60);
    return { close: function () { close(false); } };
  }

  window.AuraOtp = { open: open };
})();
