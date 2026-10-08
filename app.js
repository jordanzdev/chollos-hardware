// Techollos: capa dinámica de la web estática. Sin cookies ni rastreo (favoritos en localStorage del navegador).
// - fechas relativas y aviso de oferta antigua      - favoritos (❤) y compartir
// - portada: búsqueda instantánea, orden, guardadas, "ver más" y ofertas nuevas en directo (deals.json)
// - service worker: instalable como app y funciona sin conexión
(function () {
  "use strict";
  var root = document.body.getAttribute("data-root") || "./";
  var STALE_DAYS = 7, PAGE = 24, POLL_MS = 120000;

  // ---------------------------------------------------------------- utilidades
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function store(key, val) {
    try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null"); localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { return null; }
  }
  function toast(msg, action, onAction) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status");
    t.innerHTML = "<span>" + esc(msg) + "</span>" + (action ? '<button type="button">' + esc(action) + "</button>" : "");
    if (action) t.querySelector("button").addEventListener("click", function () { t.remove(); onAction(); });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("in"); }, 10);
    if (!action) setTimeout(function () { t.remove(); }, 3500);
  }

  // ---------------------------------------------------------------- fechas
  var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("es", { numeric: "auto" }) : null;
  function rel(iso) {
    var diff = (new Date(iso) - new Date()) / 1000;
    if (!rtf || isNaN(diff)) return null;
    var steps = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"]], unit = "second";
    for (var i = 0; i < steps.length && Math.abs(diff) >= steps[i][0]; i++) {
      diff /= steps[i][0]; unit = steps[i + 1] ? steps[i + 1][1] : "month";
    }
    return rtf.format(Math.round(diff), unit);
  }
  function decorateTimes(scope) {
    scope.querySelectorAll("time[data-rel]").forEach(function (t) {
      var iso = t.getAttribute("datetime"), r = rel(iso);
      if (r) t.textContent = r;
      var days = (new Date() - new Date(iso)) / 864e5;
      var card = t.closest(".deal, .deal-page");
      if (days > STALE_DAYS && card && !card.querySelector(".stale-tag")) {
        card.classList.add("stale");
        var tag = document.createElement("span");
        tag.className = "stale-tag"; tag.textContent = "Puede haber terminado";
        t.insertAdjacentElement("afterend", tag);
      }
    });
  }

  // ---------------------------------------------------------------- favoritos
  var FKEY = "techollos:favs";
  var favs = store(FKEY) || [];
  function isFav(slug) { return favs.indexOf(slug) !== -1; }
  function bindFavs(scope) {
    scope.querySelectorAll("[data-fav]").forEach(function (b) {
      var slug = b.getAttribute("data-fav");
      b.setAttribute("aria-pressed", isFav(slug));
      if (b._bound) return; b._bound = true;
      b.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (isFav(slug)) favs = favs.filter(function (s) { return s !== slug; }); else favs.unshift(slug);
        store(FKEY, favs);
        document.querySelectorAll('[data-fav="' + slug + '"]').forEach(function (x) { x.setAttribute("aria-pressed", isFav(slug)); });
        toast(isFav(slug) ? "Guardada en tus ofertas ❤" : "Quitada de guardadas");
        if (index && index.state.favs) index.render();
      });
    });
  }

  // ---------------------------------------------------------------- compartir
  document.querySelectorAll("[data-share]").forEach(function (b) {
    b.addEventListener("click", function () {
      var data = { title: b.getAttribute("data-share"), url: location.href.split("#")[0] };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(data.url) : Promise.reject())
        .then(function () { toast("Enlace copiado"); }, function () { prompt("Copia el enlace:", data.url); });
    });
  });

  // ---------------------------------------------------------------- portada dinámica
  var index = null;
  var grid = document.getElementById("deal-grid");
  var input = document.getElementById("buscar");
  if (grid && input) index = setupIndex();

  function setupIndex() {
    var sel = document.getElementById("orden"), favBtn = document.getElementById("guardadas");
    var results = document.getElementById("results"), moreBtn = document.getElementById("more");
    var sprite = document.getElementById("sprite");
    var params = new URLSearchParams(location.search);
    var me = {
      deals: null, newest: null,
      state: { q: params.get("q") || "", sort: params.get("orden") || "recent", favs: params.get("guardadas") === "1", limit: PAGE }
    };
    function tpl(sel) { var t = sprite.querySelector(sel); return t ? t.innerHTML : ""; }
    function card(d) {
      return '<article class="card deal" data-cat="' + esc(d.c) + '" data-slug="' + esc(d.s) + '">' +
        '<a class="deal-link" href="' + root + "ofertas/" + esc(d.s) + '.html" aria-label="' + esc(d.t) + '"></a>' +
        '<button class="fav" type="button" data-fav="' + esc(d.s) + '" aria-pressed="false" aria-label="Guardar oferta">' + tpl('[data-icon="heart"]') + "</button>" +
        '<div class="deal-top">' + (tpl('[data-tile="' + d.c + '"]') || tpl('[data-tile="otro"]')) +
        '<div class="deal-meta"><span class="badge">' + esc(d.n) + '</span><time datetime="' + esc(d.d) + '" data-rel>' +
        new Date(d.d).toLocaleDateString("es-ES") + "</time></div></div>" +
        '<h3 class="deal-title">' + esc(d.t) + '</h3><p class="deal-sum">' + esc(d.m) + "</p>" +
        '<div class="deal-foot"><span class="store">Amazon</span><a class="btn btn-buy btn-sm" href="' + esc(d.u) +
        '" rel="sponsored nofollow noopener" target="_blank">Ver precio ' + tpl('[data-icon="arrow"]') + "</a></div></article>";
    }
    function list() {
      var s = me.state, words = norm(s.q).split(/\s+/).filter(Boolean);
      var out = me.deals.filter(function (d) {
        if (s.favs && !isFav(d.s)) return false;
        if (!words.length) return true;
        var hay = norm(d.t + " " + d.m + " " + d.n);
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      });
      if (s.sort === "az") out.sort(function (a, b) { return a.t.localeCompare(b.t, "es"); });
      else if (s.sort === "cat") out.sort(function (a, b) { return a.n.localeCompare(b.n, "es") || (b.d > a.d ? 1 : -1); });
      return out;
    }
    me.render = function () {
      if (!me.deals) return;
      var all = list(), shown = all.slice(0, me.state.limit), s = me.state;
      grid.innerHTML = shown.length ? shown.map(card).join("") :
        '<div class="card empty"><h3>' + (s.favs && !s.q ? "Aún no tienes ofertas guardadas" : "No hay ofertas que coincidan") + "</h3><p>" +
        (s.favs && !s.q ? "Pulsa ❤ en cualquier oferta para guardarla aquí." : "Prueba con otra palabra o quita filtros.") + "</p></div>";
      decorateTimes(grid); bindFavs(grid);
      if (moreBtn) moreBtn.parentNode.hidden = all.length <= shown.length;
      results.textContent = (s.q || s.favs) ? all.length + (all.length === 1 ? " oferta" : " ofertas") + (s.q ? " para «" + s.q + "»" : "") : "";
      var p = new URLSearchParams();
      if (s.q) p.set("q", s.q); if (s.sort !== "recent") p.set("orden", s.sort); if (s.favs) p.set("guardadas", "1");
      history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : "") + location.hash);
    };
    function load(cb) {
      fetch(root + "deals.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (data) {
        var prev = me.newest;
        me.deals = data.deals || [];
        me.newest = me.deals.length ? me.deals[0].d : null;
        cb && cb(prev);
      }).catch(function () {});
    }
    var custom = function () { var s = me.state; return s.q || s.favs || s.sort !== "recent"; };

    input.value = me.state.q; sel.value = me.state.sort; favBtn.setAttribute("aria-pressed", me.state.favs);
    var timer;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { me.state.q = input.value.trim(); me.state.limit = PAGE; me.render(); }, 120);
    });
    sel.addEventListener("change", function () { me.state.sort = sel.value; me.state.limit = PAGE; me.render(); });
    favBtn.addEventListener("click", function () {
      me.state.favs = !me.state.favs; favBtn.setAttribute("aria-pressed", me.state.favs); me.state.limit = PAGE; me.render();
    });
    if (moreBtn) moreBtn.addEventListener("click", function () { me.state.limit += PAGE; me.render(); });
    if (location.hash === "#buscar") setTimeout(function () { input.focus(); }, 50);

    // Las tarjetas ya vienen pintadas en el HTML (rápido y bueno para Google); el JSON añade el resto.
    load(function () { if (custom()) me.render(); });

    // Ofertas nuevas en directo: si se publica algo mientras la página está abierta, se avisa.
    setInterval(function () {
      if (document.hidden || !me.deals) return;
      load(function (prev) {
        if (!prev || !me.newest || me.newest <= prev) return;
        var n = me.deals.filter(function (d) { return d.d > prev; }).length;
        toast(n === 1 ? "Hay 1 oferta nueva" : "Hay " + n + " ofertas nuevas", "Ver", function () {
          me.state.q = ""; input.value = ""; me.state.favs = false; favBtn.setAttribute("aria-pressed", false);
          me.state.sort = "recent"; sel.value = "recent"; me.render();
          document.getElementById("ofertas").scrollIntoView({ behavior: "smooth" });
        });
      });
    }, POLL_MS);
    return me;
  }

  // ---------------------------------------------------------------- arranque
  decorateTimes(document);
  bindFavs(document);
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register(root + "sw.js", { scope: root }).catch(function () {});
  }
})();
