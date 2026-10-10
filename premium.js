// Brevazo Premium: cuenta (acceso por email), pago con Paddle, alertas y asistente IA.
// Solo se carga en /cuenta/, /asistente/ y /premium.html, y solo cuando la web corre en Cloudflare con la API (/api/*).
(function () {
  "use strict";
  var root = document.body.getAttribute("data-root") || "./";
  var cfgMeta = document.querySelector('meta[name="bz-paddle"]');
  var PADDLE = cfgMeta ? JSON.parse(cfgMeta.getAttribute("content")) : {};

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(root + "api/" + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; });
    });
  }
  function date(iso) { return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }); }
  var me = null;
  function loadMe() { return api("me").then(function (d) { me = d; return d; }); }

  // ---------------------------------------------------------------- pago con Paddle
  var paddleReady = null;
  function loadPaddle() {
    if (paddleReady) return paddleReady;
    paddleReady = new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      s.onload = function () {
        if (PADDLE.env === "sandbox") window.Paddle.Environment.set("sandbox");
        window.Paddle.Initialize({ token: PADDLE.token, eventCallback: function (ev) {
          if (ev.name === "checkout.completed") waitPremium();
        } });
        ok(window.Paddle);
      };
      s.onerror = fail;
      document.head.appendChild(s);
    });
    return paddleReady;
  }
  function waitPremium(tries) {  // el aviso de Paddle llega al servidor en segundos: comprobamos hasta verlo
    tries = tries || 0;
    loadMe().then(function (d) {
      if (d.premium || tries > 15) { location.href = root + "cuenta/?bienvenida=1"; return; }
      setTimeout(function () { waitPremium(tries + 1); }, 2000);
    });
  }
  function checkout() {
    (me ? Promise.resolve(me) : loadMe()).then(function (d) {
      if (!d.logged) { location.href = root + "cuenta/?siguiente=premium"; return; }
      if (d.premium) { location.href = root + "cuenta/"; return; }
      if (!PADDLE.token || !PADDLE.price) { alert("El pago aún no está activado."); return; }
      loadPaddle().then(function (P) {
        P.Checkout.open({ items: [{ priceId: PADDLE.price, quantity: 1 }], customer: { email: d.email },
                          customData: { user_id: String(d.id) }, settings: { locale: "es", displayMode: "overlay" } });
      });
    });
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-checkout]");
    if (b) { ev.preventDefault(); checkout(); }
  });

  // ---------------------------------------------------------------- mi cuenta
  var box = document.getElementById("account");
  if (box) loadMe().then(renderAccount);

  function renderAccount(d) {
    var q = new URLSearchParams(location.search);
    if (!d.logged) {
      box.innerHTML =
        (q.get("error") ? '<p class="notice notice-err">Ese enlace ha caducado o ya se usó. Pide uno nuevo.</p>' : "") +
        '<p class="lead">Entra con tu email: te mandamos un enlace y listo, sin contraseñas.</p>' +
        '<form class="login" id="login"><label for="login-email">Email</label>' +
        '<div class="login-row"><input id="login-email" type="email" required autocomplete="email" placeholder="tu@email.com">' +
        '<button class="btn btn-primary" type="submit">Enviarme el enlace</button></div></form>' +
        '<p class="fine">Usamos tu email solo para tu cuenta y, si las activas, tus alertas. <a href="' + root + 'privacidad.html">Privacidad</a>.</p>';
      document.getElementById("login").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var btn = ev.target.querySelector("button"), email = document.getElementById("login-email").value;
        btn.disabled = true;
        api("login", { method: "POST", body: { email: email } }).then(function (r) {
          btn.disabled = false;
          if (!r.ok) { flash(r.error || "No se ha podido enviar el enlace.", true); return; }
          box.innerHTML = '<p class="notice">Te hemos enviado un enlace a <b>' + esc(email) + '</b>. Ábrelo desde este dispositivo para entrar (caduca en 20 minutos).</p>' +
            (r.dev_link ? '<p class="fine">Modo pruebas: <a href="' + esc(r.dev_link) + '">entrar directamente</a></p>' : "");
        });
      });
      return;
    }
    if (q.get("siguiente") === "premium" && !d.premium) { checkout(); }
    var plan = d.premium
      ? '<p class="plan plan-premium"><b>Premium</b> · activo hasta el ' + date(d.premium_until) + (d.status === "past_due" ? " (pago pendiente)" : "") + "</p>"
      : '<p class="plan"><b>Gratis</b> · ' + d.assistant_left + ' preguntas al asistente hoy</p>' +
        '<p><button class="btn btn-primary" type="button" data-checkout>Hazte Premium</button></p>';
    box.innerHTML =
      (q.get("bienvenida") ? '<p class="notice">¡Bienvenido a Brevazo Premium! 💜</p>' : "") +
      '<p class="muted">Has entrado como <b>' + esc(d.email) + "</b></p>" + plan +
      '<h2>Asistente de compras</h2><p><a class="btn btn-ghost" href="' + root + 'asistente/">Abrir el asistente</a></p>' +
      '<h2>Alertas</h2><div id="alerts"></div>' +
      '<h2>Sesión</h2><p><button class="btn btn-ghost" type="button" id="logout">Cerrar sesión</button></p>';
    document.getElementById("logout").addEventListener("click", function () {
      api("logout", { method: "POST" }).then(function () { location.href = root; });
    });
    renderAlerts(d);
  }

  function renderAlerts(d) {
    var el = document.getElementById("alerts");
    if (!d.premium) {
      el.innerHTML = '<p>Con Premium te avisamos por email en cuanto publicamos una oferta que encaja con lo que buscas (por ejemplo «RTX 5070» o «freidora de aire»).</p>';
      return;
    }
    api("alertas").then(function (r) {
      var list = (r.alerts || []).map(function (a) {
        return '<li><span>' + esc(a.query) + "</span>" + (a.last_sent ? '<small>último aviso ' + date(a.last_sent) + "</small>" : "") +
          '<button class="btn btn-ghost btn-sm" type="button" data-del="' + a.id + '" aria-label="Borrar alerta ' + esc(a.query) + '">Borrar</button></li>';
      }).join("");
      el.innerHTML = '<form class="alert-form" id="alert-form"><label for="alert-q">Avísame cuando haya una oferta de…</label>' +
        '<div class="login-row"><input id="alert-q" maxlength="60" required placeholder="p. ej. SSD 2TB"><button class="btn btn-primary" type="submit">Crear alerta</button></div></form>' +
        (list ? '<ul class="alert-list">' + list + "</ul>" : '<p class="muted">Aún no tienes alertas.</p>');
      document.getElementById("alert-form").addEventListener("submit", function (ev) {
        ev.preventDefault();
        api("alertas", { method: "POST", body: { query: document.getElementById("alert-q").value } }).then(function (x) {
          if (!x.ok) flash(x.error, true); renderAlerts(d);
        });
      });
      el.querySelectorAll("[data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          api("alertas?id=" + b.getAttribute("data-del"), { method: "DELETE" }).then(function () { renderAlerts(d); });
        });
      });
    });
  }

  function flash(msg, err) {
    var n = document.createElement("p");
    n.className = "notice" + (err ? " notice-err" : ""); n.setAttribute("role", "alert"); n.textContent = msg;
    box.insertBefore(n, box.firstChild); setTimeout(function () { n.remove(); }, 6000);
  }

  // ---------------------------------------------------------------- asistente
  var form = document.getElementById("chat-form");
  if (form) setupChat();

  function md(text) {  // Markdown mínimo y seguro: enlaces internos, negritas, listas y saltos de línea
    var html = esc(text)
      .replace(/\[([^\]]+)\]\(((?:ofertas|guias)\/[a-z0-9\-\/]+\.html)\)/g, function (_, t, href) {
        return '<a href="' + root + href + '">' + t + "</a>";
      })
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    var out = [], inList = false;
    html.split("\n").forEach(function (line) {
      var m = line.match(/^\s*[-*•]\s+(.*)/);
      if (m) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + m[1] + "</li>"); return; }
      if (inList) { out.push("</ul>"); inList = false; }
      if (line.trim()) out.push("<p>" + line + "</p>");
    });
    if (inList) out.push("</ul>");
    return out.join("");
  }

  function setupChat() {
    var log = document.getElementById("chat-log"), input = document.getElementById("chat-q"), left = document.getElementById("chat-left");
    var history = [];
    function add(role, html) {
      var li = document.createElement("li"); li.className = "msg msg-" + role; li.innerHTML = html;
      log.appendChild(li); li.scrollIntoView({ block: "nearest" }); return li;
    }
    loadMe().then(function (d) {
      if (!d.logged) left.innerHTML = '<a href="' + root + 'cuenta/">Entra con tu email</a> para usar el asistente (3 preguntas gratis al día).';
      else left.textContent = d.assistant_left + " preguntas disponibles hoy" + (d.premium ? " · Premium" : "");
    });
    add("assistant", "<p>¡Hola! Dime qué quieres comprar, para qué lo vas a usar y, si quieres, tu presupuesto aproximado.</p>");
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var q = input.value.trim(); if (!q) return;
      add("user", "<p>" + esc(q) + "</p>"); input.value = "";
      var wait = add("assistant", '<p class="typing">Pensando…</p>');
      form.querySelector("button").disabled = true;
      api("asistente", { method: "POST", body: { message: q, history: history } }).then(function (r) {
        form.querySelector("button").disabled = false;
        if (!r.ok) {
          wait.innerHTML = "<p>" + esc(r.error || "No he podido responder.") + "</p>" +
            (r.login ? '<p><a class="btn btn-primary btn-sm" href="' + root + 'cuenta/">Entrar</a></p>' : "") +
            (r.upgrade ? '<p><a class="btn btn-primary btn-sm" href="' + root + 'premium.html">Ver Premium</a></p>' : "");
          return;
        }
        wait.innerHTML = md(r.answer);
        history.push({ role: "user", content: q }, { role: "assistant", content: r.answer });
        left.textContent = r.left + " preguntas disponibles hoy" + (r.premium ? " · Premium" : "");
      });
    });
  }
})();
