/* Contrôle rapide de la qualité : barre en bas de l'écran. Le programme montre des instants choisis au hasard sur la vidéo, avec ce qu'il a trouvé ;
   John répond O (oui, juste) / N (non) / ? (incertain). Les verdicts restent dans le projet (ai.controleRapide) et servent à mesurer (scripts/mesure/score.js). */
(function () {
  "use strict";
  const App = window.FSApp, C = window.FutsalControle, $ = (id) => document.getElementById(id);
  if (!App || !C) return;
  let bar = null, comp = "ballon", liste = [], idx = 0, ouvert = false;

  const ai = () => (App.state.project.ai || (App.state.project.ai = {}));
  const verdicts = () => (Array.isArray(ai().controleRapide) ? ai().controleRapide : (ai().controleRapide = []));
  const pct = (x) => Math.round(x * 1000) / 10;

  function construire() {
    bar = document.createElement("div");
    bar.id = "qc-bar"; bar.className = "qc-bar"; bar.hidden = true; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Contrôle rapide de la qualité");
    bar.innerHTML = "<div class=\"qc-top\"><b>Contrôle rapide</b> <label>Sujet <select id=\"qc-comp\"></select></label><span id=\"qc-pos\" class=\"muted\"></span><button id=\"qc-close\" class=\"ghost\" type=\"button\" title=\"Fermer (Échap) : tes réponses sont gardées\">Fermer</button></div>" +
      "<div id=\"qc-q\" class=\"qc-q\"></div>" +
      "<div class=\"qc-btns\"><button id=\"qc-prev\" type=\"button\" class=\"ghost\" title=\"Image précédente (←)\">◀</button><button id=\"qc-oui\" type=\"button\" class=\"primary\" title=\"Oui, c'est juste (O)\">Oui (O)</button><button id=\"qc-non\" type=\"button\" title=\"Non, c'est faux (N)\">Non (N)</button><button id=\"qc-inc\" type=\"button\" class=\"ghost\" title=\"Tu hésites : ni pour ni contre (?)\">Incertain (?)</button><button id=\"qc-next\" type=\"button\" class=\"ghost\" title=\"Image suivante (→)\">▶</button></div>" +
      "<div id=\"qc-sum\" class=\"muted qc-sum\"></div>";
    document.body.appendChild(bar);
    if (window.ResizeObserver) new ResizeObserver(() => reserve()).observe(bar);
    const sel = $("qc-comp");
    Object.keys(C.COMPS).forEach((k) => { const o = document.createElement("option"); o.value = k; o.textContent = C.COMPS[k].nom; sel.appendChild(o); });
    sel.addEventListener("change", () => { comp = sel.value; charger(); });
    $("qc-close").addEventListener("click", fermer);
    $("qc-oui").addEventListener("click", () => repondre("oui"));
    $("qc-non").addEventListener("click", () => repondre("non"));
    $("qc-inc").addEventListener("click", () => repondre("incertain"));
    $("qc-prev").addEventListener("click", () => aller(idx - 1));
    $("qc-next").addEventListener("click", () => aller(idx + 1));
    window.addEventListener("keydown", (e) => {
      if (!ouvert || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && e.key !== "Escape") return;
      const k = e.key.toLowerCase(); let fait = true;
      if (k === "o") repondre("oui"); else if (k === "n") repondre("non"); else if (k === "?" || k === "i") repondre("incertain");
      else if (e.key === "ArrowRight") aller(idx + 1); else if (e.key === "ArrowLeft") aller(idx - 1);
      else if (e.key === "Escape") fermer(); else fait = false;
      if (fait) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  function charger() {
    const frames = comp === "terrain" ? (window.FSApp.ai && window.FSApp.ai.getSuiviFrames ? window.FSApp.ai.getSuiviFrames() : []) : (window.FSApp.ai && window.FSApp.ai.getFrames ? window.FSApp.ai.getFrames() : []);
    if (comp === "terrain") { const oc = $("ov-court"); if (oc && !oc.checked) { oc.checked = true; oc.dispatchEvent(new Event("change")); } }      // le tracé doit être affiché pour être jugé
    liste = C.echantillon(frames, comp, App.state.project.videoName || "", { n: 100, ecart: 2 });
    const v = verdicts();
    const premier = liste.findIndex((t) => !C.verdictDe(v, t, comp));
    idx = premier >= 0 ? premier : 0;
    $("qc-q").textContent = C.COMPS[comp].question;
    if (!liste.length) { $("qc-pos").textContent = ""; $("qc-sum").textContent = "Rien à contrôler pour ce sujet : "+(comp === "terrain" ? "le suivi de la caméra n'est pas terminé pour cette vidéo." : "le programme n'a rien affiché de ce type dans l'analyse.")+""; return; }
    aller(idx);
  }

  function aller(i) {
    if (!liste.length) return;
    idx = Math.max(0, Math.min(liste.length - 1, i));
    const t = liste[idx]; App.video.pause(); App.seek(t);
    const cur = C.verdictDe(verdicts(), t, comp);
    $("qc-pos").textContent = "Image " + (idx + 1) + " sur " + liste.length + (cur ? " — déjà répondu : " + ({ oui: "oui", non: "non", incertain: "incertain" })[cur] : "");
    resumeTexte();
  }

  function resumeTexte() {
    const r = C.resume(verdicts(), comp);
    const jt = comp === "terrain" && window.FSApp.ai && window.FSApp.ai.journalTexte ? " " + window.FSApp.ai.journalTexte() : "";
    $("qc-sum").textContent = "Oui " + r.oui + " · Non " + r.non + " · Incertain " + r.incertain + (r.wilson ? " — juste " + pct(r.wilson.p) + " % [" + pct(r.wilson.bas) + " – " + pct(r.wilson.haut) + "] sur " + r.n + (r.n < 100 ? " (moins de 100 : pas assez pour prouver 95 %)" : "") : "") + jt;
  }

  function repondre(v) {
    if (!liste.length) { App.toast("Rien à contrôler pour ce sujet."); return; }
    C.repondre(verdicts(), liste[idx], comp, v);
    if (comp === "terrain" && window.FSApp.ai && window.FSApp.ai.verdictTerrain) window.FSApp.ai.verdictTerrain(liste[idx], v);      // mesure + verdict gardés dans le journal de décisions
    App.changed();
    if (idx < liste.length - 1) aller(idx + 1); else { aller(idx); App.toast("Dernière image de ce sujet : merci. Tes réponses sont gardées dans le projet."); }
  }

  function ouvrir() {
    const frames = window.FSApp.ai && window.FSApp.ai.getFrames ? window.FSApp.ai.getFrames() : [];
    if (!App.isVideoReady()) { App.toast("Choisissez d'abord une vidéo."); return; }
    const suivi = window.FSApp.ai && window.FSApp.ai.getSuiviFrames ? window.FSApp.ai.getSuiviFrames() : [];
    if (!frames.length && !suivi.length) { App.toast("Faites d'abord une analyse : le contrôle rapide vérifie ce que le programme a trouvé."); return; }
    if (!frames.length) comp = "terrain";      // pas d'analyse mais le suivi du terrain est fait : on peut déjà juger le tracé
    if (!bar) construire();
    App.showTab("analyse");
    ouvert = true; bar.hidden = false; $("qc-comp").value = comp; reserve(); charger();
  }
  /* la barre est fixée par-dessus la page : tant qu'elle est ouverte, on réserve sa hauteur sous l'onglet pour que tous ses boutons restent atteignables au-dessus */
  function reserve() { const m = document.querySelector("main"); if (m) m.style.paddingBottom = ouvert && bar && !bar.hidden ? (bar.offsetHeight + 24) + "px" : ""; }
  function fermer() { ouvert = false; if (bar) bar.hidden = true; reserve(); }
  window.addEventListener("resize", reserve);
  /* la barre est fixée en bas de l'écran : dès qu'on quitte l'onglet « Analyse vidéo » (clic sur un onglet, bouton, menu, assistant), elle se ferme
     (les réponses sont gardées), sinon elle recouvre les boutons des autres onglets */
  const ongletAnalyse = $("tab-analyse");
  if (ongletAnalyse) new MutationObserver(() => { if (ouvert && !ongletAnalyse.classList.contains("active")) fermer(); }).observe(ongletAnalyse, { attributes: true, attributeFilter: ["class"] });

  window.FSControle = { open: ouvrir, close: fermer, state: () => ({ ouvert, comp, idx, n: liste.length, t: liste[idx] }) };
  const b = $("ai-qc-start"); if (b) b.addEventListener("click", ouvrir);
})();
