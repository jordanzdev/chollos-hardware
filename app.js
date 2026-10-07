// Chollos Hardware: fechas relativas ("hace 2 h") y filtro de categorías en la portada. Sin cookies ni rastreo.
(function () {
  var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("es", { numeric: "auto" }) : null;
  document.querySelectorAll("time[data-rel]").forEach(function (t) {
    var diff = (new Date(t.getAttribute("datetime")) - new Date()) / 1000;
    if (!rtf || isNaN(diff)) return;
    var steps = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"]], unit = "second";
    for (var i = 0; i < steps.length && Math.abs(diff) >= steps[i][0]; i++) { diff /= steps[i][0]; unit = steps[i + 1] ? steps[i + 1][1] : "week"; }
    if (unit === "week" && Math.abs(diff) > 4) return; // más de un mes: se queda la fecha
    t.textContent = rtf.format(Math.round(diff), unit);
  });

  var chips = document.querySelectorAll(".chip[data-filter]");
  if (!chips.length) return;
  var cards = document.querySelectorAll(".deal[data-cat]"), none = document.querySelector(".no-results");
  function apply(cat) {
    var shown = 0;
    chips.forEach(function (c) { var on = c.dataset.filter === cat; c.classList.toggle("active", on); c.setAttribute("aria-pressed", on); });
    cards.forEach(function (card) { var ok = cat === "all" || card.dataset.cat === cat; card.hidden = !ok; if (ok) shown++; });
    if (none) none.hidden = shown > 0;
  }
  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      apply(c.dataset.filter);
      history.replaceState(null, "", c.dataset.filter === "all" ? location.pathname + "#ofertas" : "#" + c.dataset.filter);
    });
  });
  var initial = location.hash.slice(1);
  if (document.querySelector('.chip[data-filter="' + initial + '"]')) apply(initial);
})();
