/* Assistant d'analyse : un seul bouton « Analyser une vidéo », puis l'IA guide pas à pas.
   Étapes : choix des vidéos → terrain → silhouettes (mon équipe, adversaires, gardiens, arbitre) → analyse → résultats. */
(function () {
  "use strict";
  const App = window.FSApp, AI = window.FSAI, K = window.FutsalKit, HG = window.FutsalHomography;
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
    progress: 0, running: false
  };
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
      "<div class=\"wiz-btns\"><button class=\"primary\" data-act=\"calOk\"" + (placed >= 4 ? "" : " disabled") + ">Valider le terrain ✓</button><button class=\"ghost\" data-act=\"cancel\">Annuler l'assistant</button></div>";
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
      "<label>Précision<select data-set=\"fps\"><option value=\"2\"" + (fpsv === "2" ? " selected" : "") + ">Rapide</option><option value=\"3\"" + (fpsv === "3" ? " selected" : "") + ">Équilibrée</option><option value=\"5\"" + (fpsv === "5" ? " selected" : "") + ">Fine (plus lent)</option></select></label></div>" +
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
      "<p class=\"muted\">" + n + " erreur(s) suggérée(s) à valider dans « 4. Résultats » plus bas. Que voulez-vous faire maintenant ?</p>" +
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
      if (AI.validateCalibration()) { AI.cancelPlacing(); W.same && W.shared && W.shared.kits ? enterRun() : enterPlayers(); }
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
    saveAs() { App.saveProject(true); },
    async next() { await openVideo(W.idx + 1); },
    finish() { W.queue = []; W.idx = 0; setStep("idle"); },
    cancel() { if (W.running) $("ai-cancel").click(); AI.cancelPlacing(); AI.clearPoints(); W.det = null; AI.setPointer(null); W.queue = []; W.idx = 0; W.running = false; setStep("idle"); },
    async openRes(btn) {
      const r = W.results[Number(btn.dataset.i)];
      if (!r || !api) return;
      const x = await api.readProject(r.path);
      if (x.error) { App.toast(x.error, true); return; }
      await App.loadProject(x.project, x.path);
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
      await App.loadProject(proj, null);
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
    setStep("terrain");
    beginLandmark();
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
    const dur = video.duration || 0;
    if (!AI.hasAnalysis()) AI.setRange(0, dur);
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
    else if (k === "fps") { $("ai-fps").value = t.value; $("ai-fps").dispatchEvent(new Event("change")); AI.updateEstimate(); const el = $("wiz-est"); if (el) el.textContent = $("ai-est").textContent; }
  });
  // changer d'image pendant la pose des repères invalide les repères déjà posés
  video.addEventListener("seeked", () => {
    if (W.step === "terrain" && AI.getPoints().length && W.terrainT != null && Math.abs(video.currentTime - W.terrainT) > 0.05) {
      AI.clearPoints(); W.lmIdx = 0; W.terrainT = null; W.msg = "Vous avez déplacé la vidéo : les repères ont été effacés, recommencez sur cette image."; render(); beginLandmark();
    } else if (W.step === "players" && W.det && Math.abs(video.currentTime - W.det.frame.t) > 0.05) {
      // l'image découpée n'est plus celle affichée : les silhouettes ne s'y superposent plus
      W.det = null; W.hover = -1; render(); AI.redraw();
    }
  });

  window.FSWiz = { state: W, actions: ACTIONS, render };
  render();
})();
