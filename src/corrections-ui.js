/* Onglet « Corrections animées » : lecture des animations en vue de dessus et export vidéo à partager. */
(function () {
  "use strict";
  const App = window.FSApp, KB = window.FutsalKB, A = window.FutsalAnalyzer, SC = window.FutsalScenes, PL = window.FutsalPlayer;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc, api = App.api, state = App.state;
  const SEV = { CRITIQUE: "Critique", MAJEUR: "Majeur", MINEUR: "Mineur" };

  let player = null;
  let current = null;       // { kind, id, title, desc, seq }
  let exporting = false;
  let built = false;
  const pip = { events: [], idx: 0, t0: 0, t1: 0 };

  function seqFor(kind, id) {
    const scene = kind === "error" ? SC.forError(id) : SC.forDrill(id);
    return scene ? SC.buildSequence([{ type: "scene", scene }]) : null;
  }

  function describe(kind, id) {
    if (kind === "error") {
      const e = KB.ERRORS.find((x) => x.id === id);
      return e ? { title: e.label, desc: e.description + " — Solution : " + e.solutions[0] } : null;
    }
    const d = KB.DRILLS.find((x) => x.id === id);
    return d ? { title: d.name, desc: d.goal + " — " + d.description + " (" + d.duration + " min, " + d.players + ")" } : null;
  }

  function item(kind, id, title, sub) {
    const b = document.createElement("button");
    b.className = "item"; b.dataset.kind = kind; b.dataset.id = id;
    b.innerHTML = esc(title) + (sub ? "<small>" + esc(sub) + "</small>" : "");
    b.addEventListener("click", () => select(kind, id));
    return b;
  }

  function buildLists() {
    const mine = $("corr-mine");
    mine.innerHTML = "";
    let analysis = null;
    try { analysis = A.analyze(state.project); } catch (_e) { analysis = null; }
    const h = document.createElement("h3");
    h.textContent = "Mes erreurs détectées";
    mine.appendChild(h);
    if (analysis && analysis.findings.length) {
      analysis.findings.forEach((f) => mine.appendChild(item("error", f.type, f.label, f.count + " fois · " + SEV[f.severity])));
    } else {
      const pending = state.project.ai && state.project.ai.suggestedEvents ? state.project.ai.suggestedEvents.length : 0;
      const p = document.createElement("p"); p.className = "muted"; p.style.padding = "4px 8px";
      p.textContent = pending ? pending + " erreur(s) détectée(s) par l'IA attendent votre validation : dans « Analyse vidéo », cliquez sur « Accepter les erreurs suggérées » pour les voir ici avec leur extrait de vidéo." : "Aucune erreur marquée pour ce match : marquez des situations ou lancez l'analyse IA.";
      mine.appendChild(p);
    }
    const errs = $("corr-errors"); errs.innerHTML = "";
    Object.keys(KB.PHASES).forEach((ph) => {
      const hh = document.createElement("h3"); hh.textContent = KB.PHASES[ph].label; errs.appendChild(hh);
      KB.ERRORS.filter((e) => e.phase === ph).forEach((e) => errs.appendChild(item("error", e.id, e.label)));
    });
    const dr = $("corr-drills"); dr.innerHTML = "";
    KB.DRILLS.forEach((d) => dr.appendChild(item("drill", d.id, d.name, d.duration + " min")));
    built = true;
    markActive();
  }

  function markActive() {
    document.querySelectorAll(".corr-list button.item").forEach((b) => b.classList.toggle("active", !!current && b.dataset.kind === current.kind && b.dataset.id === current.id));
  }

  function ensurePlayer() {
    if (player) return;
    player = new PL.ScenePlayer($("corr-canvas"), {
      onTime: (T, dur, playing) => {
        $("cp-time").textContent = App.fmt(T) + " / " + App.fmt(dur);
        if (document.activeElement !== $("cp-seek")) $("cp-seek").value = dur ? Math.round((T / dur) * 1000) : 0;
        $("cp-play").textContent = playing ? "⏸ Pause" : "▶ Lecture";
        syncPip(playing);
      },
      onEnd: () => { $("cp-play").textContent = "▶ Lecture"; }
    });
  }

  /* ---------- extrait de la vraie vidéo, en incrustation ---------- */
  function setupPip(kind, id) {
    const box = $("corr-pip"), v = $("corr-pip-video"), url = App.getVideoUrl();
    pip.events = kind === "error" && url ? state.project.events.filter((e) => e.type === id).sort((a, b) => a.t - b.t) : [];
    pip.idx = 0;
    if (!pip.events.length) { box.hidden = true; v.pause(); return; }
    box.hidden = false;
    if (v.getAttribute("data-src") !== url) { v.setAttribute("data-src", url); v.src = url; }
    showPipEvent();
  }
  function showPipEvent() {
    const v = $("corr-pip-video"), e = pip.events[pip.idx], dur = state.project.duration || v.duration || 1e9;
    pip.t0 = Math.max(0, e.t - 4); pip.t1 = Math.min(dur, e.t + 4);
    $("pip-label").textContent = "Votre match · " + App.fmt(e.t) + " (" + (pip.idx + 1) + "/" + pip.events.length + ")";
    $("pip-prev").disabled = $("pip-next").disabled = pip.events.length < 2;
    const go = () => { try { v.currentTime = pip.t0; } catch (_e) { /* pas encore prête */ } };
    if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true });
    if (player && player.playing) v.play().catch(() => {}); else v.pause();
  }
  function syncPip(playing) {
    const v = $("corr-pip-video");
    if ($("corr-pip").hidden) return;
    if (playing && v.paused) v.play().catch(() => {});
    else if (!playing && !v.paused) v.pause();
  }

  function select(kind, id, autoplay) {
    const d = describe(kind, id), seq = seqFor(kind, id);
    if (!d || !seq) { App.toast("Animation indisponible.", true); return; }
    ensurePlayer();
    if (!current || current.kind !== kind || current.id !== id) real.catalog = false;   // nouvelle erreur : vraie vidéo d'abord
    current = { kind, id, title: d.title, desc: d.desc, seq };
    $("cp-desc").textContent = d.title + " — " + d.desc;
    real.events = realEvents(kind, id);
    real.idx = 0;
    if (real.events.length && !real.catalog) { player.setSequence(seq); showReal(); markActive(); return; }
    showScene();
    player.setSequence(seq);
    setupPip(kind, id);
    markActive();
    if (autoplay !== false) player.play();
  }

  /* ---------- correction animée sur la vraie vidéo ---------- */
  const real = { view: null, events: [], idx: 0, mode: "fixed", catalog: false };
  /* Occurrences confirmées de cette erreur dans le match, quand le projet a une analyse vidéo et la vidéo est chargée. */
  function realEvents(kind, id) {
    const a = state.project.ai;
    if (kind !== "error" || !window.FutsalRealView || !window.FutsalOverlay || !App.getVideoUrl() || !a || !Array.isArray(a.frames) || !a.frames.length) return [];
    return state.project.events.filter((e) => e.type === id && isFinite(Number(e.t))).sort((x, y) => x.t - y.t);
  }
  function analysisFrames() {
    const live = App.ai && App.ai.getFrames ? App.ai.getFrames() : null;
    return live && live.length ? live : window.FutsalPipeline.expandFrames(state.project.ai.frames);
  }
  function showScene() {
    if (real.view) real.view.close();
    $("corr-real").hidden = true; $("corr-canvas").hidden = false; $("cr-text").hidden = true;
    sceneControls().hidden = false;
    $("cr-bar").hidden = !(real.catalog && real.events.length);
    ["cr-fixed", "cr-seq", "cr-replay", "cr-prev", "cr-next", "cr-label", "cr-map-pos"].forEach((x) => { $(x).hidden = true; });
    $("cr-catalog").textContent = "Vraie vidéo";
  }
  /* Petite carte : coin choisi (ou masquée), mémorisé pour ce poste. */
  const MAP_POS = ["br", "bl", "tl", "tr", "off"];
  const MAP_LABEL = { br: "bas droite", bl: "bas gauche", tl: "haut gauche", tr: "haut droite", off: "masquée" };
  function mapPos() { try { const v = localStorage.getItem("fsal.corrMap"); return MAP_POS.includes(v) ? v : "br"; } catch (_e) { return "br"; } }
  function setMapPos(p) {
    const r = $("corr-real");
    MAP_POS.forEach((x) => r.classList.toggle("map-" + x, x === p));
    $("cr-map-pos").textContent = "Carte : " + MAP_LABEL[p];
    try { localStorage.setItem("fsal.corrMap", p); } catch (_e) { /* stockage indisponible */ }
  }
  function sceneControls() { return document.querySelector(".corr-main .corr-controls:not(#cr-bar)"); }
  function showReal() {
    if (!real.view) real.view = new window.FutsalRealView.RealView({ root: $("corr-real"), video: $("cr-video"), overlay: $("cr-overlay"), map: $("cr-map"), msg: $("cr-msg") });
    if (player) player.pause();
    $("corr-pip").hidden = true; $("corr-pip-video").pause();
    $("corr-canvas").hidden = true; $("corr-real").hidden = false; $("cr-bar").hidden = false; $("cr-text").hidden = false;
    sceneControls().hidden = true;
    ["cr-fixed", "cr-seq", "cr-replay", "cr-prev", "cr-next", "cr-label", "cr-map-pos"].forEach((x) => { $(x).hidden = false; });
    $("cr-catalog").textContent = "Animation du catalogue";
    openReal();
  }
  function openReal() {
    const e = real.events[real.idx], a = state.project.ai, err = KB.ERRORS.find((x) => x.id === e.type);
    $("cr-label").textContent = App.fmt(e.t) + " (" + (real.idx + 1) + "/" + real.events.length + ")";
    $("cr-prev").disabled = $("cr-next").disabled = real.events.length < 2;
    $("cr-fixed").classList.toggle("active", real.mode === "fixed"); $("cr-seq").classList.toggle("active", real.mode === "seq");
    const sol = err && err.solutions && err.solutions.length ? err.solutions[0] : "";
    $("cr-text").innerHTML = "<b class=\"err\">Erreur · " + esc(err ? err.label : e.type) + "</b> — " + esc(err ? err.description : "") +
      (e.note ? " <span class=\"muted\">(" + esc(e.note) + ")</span>" : "") +
      (sol ? "<br><b class=\"ok\">Correction conseillée</b> — " + esc(sol) + ". <span class=\"muted\">Conseil tiré du catalogue, à adapter à votre équipe : la position du joueur vert est indicative.</span>" : "");
    real.view.open({
      url: App.getVideoUrl(), frames: analysisFrames(), lost: a.lost || [], L: a.L || 40, W: a.W || 20,
      dirAt: App.ai && App.ai.dirAt ? App.ai.dirAt : null, event: e, mode: real.mode, catalogSeq: current ? current.seq : null,
      segment: window.FSAI && window.FSAI.segment && api ? (req) => window.FSAI.segment(req) : null
    }).catch(() => { /* la vue affiche elle-même le repli */ });
  }

  /* ---------- export ---------- */
  function setExporting(on, text) {
    exporting = on;
    ["cp-export-one", "cp-export-all"].forEach((id) => { $(id).disabled = on; });
    $("cp-progress").hidden = !on;
    if (text != null) $("cp-msg").textContent = text;
  }

  async function exportSeq(seq, name) {
    if (exporting) return;
    if (!api) { App.toast("Export disponible dans l'application uniquement.", true); return; }
    if (!PL.exportVideo) { App.toast("Export vidéo indisponible.", true); return; }
    if (player) player.pause();
    setExporting(true, "Création de la vidéo…");
    $("cp-bar").style.width = "0%";
    try {
      const out = await PL.exportVideo(seq, { fps: 30, onProgress: (p) => { $("cp-bar").style.width = Math.round(p * 100) + "%"; } });
      const r = await api.saveAnimation(out.buffer, name, out.ext);
      if (r.canceled) { setExporting(false, ""); return; }
      if (r.error) { setExporting(false, ""); App.toast(r.error, true); return; }
      setExporting(false, "Vidéo enregistrée (" + out.ext.toUpperCase() + ") : " + r.path);
      if (out.ext !== "mp4") App.toast("Format WebM utilisé (MP4 non pris en charge sur cet ordinateur). Lisible avec Chrome, Edge ou VLC.");
      else App.toast("Vidéo MP4 enregistrée.");
      if (api.showItem) api.showItem(r.path);
    } catch (e) {
      setExporting(false, "");
      App.toast("Export impossible : " + e.message, true);
    }
  }

  function fullSequence() {
    let analysis;
    try { analysis = A.analyze(state.project); } catch (_e) { return null; }
    if (!analysis.findings.length) return null;
    const p = state.project;
    const items = [{ type: "title", title: (p.name || "Analyse du match") + " — corrections", subtitle: [p.teamName, p.opponentName].filter(Boolean).join(" contre ") || "Erreurs relevées, corrections et exercices", dur: 3.5 }];
    const used = new Set();
    analysis.findings.slice(0, 6).forEach((f) => {
      const sc = SC.forError(f.type);
      if (sc) items.push({ type: "scene", scene: sc, subtitle: f.count + " fois · " + SEV[f.severity] });
      const d = f.drills[0];
      if (d && !used.has(d.id)) { used.add(d.id); const ds = SC.forDrill(d.id); if (ds) items.push({ type: "scene", scene: ds, subtitle: "Exercice recommandé" }); }
    });
    items.push({ type: "title", title: "À retenir pour le prochain match", subtitle: analysis.priorities.map((q, i) => (i + 1) + ". " + q.label + " : " + q.action).join("  ").slice(0, 330), dur: 6 });
    return SC.buildSequence(items);
  }

  function bind() {
    $("cr-fixed").addEventListener("click", () => { real.mode = "fixed"; if (real.view && real.events.length) openReal(); });
    $("cr-seq").addEventListener("click", () => { real.mode = "seq"; if (real.view && real.events.length) openReal(); });
    $("cr-replay").addEventListener("click", () => { if (real.view) real.view.restart(); });
    $("cr-map-pos").addEventListener("click", () => { setMapPos(MAP_POS[(MAP_POS.indexOf(mapPos()) + 1) % MAP_POS.length]); });
    setMapPos(mapPos());
    $("cr-prev").addEventListener("click", () => { real.idx = (real.idx + real.events.length - 1) % real.events.length; openReal(); });
    $("cr-next").addEventListener("click", () => { real.idx = (real.idx + 1) % real.events.length; openReal(); });
    $("cr-catalog").addEventListener("click", () => {
      if (!current) return;
      real.catalog = !real.catalog;
      select(current.kind, current.id, real.catalog);
    });
    $("corr-pip-video").addEventListener("timeupdate", () => { const v = $("corr-pip-video"); if (pip.events.length && v.currentTime >= pip.t1) v.currentTime = pip.t0; });
    $("pip-prev").addEventListener("click", () => { pip.idx = (pip.idx + pip.events.length - 1) % pip.events.length; showPipEvent(); });
    $("pip-next").addEventListener("click", () => { pip.idx = (pip.idx + 1) % pip.events.length; showPipEvent(); });
    $("cp-play").addEventListener("click", () => { if (!player || !current) return; if (player.playing) player.pause(); else player.play(); });
    $("cp-restart").addEventListener("click", () => { if (!player || !current) return; player.seek(0); player.play(); });
    $("cp-rate").addEventListener("change", () => { if (player) player.rate = Number($("cp-rate").value); });
    $("cp-seek").addEventListener("input", () => { if (player && current) { player.pause(); player.seek((Number($("cp-seek").value) / 1000) * current.seq.duration); } });
    $("cp-seek").addEventListener("change", () => $("cp-seek").blur());
    $("cp-export-one").addEventListener("click", () => { if (!current) { App.toast("Choisissez d'abord une animation.", true); return; } exportSeq(current.seq, current.title); });
    $("cp-export-all").addEventListener("click", () => {
      const seq = fullSequence();
      if (!seq) { App.toast("Aucune erreur marquée pour ce match : rien à compiler.", true); return; }
      exportSeq(seq, (state.project.name || "match") + " - corrections");
    });
  }

  App.hooks.onCorrections = () => {
    buildLists();
    ensurePlayer();
    if (!current) { const first = $("corr-mine").querySelector("button.item") ; if (first) select(first.dataset.kind, first.dataset.id, false); else select("error", KB.ERRORS[0].id, false); }
    // retour sur l'onglet (projet peut-être changé) : on réévalue l'erreur affichée ; la vue réelle s'arrête quand l'onglet est caché
    else if (real.events.length || realEvents(current.kind, current.id).length) select(current.kind, current.id, false);
    else if (player) player.render();
  };
  App.openAnimation = (kind, id) => { App.showTab("corrections"); select(kind, id, true); };
  bind();
})();
