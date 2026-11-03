/* Onglet « Entraînement » : la séance proposée d'après le plan, les séances prêtes, tous les exercices, et l'animation de l'exercice choisi
   (vue 3D avec joueurs et ballon animés, ou schéma de dessus, au choix). Les questions et les séances elles-mêmes sont gérées par plan-ui.js
   (mêmes éléments, déplacés dans cet onglet) ; ici : la bibliothèque, le lecteur et les boutons de vue. */
(function () {
  "use strict";
  const App = window.FSApp, KB = window.FutsalKB, SC = window.FutsalScenes, PL = window.FutsalPlayer, V3 = window.FutsalView3D;
  const $ = (id) => document.getElementById(id);
  const KEY = "fsal-vue-entrainement";
  let player = null, current = null, mode = "3d", ball = true, cam = "cote";

  /* petites préférences (vue, ballon) : si le stockage du navigateur est refusé, on garde les valeurs par défaut */
  try { const p = JSON.parse(localStorage.getItem(KEY) || "{}"); if (p.mode === "2d" || p.mode === "3d") mode = p.mode; if (typeof p.ball === "boolean") ball = p.ball; if (p.cam && V3 && V3.PRESETS[p.cam]) cam = p.cam; } catch (_e) { /* valeurs par défaut */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ mode, ball, cam })); } catch (_e) { /* tant pis */ } };

  const CATS = ["Échauffement", "Phases arrêtées", "Gardien-joueur", "Sortie de balle", "Finition", "Défense", "Attaque", "Transitions et pressing", "Autres"];
  function categorie(d) {
    const t = (KB.SEANCE_TAGS || {})[d.id] || {}, ins = t.ins || [];
    if (t.role === "ech") return "Échauffement";
    if (t.cp) return "Phases arrêtées";
    if (t.gj) return "Gardien-joueur";
    if (ins.indexOf("sortie") >= 0 || t.so || t.sp) return "Sortie de balle";
    if (t.role === "fin" || t.fi) return "Finition";
    if (ins.indexOf("transitions") >= 0 || t.pr || t.tr) return "Transitions et pressing";
    if (ins.indexOf("defense") >= 0 || t.def || t.dt) return "Défense";
    if (ins.indexOf("attaque") >= 0 || t.at || t.oc || t.sys) return "Attaque";
    return "Autres";
  }
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function renderList() {
    const box = $("train-list"); if (!box) return;
    const q = norm($("train-search").value.trim()), groups = {};
    KB.DRILLS.forEach((d) => {
      if (q && norm(d.name + " " + d.goal + " " + d.description).indexOf(q) < 0) return;
      (groups[categorie(d)] = groups[categorie(d)] || []).push(d);
    });
    box.innerHTML = "";
    let n = 0;
    CATS.forEach((c) => {
      if (!groups[c]) return;
      const h = document.createElement("h3"); h.textContent = c + " (" + groups[c].length + ")"; box.appendChild(h);
      groups[c].forEach((d) => {
        n++;
        const b = document.createElement("button"); b.className = "item"; b.dataset.id = d.id; if (current && current.id === d.id) b.classList.add("active");
        const a = document.createElement("span"); a.textContent = d.name; const m = document.createElement("span"); m.className = "muted"; m.textContent = d.duration + " min";
        b.appendChild(a); b.appendChild(m); b.addEventListener("click", () => show(d.id, true)); box.appendChild(b);
      });
    });
    if (!n) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Aucun exercice ne correspond à cette recherche."; box.appendChild(p); }
  }

  function ensurePlayer() {
    if (player) return player;
    player = new PL.ScenePlayer($("train-canvas"), {
      onTime: (T, dur, playing) => {
        $("tr-time").textContent = App.fmt(T) + " / " + App.fmt(dur);
        if (document.activeElement !== $("tr-seek")) $("tr-seek").value = dur ? Math.round((T / dur) * 1000) : 0;
        $("tr-play").textContent = playing ? "⏸ Pause" : "▶ Lecture";
      },
      onEnd: () => { $("tr-play").textContent = "▶ Lecture"; }
    });
    player.enableMouse();
    applyView();
    return player;
  }

  /* Sans exercice choisi, la lecture, le retour au début, la vitesse et la barre de position sont grisés, avec la raison (jamais de bouton muet). */
  function controles(on) {
    ["tr-play", "tr-restart", "tr-rate", "tr-seek"].forEach((id) => { const e = $(id); e.disabled = !on; e.title = on ? "" : "Choisis d'abord un exercice et clique sur « Voir l'animation »"; });
  }

  function applyView() {
    if (!player) return;
    player.setPreset(cam); player.setBall(ball); player.setMode(mode);
    $("tr-mode").textContent = mode === "3d" ? "Vue 3D" : "Vue de dessus";
    $("tr-mode").title = mode === "3d" ? "Passer à la vue de dessus (schéma)" : "Passer à la vue 3D";
    $("tr-ball").textContent = "Ballon : " + (ball ? "oui" : "non");
    $("tr-cams").hidden = mode !== "3d";
    document.querySelectorAll("#tr-cams button").forEach((b) => b.classList.toggle("active", b.dataset.cam === cam));
  }

  /* Montre l'animation d'un exercice (id du catalogue) ; autoplay : lance la lecture. */
  function show(id, autoplay) {
    const d = KB.DRILLS.find((x) => x.id === id), scene = d ? SC.forDrill(id) : null;
    if (!d || !scene) { App.toast("Animation indisponible pour cet exercice.", true); return false; }
    ensurePlayer();
    current = { id, drill: d };
    $("train-empty").hidden = true; controles(true);
    player.setSequence(SC.buildSequence([{ type: "scene", scene }]));
    applyView();
    const info = $("train-info"); info.innerHTML = "";
    const el = (tag, txt) => { const e = document.createElement(tag); e.textContent = txt; return e; };
    info.appendChild(el("h3", d.name + " (" + d.duration + " min)"));
    info.appendChild(el("p", "Joueurs : " + d.players + " · Objectif : " + d.goal));
    info.appendChild(el("p", d.description));
    const cr = document.createElement("p"), st = document.createElement("strong"); st.textContent = "Critères de réussite : "; cr.appendChild(st); cr.appendChild(document.createTextNode(d.criteria.join(" · "))); info.appendChild(cr);
    document.querySelectorAll("#train-list button.item").forEach((b) => b.classList.toggle("active", b.dataset.id === id));
    if (autoplay) player.play();
    return true;
  }

  /* Ouvre l'onglet, montre l'exercice et amène le lecteur à l'écran (bouton « Voir l'animation » des séances). */
  function open(id) {
    if (!document.getElementById("tab-entrainement").classList.contains("active")) App.showTab("entrainement");
    const ok = show(id, true);
    const st = $("train-stage"); if (ok && st && st.scrollIntoView) st.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return ok;
  }

  function pane(name) {
    ["seance", "pretes", "exos"].forEach((n) => { const p = $("train-pane-" + n); if (p) p.hidden = n !== name; });
    document.querySelectorAll("#train-sub button").forEach((b) => b.classList.toggle("active", b.dataset.pane === name));
    if (name === "exos") renderList();
  }

  function bind() {
    document.querySelectorAll("#train-sub button").forEach((b) => b.addEventListener("click", () => pane(b.dataset.pane)));
    $("train-search").addEventListener("input", renderList);
    $("tr-play").addEventListener("click", () => { if (!current) return; ensurePlayer(); if (player.playing) player.pause(); else player.play(); });
    $("tr-restart").addEventListener("click", () => { if (!player || !current) return; player.seek(0); player.play(); });
    $("tr-rate").addEventListener("change", () => { if (player) player.rate = Number($("tr-rate").value) || 1; });
    $("tr-seek").addEventListener("input", () => { if (player && player.seq) player.seek((Number($("tr-seek").value) / 1000) * player.seq.duration); });
    $("tr-mode").addEventListener("click", () => { mode = mode === "3d" ? "2d" : "3d"; save(); applyView(); });
    $("tr-ball").addEventListener("click", () => { ball = !ball; save(); applyView(); });
    document.querySelectorAll("#tr-cams button").forEach((b) => b.addEventListener("click", () => { cam = b.dataset.cam; save(); applyView(); }));
    const go = $("plan-go-train"); if (go) go.addEventListener("click", () => App.showTab("entrainement"));
  }

  const prevLoad = App.hooks.onLoad;
  App.hooks.onLoad = function () { if (prevLoad) prevLoad.apply(this, arguments); };
  const prevTr = App.hooks.onTraining;
  App.hooks.onTraining = function () { if (prevTr) prevTr.apply(this, arguments); renderList(); };
  bind(); controles(false);
  window.FSTraining = { show, open, categorie, renderList, pane, view: () => ({ mode, ball, cam }), player: () => player };
})();
