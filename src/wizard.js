/* Assistant d'analyse : un seul bouton « Analyser une vidéo », puis l'IA guide pas à pas.
   Étapes : choix des vidéos → terrain → silhouettes (mon équipe, adversaires, gardiens, arbitre) → analyse → résultats. */
(function () {
  "use strict";
  const App = window.FSApp, AI = window.FSAI, K = window.FutsalKit, HG = window.FutsalHomography, CF = window.FutsalCourtFit, GL = window.FutsalGoal;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc, api = App.api, video = App.video;

  const CATS = [
    { key: "A", title: "Mon équipe", color: "#3b82f6", required: true, who: "vos joueurs", help: "Cliquez sur la silhouette de chacun de vos joueurs (2 ou 3 suffisent ; plus il y en a, plus c'est fiable)." },
    { key: "B", title: "Adversaires", color: "#ef4444", required: true, who: "les adversaires", help: "Cliquez maintenant sur la silhouette des joueurs adverses." },
    { key: "GKA", title: "Mon gardien", color: "#f2b705", required: false, who: "votre gardien", help: "Cliquez sur votre gardien s'il porte une tenue différente. Sinon, passez." },
    { key: "GKB", title: "Gardien adverse", color: "#ff8a3d", required: false, who: "le gardien adverse", help: "Cliquez sur le gardien adverse s'il est visible. Sinon, passez." },
    { key: "REF", title: "Arbitre", color: "#a78bfa", required: false, who: "l'arbitre", help: "Cliquez sur l'arbitre s'il est visible. Sinon, passez." }
  ];
  const LANDMARK_ORDER = ["corner_tl", "corner_tr", "corner_br", "corner_bl", "l_penalty", "r_penalty", "l_area_top", "l_area_bottom", "r_area_top", "r_area_bottom", "center", "mid_top", "mid_bottom", "circle_top", "circle_bottom", "l_dash_mid", "r_dash_mid", "l_front_top", "l_front_bottom", "r_front_top", "r_front_bottom"];

  const W = {
    step: "idle", queue: [], idx: 0, same: false, results: [], shared: null,
    lmIdx: 0, terrainT: null, msg: "",
    catIdx: 0, det: null, hover: -1, addMode: false, drag: null, busy: "",
    progress: 0, running: false,
    internalLoad: 0,          // > 0 pendant les chargements de projet faits par l'assistant lui-même
    T: null                   // repérage automatique du terrain (voir startTerrain)
  };
  const TARGETS = [
    { key: "six", x: 6, dy: 0, required: true, label: "la ligne pleine des 6 m, juste devant le milieu du but" },
    { key: "nine", x: 9, dy: 0, label: "la ligne pointillée des 9 m, devant le milieu du but" },
    { key: "endL", x: 0, dy: -7.5, label: "le bout GAUCHE de la ligne des 6 m, là où elle touche la ligne de but" },
    { key: "endR", x: 0, dy: 7.5, label: "le bout DROIT de la ligne des 6 m, là où elle touche la ligne de but" }
  ];
  const root = $("wiz");

  /* ---------- utilitaires ---------- */
  const cur = () => CATS[W.catIdx];
  const lmList = () => HG.landmarks(AI.ai().L, AI.ai().W);
  const lmLabel = (id) => (lmList().find((l) => l.id === id) || { label: id }).label;
  function setStep(s) { W.step = s; W.msg = ""; render(); AI.redraw(); }
  function videoLabel() { const v = W.queue[W.idx]; return v ? v.name : (App.state.project.videoName || ""); }
  function progressDots() {
    const steps = [["terrain", "Terrain"], ["players", "Joueurs"], ["run", "Analyse"], ["done", "Résultats"]];
    const order = steps.map((x) => x[0]), i = order.indexOf(W.step);
    return "<div class=\"wiz-dots\">" + steps.map((x, n) => "<span class=\"" + (n < i ? "ok" : n === i ? "cur" : "") + "\">" + (n + 1) + ". " + x[1] + "</span>").join("") + "</div>";
  }
  function queueHeader() {
    return W.queue.length > 1 ? "<p class=\"wiz-q\">Vidéo " + (W.idx + 1) + " / " + W.queue.length + " : <b>" + esc(videoLabel()) + "</b>" + (W.same ? " (même match)" : "") + "</p>" : "";
  }
  function waitVideo(ms) {
    return new Promise((resolve) => {
      if (App.isVideoReady()) return resolve(true);
      const done = (ok) => { clearTimeout(t); video.removeEventListener("loadedmetadata", on); video.removeEventListener("error", off); resolve(ok); };
      const on = () => done(true), off = () => done(false), t = setTimeout(() => done(false), ms || 20000);
      video.addEventListener("loadedmetadata", on); video.addEventListener("error", off);
    });
  }

  /* ---------- rendu ---------- */
  function render() {
    const fn = { idle: rIdle, choose: rChoose, loading: rLoading, terrain: rTerrain, players: rPlayers, run: rRun, done: rDone }[W.step] || rIdle;
    root.innerHTML = fn();
    root.className = "wiz wiz-" + W.step;
  }

  function rIdle() {
    const loaded = App.isVideoReady() && !AI.hasAnalysis();
    return "<button class=\"primary big wiz-start\" data-act=\"start\">▶ Analyser une vidéo</button>" +
      "<p class=\"muted\">Choisissez une ou plusieurs vidéos. L'IA vous guide ensuite pas à pas : <b>terrain</b>, puis <b>vos joueurs</b> (par clic sur leur silhouette), <b>adversaires</b>, <b>gardiens</b>, <b>arbitre</b>, puis elle analyse tout le match et propose des corrections.</p>" +
      (loaded ? "<p><button class=\"linklike\" data-act=\"useCurrent\">Utiliser la vidéo déjà ouverte (" + esc(App.state.project.videoName || "") + ")</button></p>" : "") +
      (W.results.length ? resultsList() : "");
  }

  function rChoose() {
    return "<h3>" + W.queue.length + " vidéos choisies</h3>" +
      "<label class=\"wiz-opt\"><input type=\"radio\" name=\"wsame\" value=\"1\" " + (W.same ? "checked" : "") + "> <span><b>Même match</b> (par exemple les deux mi-temps) : j'apprends les tenues <b>une seule fois</b> et je les réutilise pour toutes les vidéos.</span></label>" +
      "<label class=\"wiz-opt\"><input type=\"radio\" name=\"wsame\" value=\"0\" " + (!W.same ? "checked" : "") + "> <span><b>Matchs différents</b> : je redemande les tenues pour chaque vidéo.</span></label>" +
      "<div class=\"wiz-btns\"><button class=\"primary\" data-act=\"begin\">Continuer ▶</button><button class=\"ghost\" data-act=\"cancel\">Annuler</button></div>";
  }

  function rLoading() { return "<p class=\"wiz-busy\">⏳ " + esc(W.busy || "Chargement…") + "</p>"; }

  function rTerrain() {
    const T = W.T;
    if (!T || T.phase === "manual") return rTerrainManual();
    const head = queueHeader() + progressDots() + "<h3>1. Repérer le terrain</h3>";
    const cancel = "<div class=\"wiz-btns\"><button class=\"ghost\" data-act=\"cancel\">Annuler l'assistant</button></div>";
    if (T.phase === "scan") return head + "<p class=\"wiz-busy\">⏳ " + esc(T.text || "Recherche d'un but dans la vidéo…") + "</p>" + cancel;
    if (T.phase === "nogoal") {
      return head + "<p>Je n'ai pas repéré de but (poteaux rayés rouge et blanc) dans la vidéo. Avancez la vidéo jusqu'à une image où <b>un but est bien visible</b>, puis cliquez :</p>" +
        "<div class=\"wiz-btns\"><button class=\"primary\" data-act=\"retryGoal\">🔍 Chercher le but sur cette image</button><button data-act=\"manualMode\">Placer les repères moi-même</button></div>" +
        (T.msg ? "<p class=\"wiz-err\">" + esc(T.msg) + "</p>" : "") + cancel;
    }
    if (T.phase === "color") {
      return head + "<p class=\"wiz-now\">Quelle est la couleur des lignes de votre terrain de futsal ?</p>" +
        "<p class=\"muted\">Plusieurs couleurs sont tracées au sol : choisissez celle des lignes du futsal.</p>" +
        "<div class=\"wiz-colors\">" + T.colors.map((c) => "<button data-act=\"pickColor\" data-key=\"" + c.key + "\"><i class=\"sw\" style=\"background:" + c.hex + "\"></i> " + esc(c.name) + "</button>").join("") + "</div>" + cancel;
    }
    // phase « clics »
    const next = nextTarget();
    const cname = T.colorKey ? (CF.COLORS[T.colorKey].name || "").toLowerCase() : "";
    const placed = T.clicks.length;
    let ask;
    if (next) ask = "<p class=\"wiz-now\">" + (placed ? "Repère suivant (recommandé : 3 à 4 repères donnent un terrain plus précis) : " : "Le but est repéré (en vert). ") + "Cliquez sur " + esc(next.label) + (cname ? " (ligne " + esc(cname) + ")" : "") + ".</p>" +
      (placed ? "<p class=\"muted\">Le cercle rouge indique où je pense qu'il se trouve.</p>" : "");
    else ask = "<p class=\"wiz-now\">Tous les repères sont placés.</p>";
    return head + ask +
      "<p class=\"wiz-count\">Les lignes <b style=\"color:#22d3ee\">bleues</b> (6 m) et <b style=\"color:#facc15\">jaunes</b> (9 m) tracées sur la vidéo doivent recouvrir les lignes du terrain.</p>" +
      (T.msg ? "<p class=\"wiz-err\">" + esc(T.msg) + "</p>" : "") +
      "<div class=\"wiz-btns\">" + (next && !next.required ? "<button data-act=\"skipTarget\">Passer (non visible)</button>" : "") + (placed ? "<button data-act=\"undoClick\">↶ Annuler le dernier clic</button>" : "") + "</div>" +
      (placed ? "<p class=\"wiz-now\">Le but visible sur la vidéo est-il…</p><div class=\"wiz-btns\"><button class=\"primary\" data-act=\"validateTerrain\" data-side=\"def\">Valider : c'est le but que je DÉFENDS</button><button class=\"primary\" data-act=\"validateTerrain\" data-side=\"att\">Valider : c'est le but que j'ATTAQUE</button></div>" : "") +
      "<div class=\"wiz-btns\"><button data-act=\"otherGoal\">Autre image / autre but</button>" + (T.colors && T.colors.length > 1 ? "<button data-act=\"changeColor\">Changer la couleur</button>" : "") + "<button data-act=\"manualMode\">Placer les repères moi-même</button><button class=\"ghost\" data-act=\"cancel\">Annuler l'assistant</button></div>";
  }

  /* Ancienne méthode, conservée en secours : clic sur des repères choisis dans une liste. */
  function rTerrainManual() {
    const a = AI.ai(), pts = AI.getPoints();
    const id = LANDMARK_ORDER[W.lmIdx];
    const placed = pts.length;
    let now;
    if (id) now = "<p class=\"wiz-now\">Cliquez sur la vidéo à cet endroit : <b>" + esc(lmLabel(id)) + "</b></p>" +
      "<div class=\"wiz-btns\"><button data-act=\"skipLm\">Je ne le vois pas → suivant</button>" + (placed ? "<button data-act=\"undoLm\">↶ Annuler le dernier</button>" : "") + "</div>";
    else now = "<p class=\"wiz-now\">Tous les repères ont été proposés.</p>";
    return queueHeader() + progressDots() + "<h3>1. Montrer le terrain à l'IA</h3>" +
      "<p>Avancez la vidéo jusqu'à une image où l'on voit bien les <b>lignes noires</b> du terrain, puis <b>ne la bougez plus</b>. Cliquez sur les points demandés (4 minimum, répartis sur le terrain).</p>" +
      "<div class=\"wiz-grid\"><label>Mon équipe attaque vers<select data-set=\"dir\"><option value=\"1\"" + ((a.dir || 1) === 1 ? " selected" : "") + ">la droite de l'image</option><option value=\"-1\"" + (a.dir === -1 ? " selected" : "") + ">la gauche de l'image</option></select></label>" +
      "<label>Caméra<select data-set=\"camera\"><option value=\"mobile\"" + (a.camera !== "fixed" ? " selected" : "") + ">Smartphone à la main (elle bouge)</option><option value=\"fixed\"" + (a.camera === "fixed" ? " selected" : "") + ">Fixe (trépied)</option></select></label></div>" +
      now + "<p class=\"wiz-count\">Repères placés : <b>" + placed + "</b> / 4 minimum</p>" +
      (W.msg ? "<p class=\"wiz-err\">" + esc(W.msg) + "</p>" : "") +
      "<div class=\"wiz-btns\"><button class=\"primary\" data-act=\"calOk\"" + (placed >= 4 ? "" : " disabled") + ">Valider le terrain ✓</button><button data-act=\"autoMode\">↩ Repérage automatique</button><button class=\"ghost\" data-act=\"cancel\">Annuler l'assistant</button></div>";
  }

  function chips() {
    const r = AI.refs();
    return "<div class=\"wiz-chips\">" + CATS.map((c, i) => {
      const has = !!r[c.key], sw = has ? K.swatches(r[c.key]) : null;
      return "<span class=\"wchip" + (i === W.catIdx ? " cur" : "") + (has ? " ok" : "") + "\" style=\"--c:" + c.color + "\">" + esc(c.title) + (sw ? " <i class=\"sw\" style=\"background:" + sw.shirt + "\"></i>" + (sw.shorts ? "<i class=\"sw\" style=\"background:" + sw.shorts + "\"></i>" : "") + (sw.socks ? "<i class=\"sw\" style=\"background:" + sw.socks + "\"></i>" : "") : "") + "</span>";
    }).join("") + "</div>";
  }

  function rPlayers() {
    const c = cur(), d = W.det;
    let body;
    if (W.busy) body = "<p class=\"wiz-busy\">⏳ " + esc(W.busy) + "</p>";
    else if (!d) {
      body = "<p>Placez la vidéo sur une image où <b>" + esc(c.who) + "</b> " + (c.key === "A" || c.key === "B" ? "sont" : "est") + " bien visible" + (c.key === "A" || c.key === "B" ? "s" : "") + " (utilisez la barre sous la vidéo), puis cliquez :</p>" +
        "<div class=\"wiz-btns\"><button class=\"primary big\" data-act=\"detect\">🔍 Découper les joueurs de cette image</button></div>";
    } else {
      const n = d.players.filter((p) => p.cat === c.key && !p.locked).length;
      body = "<p class=\"wiz-now\">" + esc(c.help) + "</p>" +
        "<p class=\"wiz-count\">" + d.players.length + " silhouette(s) trouvée(s) · sélectionnée(s) pour « " + esc(c.title) + " » : <b>" + n + "</b></p>" +
        (W.addMode ? "<p class=\"wiz-hint\">Mode ajout : tracez un rectangle autour du joueur non détecté (maintenez le bouton de la souris).</p>" : "") +
        "<div class=\"wiz-btns\"><button class=\"primary\" data-act=\"validateCat\"" + (n || !c.required ? "" : " disabled") + ">" + (n ? "Valider « " + esc(c.title) + " » ✓" : "Valider") + "</button>" +
        (!c.required ? "<button data-act=\"skipCat\">Passer (non visible)</button>" : "") +
        "<button data-act=\"addMode\" class=\"" + (W.addMode ? "active" : "") + "\">＋ Joueur non détecté</button><button data-act=\"redetect\">↺ Autre image</button></div>";
    }
    return queueHeader() + progressDots() + "<h3>2. Apprendre les tenues par les silhouettes</h3>" + chips() + body +
      (W.msg ? "<p class=\"wiz-err\">" + esc(W.msg) + "</p>" : "") +
      "<div class=\"wiz-btns\"><button class=\"ghost\" data-act=\"cancel\">Annuler l'assistant</button></div>";
  }

  function rRun() {
    const dur = App.state.project.duration || video.duration || 0;
    const r = AI.refs();
    const t0 = $("ai-t0").value, t1 = $("ai-t1").value, fpsv = $("ai-fps").value;
    return queueHeader() + progressDots() + "<h3>3. Lancer l'analyse</h3>" + chips() +
      "<div class=\"wiz-grid\"><label>De (mm:ss)<input data-set=\"t0\" type=\"text\" value=\"" + esc(t0) + "\" pattern=\"[0-9]{1,3}:[0-5][0-9]\"></label><label>À (mm:ss)<input data-set=\"t1\" type=\"text\" value=\"" + esc(t1) + "\" pattern=\"[0-9]{1,3}:[0-5][0-9]\"></label>" +
      "<label>Détail (ballon, joueurs lointains)<select data-set=\"tiles\"><option value=\"1\"" + ($("ai-tiles").value === "1" ? " selected" : "") + ">Standard</option><option value=\"2\"" + ($("ai-tiles").value === "2" ? " selected" : "") + ">Renforcé (2× plus lent)</option><option value=\"3\"" + ($("ai-tiles").value === "3" ? " selected" : "") + ">Zoom automatique (le plus précis)</option></select></label><label>Précision<select data-set=\"fps\"><option value=\"2\"" + (fpsv === "2" ? " selected" : "") + ">Rapide</option><option value=\"3\"" + (fpsv === "3" ? " selected" : "") + ">Équilibrée</option><option value=\"5\"" + (fpsv === "5" ? " selected" : "") + ">Fine (plus lent)</option></select></label></div>" +
      "<p class=\"muted\" id=\"wiz-est\">" + esc($("ai-est").textContent || "") + "</p>" +
      (r.A && r.B ? "" : "<p class=\"wiz-err\">Il manque « Mon équipe » ou « Adversaires ».</p>") +
      (W.running ? "<div class=\"progress\"><i id=\"wiz-bar\" style=\"width:" + Math.round(W.progress * 100) + "%\"></i></div><p id=\"wiz-pmsg\" class=\"muted\">" + esc(W.msg) + "</p><div class=\"wiz-btns\"><button data-act=\"stopRun\">Arrêter</button></div>"
        : "<div class=\"wiz-btns\"><button class=\"primary big\" data-act=\"run\"" + (dur ? "" : " disabled") + ">▶ Lancer l'analyse</button><button class=\"ghost\" data-act=\"cancel\">Annuler l'assistant</button></div>" + (W.msg ? "<p class=\"wiz-err\">" + esc(W.msg) + "</p>" : ""));
  }

  function resultsList() {
    return "<h4>Analyses enregistrées</h4><ul class=\"wiz-res\">" + W.results.map((r, i) => "<li><span class=\"grow\">" + esc(r.name) + "</span><button data-act=\"openRes\" data-i=\"" + i + "\">Ouvrir</button></li>").join("") + "</ul>";
  }

  function rDone() {
    const more = W.idx < W.queue.length - 1;
    const a = AI.ai(), n = (a.suggestedEvents || []).length;
    return queueHeader() + progressDots() + "<h3>✔ Analyse terminée</h3><p>" + esc(W.msg) + "</p>" +
      (W.acceptedCount && !n ? "<p class=\"wiz-ok\">✔ " + W.acceptedCount + " erreur(s) ajoutée(s) au rapport et aux corrections animées.</p>" : "") +
      (n ? "<div class=\"wiz-accept\"><p><b>" + n + " erreur(s) détectée(s) par l'IA</b> attendent votre validation. Tant qu'elles ne sont pas acceptées, le rapport et les corrections restent vides.</p><div class=\"wiz-btns\"><button class=\"primary big\" data-act=\"acceptAll\">✔ Accepter les " + n + " erreurs suggérées</button><button data-act=\"reviewSugg\">Les examiner une par une</button></div></div>" : (W.acceptedCount ? "" : "<p class=\"muted\">Aucune erreur suggérée par l'IA sur cette analyse.</p>")) +
      "<p class=\"muted\">Que voulez-vous faire maintenant ?</p>" +
      "<div class=\"wiz-after\">" +
      "<button data-act=\"seeVideo\">👁 Voir les joueurs sur la vidéo</button>" +
      "<button data-act=\"seeTop\">🧭 Vue de dessus</button>" +
      "<button data-act=\"seeReport\">📋 Rapport &amp; solutions</button>" +
      "<button data-act=\"seeAnim\">🎬 Corrections animées</button>" +
      "<button data-act=\"fixTeams\">🎨 Corriger les équipes (recommencer les silhouettes)</button>" +
      "<button data-act=\"saveAs\">💾 Enregistrer le projet…</button></div>" +
      (more ? "<div class=\"wiz-btns\"><button class=\"primary big\" data-act=\"next\">Vidéo suivante ▶ (" + (W.idx + 2) + " / " + W.queue.length + ")</button></div>" : "") +
      "<div class=\"wiz-btns\"><button class=\"ghost\" data-act=\"finish\">Terminer l'assistant</button></div>" +
      (W.results.length ? resultsList() : "");
  }

  /* ---------- actions ---------- */
  const ACTIONS = {
    async start() {
      const pb = document.querySelector("#seg button[data-pane=ai]"); if (pb) pb.click();
      if (!api || !api.pickVideos) { App.toast("L'assistant est disponible dans l'application installée.", true); return; }
      const r = await api.pickVideos();
      if (!r || r.canceled) return;
      const ok = (r.videos || []).filter((v) => !v.error);
      (r.videos || []).filter((v) => v.error).forEach((v) => App.toast(v.error, true));
      if (!ok.length) return;
      W.queue = ok; W.idx = 0; W.results = []; W.shared = null; W.same = false;
      if (ok.length > 1) setStep("choose"); else ACTIONS.begin();
    },
    async useCurrent() {
      const p = App.state.project;
      if (!p.videoPath) return;
      W.queue = [{ path: p.videoPath, name: p.videoName || "vidéo", current: true }]; W.idx = 0; W.results = []; W.shared = null; W.same = false;
      await openVideo(0);
    },
    async begin() {
      const sel = root.querySelector("input[name=wsame]:checked");
      if (sel) W.same = sel.value === "1";
      await openVideo(0);
    },
    async retryGoal() { await prepareFrame(); },
    manualMode() { const T = W.T; if (T) T.cancel = true; W.T = Object.assign(T || {}, { phase: "manual" }); AI.setPointer(null); AI.clearPoints(); W.lmIdx = 0; W.terrainT = null; W.msg = ""; render(); beginLandmark(); AI.redraw(); },
    async autoMode() { AI.cancelPlacing(); AI.clearPoints(); await startTerrain(); },
    pickColor(btn) { const T = W.T; T.colorKey = btn.dataset.key; buildRidge(); T.phase = "clicks"; render(); AI.redraw(); },
    changeColor() { W.T.phase = "color"; render(); AI.redraw(); },
    skipTarget() { const n = nextTarget(); if (n) W.T.skipped.add(n.key); W.T.msg = ""; render(); AI.redraw(); },
    undoClick() { const T = W.T; T.clicks.pop(); T.msg = ""; solveNow(); render(); AI.redraw(); },
    async otherGoal() {
      const T = W.T;
      if (T.results && T.results.length > 1) { T.resultIdx = (T.resultIdx + 1) % T.results.length; await useResult(T.resultIdx); }
      else { T.phase = "nogoal"; T.msg = "Avancez la vidéo jusqu'à une autre image où le but est visible, puis cliquez sur « Chercher le but »."; render(); AI.redraw(); }
    },
    validateTerrain(btn) { finishTerrain(btn.dataset.side); },
    skipLm() {
      AI.cancelPlacing();
      W.lmIdx = nextLandmark(W.lmIdx + 1); W.msg = ""; render(); beginLandmark();
    },
    undoLm() {
      const pts = AI.getPoints(); if (!pts.length) return;
      const last = pts[pts.length - 1];
      AI.removePoint(last.id);
      const i = LANDMARK_ORDER.indexOf(last.id); if (i >= 0) W.lmIdx = i;
      W.msg = ""; render(); beginLandmark();
    },
    calOk() {
      if (AI.validateCalibration()) { AI.cancelPlacing(); W.T = null; W.same && W.shared && W.shared.kits ? enterRun() : enterPlayers(); }
      else { W.msg = $("ai-calib-msg").textContent; render(); }
    },
    async detect() { await detectPlayers(); },
    async redetect() { W.det = null; W.hover = -1; W.addMode = false; AI.setPointer(null); render(); AI.redraw(); },
    addMode() { W.addMode = !W.addMode; render(); },
    validateCat() { validateCategory(); },
    skipCat() { advanceCategory(); },
    async run() { await runNow(); },
    stopRun() { $("ai-cancel").click(); },
    seeVideo() { AI.toggle("ov-boxes", true); AI.toggle("ov-sil", true); AI.toggle("ov-court", false); App.showTab("analyse"); video.scrollIntoView({ block: "center" }); },
    seeTop() { App.showTab("analyse"); const m = $("minimap-box"); if (m) m.scrollIntoView({ block: "center" }); },
    seeReport() { App.showTab("rapport"); },
    seeAnim() { App.showTab("corrections"); },
    fixTeams() {
      const a = AI.ai(); a.kits = {}; AI.renderKits(); W.catIdx = 0; W.det = null; enterPlayers();
    },
    acceptAll() {
      W.acceptedCount = (AI.ai().suggestedEvents || []).length;
      const b = $("ai-accept-all"); if (b) b.click();
      W.msg = $("ai-run-msg").textContent;
      App.toast("Erreurs acceptées : elles apparaissent maintenant dans le rapport et les corrections animées.");
      setTimeout(() => { render(); }, 600);
    },
    reviewSugg() { const e = $("ai-sugg"); if (e) e.scrollIntoView({ block: "center" }); },
    saveAs() { App.saveProject(true); },
    async next() { await openVideo(W.idx + 1); },
    finish() { W.queue = []; W.idx = 0; setStep("idle"); },
    cancel() { if (W.T) W.T.cancel = true; W.T = null; if (W.running) $("ai-cancel").click(); AI.cancelPlacing(); AI.clearPoints(); W.det = null; AI.setPointer(null); W.queue = []; W.idx = 0; W.running = false; setStep("idle"); },
    async openRes(btn) {
      const r = W.results[Number(btn.dataset.i)];
      if (!r || !api) return;
      const x = await api.readProject(r.path);
      if (x.error) { App.toast(x.error, true); return; }
      W.internalLoad++;
      try { await App.loadProject(x.project, x.path); } finally { W.internalLoad--; }
    }
  };

  function nextLandmark(from) {
    const placed = new Set(AI.getPoints().map((p) => p.id));
    let i = from;
    while (i < LANDMARK_ORDER.length && placed.has(LANDMARK_ORDER[i])) i++;
    return i;
  }
  function beginLandmark() {
    const id = LANDMARK_ORDER[W.lmIdx];
    if (id && W.step === "terrain") AI.beginPlacing(id);
  }

  /* ---------- repérage assisté du terrain ---------- */
  function seekVideo(t) {
    return new Promise((resolve) => {
      const target = Math.max(0, Math.min((video.duration || 0) - 0.05, t));
      if (Math.abs(video.currentTime - target) < 0.02 && !video.seeking) return resolve();
      const done = () => { clearTimeout(tm); video.removeEventListener("seeked", done); resolve(); };
      const tm = setTimeout(done, 8000);
      video.addEventListener("seeked", done);
      video.currentTime = target;
    });
  }
  const tick = () => new Promise((r) => setTimeout(r, 15));

  function nextTarget() {
    const T = W.T;
    if (!T) return null;
    return TARGETS.find((x) => !T.clicks.some((c) => c.key === x.key) && !T.skipped.has(x.key)) || null;
  }

  async function startTerrain() {
    if (W.T) W.T.cancel = true;
    W.T = { phase: "scan", text: "", msg: "", clicks: [], skipped: new Set(), colors: [], colorKey: null, cancel: false, busy: true, results: [], resultIdx: 0, pose: null, work: null, goal: null, frame: null };
    const T = W.T;
    AI.clearPoints(); AI.setPointer(terrainPointer);
    setStep("terrain");
    try {
      const dur = video.duration || 0, n = 10;
      const fr = [0.02, 0.06, 0.11, 0.17, 0.24, 0.32, 0.42, 0.53, 0.65, 0.8];
      for (let i = 0; i < n; i++) {
        if (T.cancel) return;
        T.text = "Recherche d'un but dans la vidéo… (" + (i + 1) + " / " + n + ")"; render();
        await tick();
        await seekVideo(dur * fr[i]);
        const g = AI.grabSam(), wk = CF.prepare(g.img, 640), goal = GL.detect(wk).goals[0];
        if (goal) T.results.push({ t: g.t, h: Math.min(goal.left.v1 - goal.left.v0, goal.right.v1 - goal.right.v0) });
      }
    } catch (e) { T.msg = "Recherche impossible : " + e.message; }
    if (T.cancel) return;
    T.busy = false;
    if (!T.results.length) { T.phase = "nogoal"; T.msg = ""; await seekVideo(0); render(); AI.redraw(); return; }
    // on préfère le premier instant où le but est bien visible (l'analyse commence au repérage du terrain)
    const best = Math.max(...T.results.map((r) => r.h));
    T.results.sort((a, b) => a.t - b.t);
    const first = T.results.findIndex((r) => r.h >= best * 0.7);
    await useResult(first < 0 ? 0 : first);
  }

  async function useResult(i) {
    const T = W.T, r = T.results[i];
    T.resultIdx = i; T.busy = true;
    await seekVideo(r.t);
    T.busy = false;
    await prepareFrame();
  }

  /* Analyse l'image affichée : but, couleurs de lignes. */
  async function prepareFrame() {
    const T = W.T;
    if (!T || !App.isVideoReady()) return false;
    T.busy = true; video.pause();
    const g = AI.grabSam(), wk = CF.prepare(g.img, 640), goal = GL.detect(wk).goals[0] || null;
    T.frame = { t: g.t, w: g.w, h: g.h, k: g.k }; T.work = wk; T.goal = goal; T.clicks = []; T.skipped = new Set(); T.pose = null; T.msg = "";
    if (!goal) { T.phase = "nogoal"; T.msg = "Aucun but repéré sur cette image."; T.busy = false; render(); AI.redraw(); return false; }
    T.sep = Math.hypot(goal.right.u - goal.left.u, goal.right.v1 - goal.left.v1);
    T.colors = CF.colorCandidates(wk);
    if (T.colors.length > 1) { T.phase = "color"; T.colorKey = null; T.rm = null; T.maskCanvas = null; }
    else { T.colorKey = T.colors[0] ? T.colors[0].key : null; buildRidge(); T.phase = "clicks"; }
    T.busy = false; render(); AI.redraw();
    return true;
  }

  function buildRidge() {
    const T = W.T;
    T.rm = T.colorKey ? CF.ridgeMap(T.work, T.colorKey) : null;
    T.maskCanvas = null;
    if (T.rm) {
      const c = document.createElement("canvas"); c.width = T.rm.w; c.height = T.rm.h;
      const ctx = c.getContext("2d"), im = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < T.rm.mask.length; i++) if (T.rm.mask[i]) { im.data[i * 4] = 255; im.data[i * 4 + 1] = 0; im.data[i * 4 + 2] = 220; im.data[i * 4 + 3] = 150; }
      ctx.putImageData(im, 0, 0);
      T.maskCanvas = c;
    }
  }

  function solveNow() {
    const T = W.T, a = AI.ai();
    if (!T.clicks.length) { T.pose = null; return; }
    const extras = T.clicks.map((c) => ({ x: c.x, y: a.W / 2 + c.dy, u: c.u, v: c.v }));
    const r = CF.poseFromGoal(T.goal, T.work.w, T.work.h, a.L, a.W, false, [], extras);
    T.pose = r.pose; T.err = r.err;
    T.msg = r.err > 6 ? "Les repères ne sont pas cohérents entre eux (écart " + r.err.toFixed(0) + " px) : annulez le dernier clic ou cliquez plus précisément sur la ligne." : "";
  }

  function onTerrainClick(ix, iy, ok) {
    const T = W.T;
    if (!ok || !T || T.phase !== "clicks" || T.busy) return;
    const tg = nextTarget();
    if (!tg) return;
    const kk = T.work.w / AI.videoSize().w;
    let u = ix * kk, v = iy * kk;
    if (v < (T.goal.left.v1 + T.goal.right.v1) / 2 - 3) { T.msg = "Cliquez sur une ligne du sol, devant le but (plus bas que le pied des poteaux)."; render(); return; }
    if (T.rm) { const sn = CF.snapToRidge(T.rm, u, v, 8); u = sn.u; v = sn.v; }
    T.clicks.push({ key: tg.key, dy: tg.dy, x: tg.x, u, v });
    T.msg = "";
    solveNow();
    render(); AI.redraw();
  }
  const terrainPointer = { click: onTerrainClick };

  function finishTerrain(side) {
    const T = W.T;
    if (!T || !T.pose) return;
    try {
      const vs = AI.videoSize(), a = AI.ai();
      let cal = CF.calibrationFromPose(T.pose, T.work.w, T.work.h, vs.w, vs.h, a.L, a.W, T.err, T.sep);
      if (side === "att") cal = CF.rotateCalibration(cal, a.L, a.W, vs.w, vs.h);
      AI.setCalibration(cal, T.frame.t);
      AI.setCamera("mobile"); AI.setDirection(1);
    } catch (e) { T.msg = "Repérage impossible : " + e.message; render(); return; }
    AI.setPointer(null);
    W.T = null;
    if (W.same && W.shared && W.shared.kits) enterRun(); else enterPlayers();
  }

  AI.addLayer((ctx, h) => {
    const T = W.T;
    if (W.step !== "terrain" || !T || !T.work || T.phase === "manual" || T.phase === "scan") return;
    const kk = AI.videoSize().w / T.work.w, V = (u, v) => h.toView(u * kk, v * kk);
    if (T.maskCanvas && (T.phase === "clicks")) {
      const o = V(0, 0), e = V(T.work.w, T.work.h);
      ctx.drawImage(T.maskCanvas, o[0], o[1], e[0] - o[0], e[1] - o[1]);
    }
    if (T.goal) {
      ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 3;
      [T.goal.left, T.goal.right].forEach((p) => { const a = V(p.u, p.v0), b = V(p.u, p.v1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      const a = V(T.goal.left.u, T.goal.left.v0), b = V(T.goal.right.u, T.goal.right.v0);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = "#22c55e"; ctx.font = "600 12px 'Segoe UI',Arial,sans-serif"; ctx.fillText("But", a[0] + 4, a[1] - 6);
    }
    if (T.phase !== "clicks") return;
    const aiState = AI.ai();
    if (T.pose) {
      const B = CF.cameraBasis(T.pose), f = CF.focalPx(T.work.w, T.pose[5]);
      CF.modelPoints(aiState.L, aiState.W, { step: 0.25 }).forEach((p) => {
        const q = CF.project(B, f, T.work.w, T.work.h, p[0], p[1], 0);
        if (!q || q.u < 0 || q.v < 0 || q.u > T.work.w || q.v > T.work.h) return;
        const v = V(q.u, q.v);
        ctx.fillStyle = p[2] >= 1 ? "#22d3ee" : "#facc15"; ctx.fillRect(v[0] - 1.2, v[1] - 1.2, 2.4, 2.4);
      });
    } else if (T.goal) {
      // guide : verticale sous le milieu du but
      const mu = (T.goal.left.u + T.goal.right.u) / 2, mv = (T.goal.left.v1 + T.goal.right.v1) / 2, a = V(mu, mv), b = V(mu, Math.min(T.work.h - 2, mv + T.sep * 3.2));
      ctx.setLineDash([6, 5]); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
    }
    T.clicks.forEach((c) => {
      const v = V(c.u, c.v);
      ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(v[0] - 8, v[1]); ctx.lineTo(v[0] + 8, v[1]); ctx.moveTo(v[0], v[1] - 8); ctx.lineTo(v[0], v[1] + 8); ctx.stroke();
    });
    const nx = nextTarget();
    if (nx && T.pose) {
      const B = CF.cameraBasis(T.pose), f = CF.focalPx(T.work.w, T.pose[5]), q = CF.project(B, f, T.work.w, T.work.h, nx.x, aiState.W / 2 + nx.dy, 0);
      if (q) { const v = V(q.u, q.v); ctx.setLineDash([4, 3]); ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(v[0], v[1], 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.fillStyle = "rgba(11,18,32,.85)"; ctx.fillRect(8, 8, 520, 26);
    ctx.fillStyle = "#fff"; ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
    ctx.fillText(nx ? "Cliquez sur " + nx.label.replace(/ \(.*/, "").slice(0, 70) : "Repères placés : vérifiez le tracé", 16, 26);
  });

  async function openVideo(i) {
    const v = W.queue[i];
    if (!v) { setStep("idle"); return; }
    W.idx = i;
    if (i === 0 && !v.current) {
      const p = App.state.project;
      if ((p.events.length || (p.ai && p.ai.calibrations && p.ai.calibrations.length)) && !confirm("Le projet en cours va être remplacé par cette nouvelle analyse (il reste conservé par la sauvegarde automatique). Continuer ?")) { setStep("idle"); return; }
    }
    W.busy = "Ouverture de « " + v.name + " »…"; setStep("loading");
    if (!v.current) {
      const proj = Object.assign(App.newProject(), { name: v.name.replace(/\.[^.]+$/, ""), videoPath: v.path, videoName: v.name });
      if (W.same && W.shared) {
        proj.teamName = W.shared.teamName; proj.opponentName = W.shared.opponentName; proj.defaultSystem = W.shared.defaultSystem;
      }
      W.internalLoad++;
      try { await App.loadProject(proj, null); } finally { W.internalLoad--; }
    }
    const ok = await waitVideo(20000);
    W.busy = "";
    if (!ok) {
      App.toast("Impossible de lire « " + v.name + " ». Passage à la suivante.", true);
      if (i + 1 < W.queue.length) { await openVideo(i + 1); return; }
      setStep("idle"); return;
    }
    const a = AI.ai();
    if (W.same && W.shared) {
      a.kits = JSON.parse(JSON.stringify(W.shared.kits)); a.dir = W.shared.dir; a.camera = W.shared.camera; a.flip = W.shared.flip;
      AI.setDirection(a.dir); AI.setCamera(a.camera); AI.renderKits();
    }
    AI.setRange(0, video.duration || 0);
    W.catIdx = 0; W.det = null; W.hover = -1; W.addMode = false; W.lmIdx = 0; W.terrainT = null; W.progress = 0; W.running = false;
    AI.clearPoints();
    video.pause(); video.currentTime = 0;
    await startTerrain();
  }

  function enterPlayers() {
    W.catIdx = 0; W.det = null; W.hover = -1; W.addMode = false; AI.setPointer(pointerHandlers);
    // première catégorie déjà connue (cas d'une reprise) : on passe aux suivantes
    const r = AI.refs();
    while (W.catIdx < CATS.length && r[CATS[W.catIdx].key]) W.catIdx++;
    if (W.catIdx >= CATS.length) { enterRun(); return; }
    setStep("players");
  }

  function enterRun() {
    AI.setPointer(null); W.det = null;
    const dur = video.duration || 0, cal = AI.ai().calibrations[0];
    if (!AI.hasAnalysis()) AI.setRange(cal ? Math.max(0, Math.ceil(cal.t)) : 0, dur);
    if (!AI.hasAnalysis()) { $("ai-tiles").value = "3"; $("ai-tiles").dispatchEvent(new Event("change")); }
    AI.updateEstimate();
    setStep("run");
  }

  /* ---------- silhouettes ---------- */
  async function detectPlayers() {
    if (!App.isVideoReady()) { W.msg = "Vidéo non prête."; render(); return; }
    video.pause();
    W.busy = "Détection des joueurs…"; W.msg = ""; render();
    try {
      const fr = AI.grabSam();
      const persons = (await AI.detectPersons(fr.canvas)).filter((d) => (d.y2 - d.y1) >= 24 && (d.x2 - d.x1) >= 8).sort((a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1)).slice(0, 24);
      if (!persons.length) { W.busy = ""; W.msg = "Aucun joueur détecté sur cette image. Choisissez une image plus nette ou plus proche."; render(); return; }
      W.busy = "Découpe des silhouettes (quelques secondes)…"; render();
      const boxes = persons.map((d) => [d.x1, d.y1, d.x2, d.y2]);
      const res = await AI.segment({ imgId: fr.id, width: fr.w, height: fr.h, buffer: fr.img.data.buffer.slice(0), boxes });
      if (!res || res.error) throw new Error(res && res.error ? res.error : "réponse vide");
      const players = [];
      persons.forEach((d, i) => { const m = res.masks[i]; if (m && m.w && m.h && m.area > 30) players.push({ box: boxes[i], mask: normMask(m), cat: null, locked: false, cv: {} }); });
      if (!players.length) throw new Error("aucune silhouette exploitable");
      // les silhouettes déjà validées pour d'autres catégories ne sont pas reportées : nouvelle image, nouvelle sélection
      W.det = { frame: fr, players };
      W.busy = "";
    } catch (e) {
      W.busy = ""; W.det = null; W.msg = "Découpe impossible : " + e.message;
    }
    render(); AI.redraw();
  }

  function normMask(m) { return { x0: m.x0, y0: m.y0, w: m.w, h: m.h, area: m.area, data: m.data instanceof Uint8Array ? m.data : new Uint8Array(m.data) }; }

  function validateCategory() {
    const c = cur(), d = W.det; if (!d) return;
    const sel = d.players.filter((p) => p.cat === c.key && !p.locked);
    const feats = [];
    sel.forEach((p) => { const f = K.fromMask(d.frame.img, p.box, p.mask); if (f) feats.push(f); });
    if (!feats.length) { W.msg = "Silhouette trop petite pour lire la tenue : choisissez une image où le joueur est plus grand (bouton « Autre image »)."; render(); return; }
    const a = AI.ai();
    a.kits[c.key] = (a.kits[c.key] || []).concat(feats);
    sel.forEach((p) => { p.locked = true; });
    AI.renderKits(); App.changed();
    advanceCategory();
  }

  function advanceCategory() {
    W.catIdx++; W.msg = ""; W.addMode = false;
    const r = AI.refs();
    while (W.catIdx < CATS.length && r[CATS[W.catIdx].key]) W.catIdx++;
    if (W.catIdx >= CATS.length) { W.shared = W.shared || null; enterRun(); return; }
    render(); AI.redraw();
  }

  /* couche de dessin et souris sur la vidéo */
  function maskCanvas(p, color, alpha) {
    const key = color + alpha;
    if (p.cv[key]) return p.cv[key];
    const c = document.createElement("canvas");
    c.width = p.mask.w; c.height = p.mask.h;
    const ctx = c.getContext("2d"), img = ctx.createImageData(p.mask.w, p.mask.h);
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    for (let i = 0; i < p.mask.data.length; i++) if (p.mask.data[i]) { const o = i * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = Math.round(alpha * 255); }
    ctx.putImageData(img, 0, 0);
    p.cv[key] = c;
    return c;
  }

  AI.addLayer((ctx, h) => {
    if (W.step !== "players" || !W.det || !cur()) return;
    const d = W.det, k = 1 / d.frame.k, s = h.rect.s;
    d.players.forEach((p, i) => {
      const cat = CATS.find((c) => c.key === p.cat);
      const color = cat ? cat.color : "#ffffff";
      const alpha = cat ? (p.locked ? 0.45 : 0.6) : (i === W.hover ? 0.55 : 0.28);
      const cv = maskCanvas(p, color, alpha);
      const o = h.toView(p.mask.x0 * k, p.mask.y0 * k);
      ctx.drawImage(cv, o[0], o[1], p.mask.w * k * s, p.mask.h * k * s);
      if (cat || i === W.hover) {
        const a = h.toView(p.box[0] * k, p.box[1] * k), b = h.toView(p.box[2] * k, p.box[3] * k);
        ctx.strokeStyle = color; ctx.lineWidth = i === W.hover ? 2.5 : 1.5; ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        if (cat) {
          ctx.font = "600 12px 'Segoe UI',Arial,sans-serif";
          const tw = ctx.measureText(cat.title).width + 8;
          ctx.fillStyle = color; ctx.fillRect(a[0], a[1] - 16, tw, 16);
          ctx.fillStyle = "#fff"; ctx.fillText(cat.title, a[0] + 4, a[1] - 4);
        }
      }
    });
    if (W.drag) {
      const a = h.toView(W.drag.x0, W.drag.y0), b = h.toView(W.drag.x1, W.drag.y1);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
    }
    ctx.fillStyle = "rgba(11,18,32,.85)"; ctx.fillRect(8, 8, 520, 26);
    ctx.fillStyle = "#fff"; ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
    ctx.fillText(W.addMode ? "Tracez un rectangle autour du joueur" : "Cliquez sur la silhouette de : " + cur().who, 16, 26);
  });

  function hit(ix, iy) {
    const d = W.det; if (!d) return -1;
    const fx = ix * d.frame.k, fy = iy * d.frame.k;
    let best = -1, bestArea = Infinity;
    d.players.forEach((p, i) => {
      const m = p.mask, mx = Math.floor(fx - m.x0), my = Math.floor(fy - m.y0);
      if (mx >= 0 && my >= 0 && mx < m.w && my < m.h && m.data[my * m.w + mx] && m.area < bestArea) { best = i; bestArea = m.area; }
    });
    if (best >= 0) return best;
    d.players.forEach((p, i) => {
      const area = (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]);
      if (fx >= p.box[0] && fx <= p.box[2] && fy >= p.box[1] && fy <= p.box[3] && area < bestArea) { best = i; bestArea = area; }
    });
    return best;
  }

  const pointerHandlers = {
    move(ix, iy, ok) {
      if (W.step !== "players" || !W.det) return;
      if (W.drag) { W.drag.x1 = ix; W.drag.y1 = iy; AI.redraw(); return; }
      const h = ok && !W.addMode ? hit(ix, iy) : -1;
      if (h !== W.hover) { W.hover = h; AI.redraw(); }
    },
    down(ix, iy, ok) {
      if (W.step !== "players" || !W.det || !W.addMode || !ok) return;
      W.drag = { x0: ix, y0: iy, x1: ix, y1: iy };
    },
    async up(ix, iy) {
      if (!W.drag) return;
      const d = W.drag; W.drag = null; d.x1 = ix; d.y1 = iy;
      W.noClickUntil = Date.now() + 400; // le « clic » qui suit le relâchement ne doit pas basculer la silhouette qu'on vient d'ajouter
      const k = W.det.frame.k;
      const box = [Math.min(d.x0, d.x1) * k, Math.min(d.y0, d.y1) * k, Math.max(d.x0, d.x1) * k, Math.max(d.y0, d.y1) * k].map((v, i) => Math.max(0, Math.min(i % 2 ? W.det.frame.h : W.det.frame.w, v)));
      if (box[2] - box[0] < 10 || box[3] - box[1] < 20) { AI.redraw(); return; }
      W.busy = "Découpe du joueur…"; render();
      try {
        const fr = W.det.frame;
        let res = await AI.segment({ imgId: fr.id, width: fr.w, height: fr.h, boxes: [box] });
        if (res && res.error) res = await AI.segment({ imgId: fr.id, width: fr.w, height: fr.h, buffer: fr.img.data.buffer.slice(0), boxes: [box] });
        if (!res || res.error || !res.masks[0] || !res.masks[0].area) throw new Error(res && res.error ? res.error : "aucune silhouette");
        W.det.players.push({ box, mask: normMask(res.masks[0]), cat: cur().key, locked: false, cv: {} });
        W.addMode = false; W.msg = "";
      } catch (e) { W.msg = "Découpe impossible : " + e.message; }
      W.busy = ""; render(); AI.redraw();
    },
    click(ix, iy, ok) {
      if (W.step !== "players" || !W.det || W.addMode || !ok || Date.now() < (W.noClickUntil || 0)) return;
      const i = hit(ix, iy); if (i < 0) return;
      const p = W.det.players[i], c = cur();
      if (p.locked) { W.msg = "Cette silhouette est déjà validée pour « " + (CATS.find((x) => x.key === p.cat) || {}).title + " »."; render(); return; }
      p.cat = p.cat === c.key ? null : c.key; W.msg = "";
      render(); AI.redraw();
    }
  };

  /* ---------- analyse ---------- */
  async function runNow() {
    const a = AI.ai(), r = AI.refs();
    if (!r.A || !r.B) { W.msg = "Il manque « Mon équipe » ou « Adversaires »."; render(); return; }
    const t0 = App.parseTime($("ai-t0").value), t1 = App.parseTime($("ai-t1").value);
    if (t0 == null || t1 == null || t1 <= t0) { W.msg = "Plage de temps invalide."; render(); return; }
    W.running = true; W.progress = 0; W.msg = "Chargement du modèle de détection…"; render();
    const ok = await AI.runAnalysis({ noConfirm: true });
    W.running = false;
    if (!ok) { W.msg = $("ai-run-msg").textContent || "L'analyse n'a produit aucun résultat."; render(); return; }
    W.msg = $("ai-run-msg").textContent;
    W.shared = { kits: JSON.parse(JSON.stringify(a.kits)), dir: a.dir, camera: a.camera, flip: a.flip, teamName: App.state.project.teamName, opponentName: App.state.project.opponentName, defaultSystem: App.state.project.defaultSystem };
    await saveCurrent();
    setStep("done"); W.msg = $("ai-run-msg").textContent; render();
  }

  async function saveCurrent() {
    if (!api || !api.autoSaveProject) return;
    try {
      const r = await api.autoSaveProject(App.state.project);
      if (r && r.path) {
        App.state.projectPath = r.path;
        const name = App.state.project.videoName || App.state.project.name || "analyse";
        W.results = W.results.filter((x) => x.path !== r.path).concat([{ name, path: r.path }]);
      } else if (r && r.error) App.toast("Enregistrement automatique impossible : " + r.error, true);
    } catch (e) { App.toast("Enregistrement automatique impossible : " + e.message, true); }
  }

  AI.hooks.progress = (f, msg) => {
    W.progress = f; W.msg = msg;
    const bar = $("wiz-bar"), m = $("wiz-pmsg");
    if (bar) bar.style.width = Math.round(f * 100) + "%";
    if (m) m.textContent = msg;
  };
  AI.hooks.pointPlaced = (id) => {
    if (W.step !== "terrain") return;
    if (W.terrainT == null) W.terrainT = video.currentTime;
    const i = LANDMARK_ORDER.indexOf(id);
    W.lmIdx = nextLandmark(i >= 0 ? i + 1 : W.lmIdx + 1);
    W.msg = ""; render(); beginLandmark();
  };

  /* ---------- liaison ---------- */
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const fn = ACTIONS[b.dataset.act];
    if (fn) Promise.resolve(fn(b)).catch((err) => App.toast("Erreur : " + err.message, true));
  });
  root.addEventListener("change", (e) => {
    const t = e.target, k = t.dataset && t.dataset.set;
    if (!k) return;
    if (k === "dir") AI.setDirection(Number(t.value));
    else if (k === "camera") AI.setCamera(t.value);
    else if (k === "t0") { $("ai-t0").value = t.value; $("ai-t0").dispatchEvent(new Event("change")); setTimeout(() => { const el = $("wiz-est"); if (el) el.textContent = $("ai-est").textContent; }, 0); }
    else if (k === "t1") { $("ai-t1").value = t.value; $("ai-t1").dispatchEvent(new Event("change")); setTimeout(() => { const el = $("wiz-est"); if (el) el.textContent = $("ai-est").textContent; }, 0); }
    else if (k === "tiles") { $("ai-tiles").value = t.value; $("ai-tiles").dispatchEvent(new Event("change")); AI.updateEstimate(); const el = $("wiz-est"); if (el) el.textContent = $("ai-est").textContent; }
    else if (k === "fps") { $("ai-fps").value = t.value; $("ai-fps").dispatchEvent(new Event("change")); AI.updateEstimate(); const el = $("wiz-est"); if (el) el.textContent = $("ai-est").textContent; }
  });
  // changer d'image pendant la pose des repères invalide les repères déjà posés
  video.addEventListener("seeked", () => {
    if (W.step === "terrain" && W.T && W.T.phase !== "manual") {
      const T = W.T;
      if (!T.busy && T.frame && (T.phase === "clicks" || T.phase === "color") && Math.abs(video.currentTime - T.frame.t) > 0.05) {
        T.msg = "Vous avez déplacé la vidéo : je cherche à nouveau le but sur cette image.";
        prepareFrame().then(() => { if (W.T && !W.T.goal) { W.T.msg = "Aucun but repéré sur cette image."; render(); } });
      }
      return;
    }
    if (W.step === "terrain" && AI.getPoints().length && W.terrainT != null && Math.abs(video.currentTime - W.terrainT) > 0.05) {
      AI.clearPoints(); W.lmIdx = 0; W.terrainT = null; W.msg = "Vous avez déplacé la vidéo : les repères ont été effacés, recommencez sur cette image."; render(); beginLandmark();
    } else if (W.step === "players" && W.det && Math.abs(video.currentTime - W.det.frame.t) > 0.05) {
      // l'image découpée n'est plus celle affichée : les silhouettes ne s'y superposent plus
      W.det = null; W.hover = -1; render(); AI.redraw();
    }
  });

  /* « Nouveau » / « Ouvrir » : le projet change hors de l'assistant -> on repart de l'accueil. */
  function resetWizard() {
    if (W.T) W.T.cancel = true;
    if (W.running) { const c = $("ai-cancel"); if (c) c.click(); }
    AI.cancelPlacing(); AI.clearPoints(); AI.setPointer(null);
    W.T = null; W.det = null; W.queue = []; W.idx = 0; W.running = false; W.same = false; W.shared = null; W.acceptedCount = 0; W.msg = ""; W.busy = ""; W.addMode = false; W.hover = -1;
    W.step = "idle"; render(); AI.redraw();
  }
  const prevOnLoad = App.hooks.onLoad;
  App.hooks.onLoad = function () { prevOnLoad.apply(this, arguments); if (!W.internalLoad) resetWizard(); };

  window.FSWiz = { state: W, actions: ACTIONS, render };
  render();
})();
