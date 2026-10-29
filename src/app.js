/* Interface Futsal Analyzer (renderer). */
(function () {
  "use strict";
  const KB = window.FutsalKB;
  const A = window.FutsalAnalyzer;
  const R = window.FutsalReport;
  const api = window.fsal; // pont Electron (peut être absent hors Electron)
  const $ = (id) => document.getElementById(id);
  const esc = R.esc;
  const FPS = 25;

  const SPECIAL = {
    but_encaisse: { label: "But encaissé", color: "#ef4444" },
    but_marque: { label: "But marqué", color: "#22c55e" }
  };
  const errById = Object.fromEntries(KB.ERRORS.map((e) => [e.id, e]));

  let state = { project: newProject(), projectPath: null, videoOk: false, aiDirty: false };
  const hooks = { onLoad() {}, onCorrections() {}, onPlan() {}, onTime() {} };
  let saveTimer = null;
  let editingId = null;

  function newProject() {
    return { version: 1, name: "", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: null, videoName: null, secondHalfStart: null, duration: 0, events: [], ai: null };
  }

  /* ---------- utilitaires ---------- */
  function toast(msg, isErr) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (isErr ? " err" : "");
    t.hidden = true; void t.offsetWidth; t.hidden = false;   // le message réapparaît même s'il est identique au précédent (clic répété)
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 2800);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fill(select, entries, selected) {
    select.innerHTML = "";
    entries.forEach(([v, l]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = l;
      if (v === selected) o.selected = true;
      select.appendChild(o);
    });
  }
  function parseTime(str) {
    const m = /^(\d{1,3}):([0-5]\d)$/.exec(String(str).trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function phaseColor(type) {
    if (SPECIAL[type]) return SPECIAL[type].color;
    const e = errById[type];
    return e ? KB.PHASES[e.phase].color : "#64748b";
  }
  function labelOf(type) {
    return SPECIAL[type] ? SPECIAL[type].label : (errById[type] ? errById[type].label : type);
  }

  /* ---------- sauvegarde ---------- */
  /* ai = true : les trajectoires de l'analyse IA ont changé (réécrites dans leur fichier séparé). */
  function changed(ai) {
    if (ai) state.aiDirty = true;
    $("save-state").textContent = "Modifications…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!api) return;
      const full = state.project;
      const light = Object.assign({}, full);
      if (light.ai && light.ai.frames) light.ai = Object.assign({}, light.ai, { frames: null, framesCount: light.ai.frames.length });
      const sendFrames = state.aiDirty ? ((full.ai && full.ai.frames) || []) : null;
      const r = await api.autosave(light, sendFrames);
      if (r && r.ok && sendFrames) state.aiDirty = false;
      $("save-state").textContent = r && r.ok ? "Sauvegarde auto ✓" : "⚠ Sauvegarde auto impossible";
    }, 500);
  }

  async function saveProject(saveAs) {
    if (!api) { toast("Enregistrement indisponible hors application.", true); return; }
    const r = await api.saveProject(state.project, state.projectPath, saveAs);
    if (r.canceled) return;
    if (r.error) { toast(r.error, true); return; }
    state.projectPath = r.path;
    toast("Projet enregistré.");
  }

  async function openProject() {
    if (!api) return;
    const r = await api.openProject();
    if (r.canceled) return;
    if (r.error) { toast(r.error, true); return; }
    await loadProject(r.project, r.path);
  }

  async function loadProject(project, projectPath, aiFrames) {
    const base = newProject();
    state.project = Object.assign(base, project, {
      events: Array.isArray(project.events) ? project.events.filter((e) => e && typeof e.type === "string" && isFinite(Number(e.t))).map((e) => Object.assign({}, e, { t: Number(e.t), id: e.id || uid() })) : []
    });
    state.projectPath = projectPath || null;
    if (state.project.ai && !state.project.ai.frames && Array.isArray(aiFrames)) state.project.ai.frames = aiFrames;
    syncMeta();
    clearVideo();
    if (state.project.videoPath && api) {
      const v = await api.resolveVideo(state.project.videoPath);
      if (v.error) showVideoError(v.error + " Choisissez à nouveau la vidéo pour relier le projet.");
      else attachVideo(v);
    }
    renderAll();
    hooks.onLoad();
    changed(true);
  }

  function newProjectAction() {
    if (state.project.events.length && !confirm("Créer un nouveau projet ? Le projet actuel est sauvegardé automatiquement mais ne sera plus ouvert (pensez à « Enregistrer »).")) return;
    state.project = newProject();
    state.projectPath = null;
    clearVideo();
    syncMeta();
    renderAll();
    hooks.onLoad();
    changed(true);
  }

  /* ---------- vidéo ---------- */
  const video = $("video");

  function clearVideo() {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;
    $("video-empty").hidden = false;
    $("seek").disabled = true; $("seek").title = "Choisissez d'abord une vidéo.";
    $("seek").max = 0;
    $("video-error").hidden = true;
    state.videoOk = false;
    updateTime();
  }
  function showVideoError(msg) {
    const e = $("video-error");
    e.textContent = msg;
    e.hidden = false;
  }
  function attachVideo(v) {
    $("video-error").hidden = true;
    state.project.videoPath = v.path;
    state.project.videoName = v.name;
    video.src = v.url;
    video.hidden = false;
    $("video-empty").hidden = true;
  }
  async function pickVideo() {
    if (!api) { toast("Sélection de vidéo indisponible hors application.", true); return; }
    const v = await api.pickVideo();
    if (v.canceled) return;
    if (v.error) { showVideoError(v.error); return; }
    attachVideo(v);
    changed();
  }

  video.addEventListener("loadedmetadata", () => {
    state.videoOk = true;
    $("seek").max = video.duration;
    $("seek").disabled = false; $("seek").title = "Position dans la vidéo";
    state.project.duration = video.duration;
    updateTime();
    renderTimeline();
    changed();
  });
  video.addEventListener("error", () => {
    state.videoOk = false;
    const code = video.error ? video.error.code : 0;
    showVideoError(code === 4
      ? "Cette vidéo ne peut pas être lue (format ou codec non pris en charge). Convertissez-la en MP4 (H.264 + AAC) puis rechargez-la."
      : "Erreur de lecture de la vidéo (code " + code + "). Vérifiez que le fichier n'est pas corrompu ou déplacé.");
    $("seek").disabled = true; $("seek").title = "La vidéo n'a pas pu être lue : choisissez-en une autre.";
  });
  video.addEventListener("timeupdate", updateTime);
  video.addEventListener("seeked", updateTime);
  video.addEventListener("play", () => { $("c-play").textContent = "⏸ Pause"; });
  video.addEventListener("pause", () => { $("c-play").textContent = "▶ Lecture"; });
  video.addEventListener("ended", () => { $("c-play").textContent = "▶ Lecture"; });

  function updateTime() {
    const cur = video.currentTime || 0;
    const dur = isFinite(video.duration) ? video.duration : 0;
    $("c-time").textContent = A.fmtTime(cur) + " / " + A.fmtTime(dur);
    $("p-now").textContent = A.fmtTime(cur);
    if (document.activeElement !== $("seek")) $("seek").value = cur;
    positionHead();
    hooks.onTime();
  }
  function seek(t) {
    if (!state.videoOk) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, t));
  }
  function togglePlay() {
    if (!state.videoOk) return;
    if (video.paused) video.play().catch(() => {}); else video.pause();
  }

  function captureThumb() {
    try {
      if (!video.videoWidth) return null;
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = Math.round((320 * video.videoHeight) / video.videoWidth);
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.6);
    } catch (_e) {
      return null;
    }
  }

  /* ---------- événements ---------- */
  function addEvent(type) {
    if (!state.videoOk) { toast("Chargez d'abord une vidéo pour marquer des événements.", true); return; }
    const isGoal = !!SPECIAL[type];
    const ev = {
      id: uid(), t: Math.round(video.currentTime * 10) / 10, type,
      zone: isGoal ? null : $("x-zone").value || null,
      side: isGoal ? null : $("x-side").value || null,
      outcome: isGoal ? "AUCUN" : $("x-outcome").value,
      system: state.project.defaultSystem,
      note: isGoal ? "" : $("x-note").value.trim(),
      thumb: captureThumb()
    };
    state.project.events.push(ev);
    state.project.events.sort((a, b) => a.t - b.t);
    if (!isGoal) $("x-note").value = "";
    renderEvents(); renderTimeline(); renderPalette();
    changed();
    toast(labelOf(type) + " — " + A.fmtTime(ev.t));
  }

  function deleteEvent(id) {
    state.project.events = state.project.events.filter((e) => e.id !== id);
    renderEvents(); renderTimeline(); renderPalette();
    changed();
  }

  function openEdit(id) {
    const ev = state.project.events.find((e) => e.id === id);
    if (!ev) return;
    editingId = id;
    $("edit-title").textContent = labelOf(ev.type);
    $("e-time").value = A.fmtTime(ev.t);
    fill($("e-zone"), [["", "—"]].concat(Object.entries(KB.ZONES).map(([k, v]) => [k, v.label])), ev.zone || "");
    fill($("e-side"), [["", "—"]].concat(Object.entries(KB.SIDES)), ev.side || "");
    fill($("e-outcome"), Object.entries(KB.OUTCOMES).map(([k, v]) => [k, v.label]), ev.outcome || "AUCUN");
    $("e-note").value = ev.note || "";
    const isGoal = !!SPECIAL[ev.type];
    ["e-zone", "e-side", "e-outcome", "e-note"].forEach((i) => { $(i).disabled = isGoal; $(i).title = isGoal ? "Un but n'a pas besoin de ces précisions." : ""; });
    $("edit-dialog").showModal();
  }
  function commitEdit() {
    const ev = state.project.events.find((e) => e.id === editingId);
    if (!ev) return;
    const t = parseTime($("e-time").value);
    if (t == null) { toast("Minutage invalide (format mm:ss).", true); return; }
    ev.t = state.project.duration ? Math.min(t, state.project.duration) : t;
    if (!SPECIAL[ev.type]) {
      ev.zone = $("e-zone").value || null;
      ev.side = $("e-side").value || null;
      ev.outcome = $("e-outcome").value;
      ev.note = $("e-note").value.trim();
    }
    state.project.events.sort((a, b) => a.t - b.t);
    $("edit-dialog").close();
    renderEvents(); renderTimeline();
    changed();
  }

  /* ---------- rendus ---------- */
  function syncMeta() {
    $("p-name").value = state.project.name || "";
    $("p-team").value = state.project.teamName || "";
    $("p-opp").value = state.project.opponentName || "";
    fill($("p-system"), KB.SYSTEMS.map((s) => [s.id, s.name]), state.project.defaultSystem);
  }

  function renderPalette() {
    const q = $("palette-search").value.trim().toLowerCase();
    const counts = {};
    state.project.events.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    const box = $("palette");
    box.innerHTML = "";
    Object.keys(KB.PHASES).forEach((ph) => {
      const items = KB.ERRORS.filter((e) => e.phase === ph && (!q || (e.label + " " + e.description).toLowerCase().includes(q)));
      if (!items.length) return;
      const g = document.createElement("div");
      g.className = "pgroup";
      g.innerHTML = "<h4 style=\"color:" + KB.PHASES[ph].color + "\">" + esc(KB.PHASES[ph].label) + "</h4>";
      const btns = document.createElement("div");
      btns.className = "btns";
      items.forEach((e) => {
        const b = document.createElement("button");
        b.className = "pbtn";
        b.style.borderLeftColor = KB.PHASES[ph].color;
        b.title = e.description;
        b.innerHTML = esc(e.label) + (counts[e.id] ? "<span class=\"n\">" + counts[e.id] + "</span>" : "");
        b.addEventListener("click", () => addEvent(e.id));
        btns.appendChild(b);
      });
      g.appendChild(btns);
      box.appendChild(g);
    });
    if (!box.children.length) box.innerHTML = "<p class=\"muted\">Aucune situation ne correspond à la recherche.</p>";
  }

  function chips(ev) {
    const parts = [];
    if (ev.zone && KB.ZONES[ev.zone]) parts.push(KB.ZONES[ev.zone].label.split(" (")[0]);
    if (ev.side && KB.SIDES[ev.side]) parts.push(KB.SIDES[ev.side]);
    if (ev.outcome && ev.outcome !== "AUCUN" && KB.OUTCOMES[ev.outcome]) parts.push(KB.OUTCOMES[ev.outcome].label);
    if (A.periodOf(state.project, ev.t) === 2 && typeof state.project.secondHalfStart === "number") parts.push("2e période");
    if (ev.auto) parts.push("détecté par l'IA");
    if (ev.note) parts.push("« " + ev.note + " »");
    return parts.join(" · ");
  }

  function renderEvents() {
    const list = $("events");
    const evs = state.project.events;
    $("ev-count").textContent = "(" + evs.length + ")";
    list.innerHTML = "";
    if (!evs.length) { list.innerHTML = "<p class=\"muted\" style=\"padding:8px\">Aucun événement. Lancez la vidéo puis cliquez sur une situation observée.</p>"; return; }
    evs.forEach((ev) => {
      const row = document.createElement("div");
      row.className = "ev";
      row.innerHTML = "<button class=\"t\" title=\"Aller à ce moment\">" + A.fmtTime(ev.t) + "</button>" +
        "<div><div class=\"lbl\"><span class=\"dot\" style=\"background:" + phaseColor(ev.type) + "\"></span>" + esc(labelOf(ev.type)) + "</div><div class=\"chips\">" + esc(chips(ev)) + "</div></div>" +
        "<div class=\"btns\"><button data-a=\"edit\" title=\"Modifier\">✎</button><button data-a=\"del\" title=\"Supprimer\">🗑</button></div>";
      row.querySelector(".t").addEventListener("click", () => seek(Math.max(0, ev.t - 3)));
      row.querySelector("[data-a=edit]").addEventListener("click", () => openEdit(ev.id));
      row.querySelector("[data-a=del]").addEventListener("click", () => deleteEvent(ev.id));
      list.appendChild(row);
    });
  }

  function renderTimeline() {
    const tl = $("timeline");
    tl.innerHTML = "";
    const dur = state.project.duration;
    if (!dur) return;
    if (typeof state.project.secondHalfStart === "number") {
      const h = document.createElement("div");
      h.className = "half"; h.title = "Début de la 2e période";
      h.style.left = (state.project.secondHalfStart / dur) * 100 + "%";
      tl.appendChild(h);
    }
    state.project.events.forEach((ev) => {
      const b = document.createElement("button");
      b.className = "mk" + (SPECIAL[ev.type] ? " goal" : "");
      b.style.left = Math.min(100, (ev.t / dur) * 100) + "%";
      b.style.background = phaseColor(ev.type);
      b.title = A.fmtTime(ev.t) + " — " + labelOf(ev.type);
      if (SPECIAL[ev.type]) b.textContent = "⚽";
      b.addEventListener("click", () => seek(Math.max(0, ev.t - 3)));
      tl.appendChild(b);
    });
    const head = document.createElement("div");
    head.className = "head"; head.id = "tl-head";
    tl.appendChild(head);
    positionHead();
  }
  function positionHead() {
    const head = $("tl-head");
    const dur = state.project.duration;
    if (head && dur) head.style.left = Math.min(100, ((video.currentTime || 0) / dur) * 100) + "%";
  }

  function renderAll() {
    renderPalette(); renderEvents(); renderTimeline(); updateTime();
  }

  /* ---------- rapport ---------- */
  function currentReportHtml() {
    const analysis = A.analyze(state.project);
    return R.build(state.project, analysis, { date: new Date().toLocaleDateString("fr-FR") });
  }
  function renderReport() {
    $("report-frame").srcdoc = currentReportHtml();
    $("r-msg").textContent = "";
  }
  function reportName() {
    return (state.project.name || "rapport-futsal").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
  }
  async function exportReport(kind) {
    if (!api) { toast("Export indisponible hors application.", true); return; }
    $("r-msg").textContent = "Export en cours…";
    const html = currentReportHtml();
    const r = kind === "pdf" ? await api.exportPDF(html, reportName()) : await api.exportHTML(html, reportName());
    if (r.canceled) { $("r-msg").textContent = "Export annulé : rien n'a été enregistré."; return; }
    if (r.error) { $("r-msg").textContent = ""; toast(r.error, true); return; }
    $("r-msg").textContent = "Exporté : " + r.path;
  }

  /* ---------- base de connaissances ---------- */
  const KB_SECTIONS = [
    { id: "rules", title: "Lois du jeu", render: renderRules },
    { id: "systems", title: "Systèmes tactiques", render: renderSystems },
    { id: "roles", title: "Rôles et postes", render: renderRoles },
    { id: "tactics", title: "Tactique détaillée", render: renderTactics },
    { id: "errors", title: "Erreurs & solutions", render: renderErrors },
    { id: "drills", title: "Exercices", render: renderDrills },
    { id: "glossary", title: "Vocabulaire", render: renderGlossary }
  ];
  let kbCurrent = "rules";

  const ul = (arr) => "<ul>" + arr.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>";
  function renderRules() {
    return "<h1>Lois du jeu du futsal</h1><p class=\"muted\">Synthèse pédagogique des Lois du jeu FIFA du futsal. Vérifiez toujours le règlement de votre compétition.</p>" +
      KB.RULES.map((c) => "<h2>" + esc(c.title) + "</h2>" + c.items.map((i) => "<div class=\"card\"><h3>" + esc(i.title) + "</h3><p>" + esc(i.text) + "</p></div>").join("")).join("");
  }
  function renderSystems() {
    return "<h1>Systèmes tactiques</h1>" + KB.SYSTEMS.map((s) =>
      "<div class=\"card\"><h3>" + esc(s.name) + " <span class=\"muted\">· " + esc(s.aka) + "</span></h3><p><strong>Structure :</strong> " + esc(s.structure) + "</p><p>" + esc(s.description) + "</p><div class=\"two\"><div><strong>Points forts</strong>" + ul(s.strengths) + "</div><div><strong>Points faibles</strong>" + ul(s.weaknesses) + "</div></div></div>").join("") +
      "<h2>Organisations défensives</h2>" + KB.DEFENSIVE_ORGANISATIONS.map((d) => "<div class=\"card\"><h3>" + esc(d.name) + "</h3><p>" + esc(d.text) + "</p></div>").join("") +
      "<h2>Principes de jeu</h2>" + KB.PRINCIPLES.map((d) => "<div class=\"card\"><h3>" + esc(d.title) + "</h3><p>" + esc(d.text) + "</p></div>").join("");
  }
  function renderRoles() {
    return "<h1>Rôles et postes</h1>" + KB.ROLES.map((r) =>
      "<div class=\"card\"><h3>" + esc(r.name) + " <span class=\"muted\">· " + esc(r.aka) + "</span></h3><p>" + esc(r.summary) + "</p><div class=\"two\"><div><strong>En attaque</strong>" + ul(r.attack) + "</div><div><strong>En défense</strong>" + ul(r.defense) + "</div></div><p><strong>Qualités :</strong> " + esc(r.qualities.join(", ")) + "</p><p><strong>Erreurs fréquentes :</strong> " + esc(r.commonErrors.map((id) => (errById[id] ? errById[id].label : id)).join(" · ")) + "</p></div>").join("");
  }
  function renderTactics() {
    return "<h1>Tactique détaillée</h1>" + KB.TACTICS.map((c) => "<h2>" + esc(c.title) + "</h2>" + c.items.map((i) => "<div class=\"card\"><h3>" + esc(i.title) + "</h3><p>" + esc(i.text) + "</p></div>").join("")).join("");
  }
  const animBtn = (kind, id) => "<button class=\"anim\" data-kind=\"" + kind + "\" data-id=\"" + esc(id) + "\">▶ Voir l'animation en vue de dessus</button>";
  function renderErrors() {
    return "<h1>Catalogue des erreurs tactiques et solutions</h1>" + Object.keys(KB.PHASES).map((ph) =>
      "<h2 style=\"color:" + KB.PHASES[ph].color + "\">" + esc(KB.PHASES[ph].label) + "</h2>" + KB.ERRORS.filter((e) => e.phase === ph).map((e) =>
        "<div class=\"card\"><h3>" + esc(e.label) + "</h3><p>" + esc(e.description) + "</p><div class=\"two\"><div><strong>Ce que l'on observe</strong>" + ul(e.signs) + "<strong>Causes probables</strong>" + ul(e.causes) + "</div><div><strong>Solutions</strong>" + ul(e.solutions) + "<strong>Consignes</strong>" + ul(e.cues) + "</div></div><p><strong>Exercices :</strong> " + esc(e.drills.map((id) => { const d = KB.DRILLS.find((x) => x.id === id); return d ? d.name : id; }).join(" · ")) + "</p>" + animBtn("error", e.id) + "</div>").join("")).join("");
  }
  function renderDrills() {
    return "<h1>Bibliothèque d'exercices</h1>" + KB.DRILLS.map((d) =>
      "<div class=\"card\"><h3>" + esc(d.name) + " <span class=\"muted\">· " + d.duration + " min · " + esc(d.players) + "</span></h3><p><strong>Objectif :</strong> " + esc(d.goal) + "</p><p>" + esc(d.description) + "</p><strong>Critères de réussite</strong>" + ul(d.criteria) + animBtn("drill", d.id) + "</div>").join("");
  }
  function renderGlossary() {
    return "<h1>Vocabulaire du futsal</h1><dl>" + KB.GLOSSARY.slice().sort((a, b) => a.term.localeCompare(b.term, "fr")).map((g) => "<dt>" + esc(g.term) + "</dt><dd>" + esc(g.def) + "</dd>").join("") + "</dl>";
  }

  function renderKbMenu() {
    const m = $("kb-menu");
    m.innerHTML = "";
    KB_SECTIONS.forEach((s) => {
      const b = document.createElement("button");
      b.textContent = s.title;
      b.className = s.id === kbCurrent && !$("kb-search").value.trim() ? "active" : "";
      b.addEventListener("click", () => { $("kb-search").value = ""; kbCurrent = s.id; showKb(); });
      m.appendChild(b);
    });
  }
  function showKb() {
    renderKbMenu();
    const q = $("kb-search").value.trim().toLowerCase();
    const c = $("kb-content");
    if (q.length < 2) {
      c.innerHTML = KB_SECTIONS.find((s) => s.id === kbCurrent).render();
      c.scrollTop = 0;
      return;
    }
    let out = "<h1>Résultats pour « " + esc(q) + " »</h1>";
    let n = 0;
    const hit = (...parts) => parts.join(" ").toLowerCase().includes(q);
    KB.RULES.forEach((cat) => cat.items.forEach((i) => { if (hit(i.title, i.text)) { n++; out += "<div class=\"card\"><h3>Règle · " + esc(i.title) + "</h3><p>" + esc(i.text) + "</p></div>"; } }));
    KB.SYSTEMS.forEach((s) => { if (hit(s.name, s.aka, s.description, s.structure)) { n++; out += "<div class=\"card\"><h3>Système · " + esc(s.name) + "</h3><p>" + esc(s.description) + "</p></div>"; } });
    KB.DEFENSIVE_ORGANISATIONS.concat(KB.PRINCIPLES).forEach((d) => { const t = d.name || d.title; if (hit(t, d.text)) { n++; out += "<div class=\"card\"><h3>Tactique · " + esc(t) + "</h3><p>" + esc(d.text) + "</p></div>"; } });
    KB.TACTICS.forEach((cat) => cat.items.forEach((i) => { if (hit(i.title, i.text)) { n++; out += "<div class=\"card\"><h3>Tactique · " + esc(i.title) + "</h3><p>" + esc(i.text) + "</p></div>"; } }));
    KB.ROLES.forEach((r) => { if (hit(r.name, r.aka, r.summary, r.attack.join(" "), r.defense.join(" "))) { n++; out += "<div class=\"card\"><h3>Rôle · " + esc(r.name) + "</h3><p>" + esc(r.summary) + "</p></div>"; } });
    KB.ERRORS.forEach((e) => { if (hit(e.label, e.description, e.solutions.join(" "), e.causes.join(" "))) { n++; out += "<div class=\"card\"><h3>Erreur · " + esc(e.label) + "</h3><p>" + esc(e.description) + "</p>" + ul(e.solutions) + "</div>"; } });
    KB.DRILLS.forEach((d) => { if (hit(d.name, d.goal, d.description)) { n++; out += "<div class=\"card\"><h3>Exercice · " + esc(d.name) + "</h3><p>" + esc(d.description) + "</p></div>"; } });
    KB.GLOSSARY.forEach((g) => { if (hit(g.term, g.def)) { n++; out += "<div class=\"card\"><h3>Vocabulaire · " + esc(g.term) + "</h3><p>" + esc(g.def) + "</p></div>"; } });
    if (!n) out += "<p class=\"muted\">Aucun résultat.</p>";
    c.innerHTML = out;
  }

  /* ---------- onglets ---------- */
  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    if (name === "rapport") renderReport();
    if (name === "kb") showKb();
    if (name === "corrections") hooks.onCorrections();
    if (name === "plan") hooks.onPlan();
  }

  /* ---------- initialisation ---------- */
  function bind() {
    document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    /* Sans vidéo, les commandes de lecture et le marquage disent quoi faire au lieu de rester sans réaction */
    ["c-play", "c-prev", "c-next", "c-frame-b", "c-frame-f", "g-for", "g-against"].forEach((id) => $(id).addEventListener("click", (e) => { if (!state.videoOk) { e.stopImmediatePropagation(); toast("Choisissez d'abord une vidéo : bouton « Choisir une vidéo » au milieu de l'écran."); } }, true));
    $("btn-new").addEventListener("click", newProjectAction);
    $("btn-open").addEventListener("click", openProject);
    $("btn-save").addEventListener("click", () => saveProject(false));
    $("btn-video").addEventListener("click", pickVideo);
    $("c-change").addEventListener("click", pickVideo);
    $("c-play").addEventListener("click", togglePlay);
    $("c-prev").addEventListener("click", () => seek(video.currentTime - 5));
    $("c-next").addEventListener("click", () => seek(video.currentTime + 5));
    $("c-frame-b").addEventListener("click", () => { video.pause(); seek(video.currentTime - 1 / FPS); });
    $("c-frame-f").addEventListener("click", () => { video.pause(); seek(video.currentTime + 1 / FPS); });
    $("c-rate").addEventListener("change", () => { video.playbackRate = Number($("c-rate").value); });
    $("c-half").addEventListener("click", () => {
      if (!state.videoOk) { toast("Chargez d'abord une vidéo.", true); return; }
      state.project.secondHalfStart = Math.round(video.currentTime * 10) / 10;
      renderTimeline(); renderEvents(); changed();
      toast("Début de la 2e période : " + A.fmtTime(state.project.secondHalfStart));
    });
    $("seek").addEventListener("input", () => seek(Number($("seek").value)));
    $("seek").addEventListener("change", () => $("seek").blur());
    $("g-against").addEventListener("click", () => addEvent("but_encaisse"));
    $("g-for").addEventListener("click", () => addEvent("but_marque"));
    $("btn-analyse").addEventListener("click", () => showTab("rapport"));
    $("palette-search").addEventListener("input", renderPalette);
    $("kb-search").addEventListener("input", showKb);
    $("kb-content").addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest("button.anim");
      if (b && window.FSApp && window.FSApp.openAnimation) window.FSApp.openAnimation(b.dataset.kind, b.dataset.id);
    });
    $("r-pdf").addEventListener("click", () => exportReport("pdf"));
    $("r-html").addEventListener("click", () => exportReport("html"));

    [["p-name", "name"], ["p-team", "teamName"], ["p-opp", "opponentName"]].forEach(([id, key]) => {
      $(id).addEventListener("input", () => { state.project[key] = $(id).value; changed(); });
    });
    $("p-system").addEventListener("change", () => { state.project.defaultSystem = $("p-system").value; changed(); });

    $("edit-form").addEventListener("submit", (e) => { e.preventDefault(); commitEdit(); });
    $("e-cancel").addEventListener("click", () => $("edit-dialog").close());

    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (["input", "select", "textarea"].includes(tag) || $("edit-dialog").open) return;
      if (!document.getElementById("tab-analyse").classList.contains("active")) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); seek(video.currentTime - 5); }
      else if (e.code === "ArrowRight") { e.preventDefault(); seek(video.currentTime + 5); }
      else if (e.key === ",") { video.pause(); seek(video.currentTime - 1 / FPS); }
      else if (e.key === ".") { video.pause(); seek(video.currentTime + 1 / FPS); }
    });

    if (api) {
      api.onMenu((action) => {
        if (action === "new") newProjectAction();
        else if (action === "open") openProject();
        else if (action === "save") saveProject(false);
        else if (action === "saveAs") saveProject(true);
        else if (action === "video") pickVideo();
        else if (action === "help") showTab("aide");
        else if (action === "labelling" && window.FSLabel) window.FSLabel.open();
        else if (action === "controle" && window.FSControle) window.FSControle.open();
      });
    }
  }

  window.FSApp = {
    state, hooks, api, video, toast, changed, loadProject, newProject, attachVideo, saveProject, renderEvents, renderTimeline, renderPalette, seek, showTab, uid,
    fmt: A.fmtTime, parseTime, labelOf, phaseColor, errById, esc, fill,
    isVideoReady: () => state.videoOk,
    getVideoUrl: () => video.currentSrc || video.src
  };

  async function init() {
    fill($("x-zone"), [["", "—"]].concat(Object.entries(KB.ZONES).map(([k, v]) => [k, v.label])), "");
    fill($("x-side"), [["", "—"]].concat(Object.entries(KB.SIDES)), "");
    fill($("x-outcome"), Object.entries(KB.OUTCOMES).map(([k, v]) => [k, v.label]), "AUCUN");
    syncMeta();
    bind();
    renderAll();
    if (api) {
      const r = await api.loadAutosave();
      if (r && r.project) await loadProject(r.project, null, r.aiFrames);
    }
    $("save-state").textContent = "";
  }

  window.addEventListener("error", (e) => toast("Erreur inattendue : " + e.message, true));
  init();
})();
