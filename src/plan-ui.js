/* Page « Mon plan tactique » : le coach répond à quelques questions (système, hauteur du bloc, pressing…), puis le programme compare
   son plan à ce qu'il a MESURÉ sur le match analysé : ce qu'il ne fallait pas faire, ce qu'il faudrait faire, avec les moments sur la
   vraie vidéo. Ce que le programme ne peut pas vérifier est dit clairement, jamais deviné. */
(function () {
  "use strict";
  const App = window.FSApp, KB = window.FutsalKB, M = window.FutsalMatch, P = window.FutsalPipeline, CP = window.FutsalCompliance, D = window.FutsalDoubt;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  let view = null, shown = null, timer = 0;

  /* ---------- le plan, enregistré dans le projet ---------- */
  function plan() {
    const p = App.state.project;
    if (!p.plan || typeof p.plan !== "object") p.plan = { answers: KB.planDefaults(p.defaultSystem), notes: "" };
    p.plan.answers = Object.assign(KB.planDefaults(p.plan.answers && p.plan.answers.system ? p.plan.answers.system : p.defaultSystem), p.plan.answers || {});
    if (typeof p.plan.notes !== "string") p.plan.notes = "";
    p.plan.training = Object.assign(KB.trainingDefaults(), p.plan.training || {});
    return p.plan;
  }
  function choose(q, value) {
    const pl = plan(), a = pl.answers, prev = a.system;
    a[q.id] = value;
    if (q.id === "system") {
      // les réponses qui suivent le système (gardien-joueur) changent avec lui, sauf si elles avaient été modifiées à la main
      const before = KB.planDefaults(prev), after = KB.planDefaults(value);
      KB.PLAN_QUESTIONS.forEach((x) => { if (x.dependsOnSystem && a[x.id] === before[x.id]) a[x.id] = after[x.id]; });
      App.state.project.defaultSystem = value;
      const sel = $("p-system"); if (sel) sel.value = value;
    }
    App.changed();
    renderQuestions();
    later();
  }

  function renderQuestions() {
    const box = $("plan-questions"), pl = plan();
    box.innerHTML = "";
    KB.PLAN_QUESTIONS.forEach((q) => {
      const fs = document.createElement("fieldset"); fs.className = "plan-q";
      const lg = document.createElement("legend"); lg.textContent = q.label; fs.appendChild(lg);
      const help = document.createElement("p"); help.className = "muted"; help.textContent = q.help; fs.appendChild(help);
      const opts = q.options === "SYSTEMS" ? KB.SYSTEMS.map((s) => ({ id: s.id, label: s.name, desc: s.structure })) : q.options;
      opts.forEach((o) => {
        const lab = document.createElement("label"); lab.className = "plan-opt";
        const r = document.createElement("input"); r.type = "radio"; r.name = "plan-" + q.id; r.value = o.id; r.checked = pl.answers[q.id] === o.id;
        r.addEventListener("change", () => choose(q, o.id));
        const sp = document.createElement("span"), b = document.createElement("b"); b.textContent = o.label; sp.appendChild(b);
        if (o.desc) { const d = document.createElement("small"); d.className = "muted"; d.textContent = " — " + o.desc; sp.appendChild(d); }
        lab.appendChild(r); lab.appendChild(sp); fs.appendChild(lab);
      });
      box.appendChild(fs);
    });
    $("plan-notes").value = pl.notes;
  }

  /* ---------- comparaison du plan au match ---------- */
  function analysisReady() { const a = App.state.project.ai; return !!(a && a.frames && a.frames.length); }
  function compute() {
    const p = App.state.project, a = p.ai;
    const live = App.ai && App.ai.getFrames ? App.ai.getFrames() : null;
    const frames = live && live.length ? live : P.expandFrames(a.frames);
    const s = a.settings || {}, mem = window.FSAI && window.FSAI.memory ? window.FSAI.memory() : { answers: [], rejected: [] };
    const L = a.L || 40, W = a.W || 20;
    const res = M.analyze(frames, {
      L, W, dirAt: App.ai.dirAt, lost: a.lost || [], span: [s.t0 || frames[0].t, s.t1 || frames[frames.length - 1].t],
      bench: s.bench || "auto", benchSeen: a.benchSeen || null, subAnswers: mem.answers.filter((x) => x.kind === "sub")
    });
    res.events = D.filterRejected(res.events, mem);
    return { frames, L, W, out: CP.evaluate(plan().answers, res, { L, W, events: p.events }) };
  }

  const fmt = (t) => App.fmt(t);
  const pct = (v) => Math.round(v * 100) + " %";

  function renderResult() {
    const box = $("plan-result");
    if (!analysisReady()) {
      shown = null;
      box.innerHTML = "<p class=\"muted\">Analyse d'abord une vidéo (onglet « Analyse vidéo ») : cette page compare ton plan à ce que le programme a mesuré sur le match.</p>";
      return;
    }
    let r;
    try { r = compute(); } catch (e) { box.innerHTML = "<p class=\"plan-err\">Comparaison impossible : " + esc(e.message) + "</p>"; return; }
    shown = r;
    const o = r.out;
    if (!o.ok) { box.innerHTML = "<p class=\"muted\">" + esc(o.reason || "Rien à comparer.") + "</p>"; return; }
    let h = "<p class=\"plan-head\">Temps de jeu comparé à ton plan : <b>" + Math.round(o.analysed.sec) + " s</b> sur " + Math.round(o.analysed.total) + " s analysées (" + pct(o.analysed.ratio) + "). <span class=\"muted\">Seules les images où le jeu est en cours, le ballon visible et les quatre joueurs de champ identifiés sont jugées.</span></p>";
    const qq = window.FSAI && window.FSAI.quality ? window.FSAI.quality() : null;
    if (qq && qq.level === "attention") h += "<div class=\"plan-qual\"><b>⚠ Qualité de l'analyse (voir l'onglet Analyse vidéo)</b><ul>" + qq.items.filter((i) => i.level === "attention").map((i) => "<li>" + esc(i.title) + " — " + esc(i.detail) + "</li>").join("") + "</ul></div>";
    h += "<h3>Respect de mon plan</h3>";
    if (!o.rules.length) h += "<p class=\"muted\">Aucune consigne vérifiable avec tes réponses actuelles (ou aucune image exploitable).</p>";
    o.rules.forEach((x) => {
      const amount = x.unit === "pertes" ? (x.id === "pertes" ? x.count + " perte(s) relevée(s)" : x.respected + " sur " + x.evaluated + " pertes avec pressing") : pct(x.share) + " respecté (" + Math.round(x.respected) + " s sur " + Math.round(x.evaluated) + " s)";
      const near = x.id === "forme" && x.near != null ? " Exactement : " + pct(x.share) + " ; proche (un seul joueur hors de sa ligne) : " + pct(x.near) + "." : "";
      const cover = x.unit === "pertes" ? "" : "Jugé sur " + Math.round(x.evaluated) + " s, soit " + pct(x.coverage || 0) + " du jeu analysé.";
      const weak = x.status === "indicatif" ? " <b>Trop peu d'images pour conclure : résultat indicatif seulement</b> (la caméra ne montre pas toujours les quatre joueurs en même temps)." : "";
      h += "<div class=\"plan-rule " + x.status + "\"><div class=\"plan-rule-top\"><b>" + esc(x.label) + "</b><span>" + esc(amount) + "</span></div>" +
        "<div class=\"plan-bar\"><i style=\"width:" + Math.round(x.share * 100) + "%\"></i></div><div class=\"muted\">" + esc(x.plan) + ". " + esc(cover + near) + weak + "</div></div>";
    });
    h += "<h3>Ce qu'il ne faut pas faire <span class=\"muted\">(" + o.deviations.length + " moment(s))</span></h3>";
    if (!o.deviations.length) h += "<p class=\"muted\">Aucun écart à ton plan sur ce qui a pu être mesuré.</p>";
    o.deviations.slice(0, 60).forEach((d, i) => {
      h += "<div class=\"plan-dev sev" + d.severity + "\"><button class=\"t\" data-dev=\"" + i + "\" title=\"Voir ce moment sur la vidéo\">" + esc(fmt(d.t)) + "</button><div>" + esc(d.avoid) + "</div><button data-dev=\"" + i + "\">▶ Voir sur la vidéo</button></div>";
    });
    if (o.deviations.length > 60) h += "<p class=\"muted\">… et " + (o.deviations.length - 60) + " autre(s) moment(s) moins importants.</p>";
    h += "<h3>Ce qu'il faudrait faire</h3>";
    const seen = new Set(), todos = [];
    o.deviations.forEach((d) => { if (!seen.has(d.rule)) { seen.add(d.rule); todos.push(d); } });
    if (!todos.length) h += "<p class=\"muted\">Rien à corriger par rapport à ton plan.</p>";
    todos.forEach((d) => {
      const n = o.deviations.filter((x) => x.rule === d.rule).length, label = (CP.LABEL && CP.LABEL[d.rule]) || d.rule;
      h += "<div class=\"plan-todo\"><b>" + esc(label) + "</b> <span class=\"muted\">(" + n + " fois)</span><br>" + esc(d.todo) + "</div>";
    });
    h += "<h3>Ce que le programme ne peut pas vérifier</h3><ul class=\"plan-ne\">" + o.notEvaluated.map((n) => "<li><b>" + esc(n.label) + "</b> — " + esc(n.why) + "</li>").join("") + "</ul>";
    const notes = plan().notes.trim();
    if (notes) h += "<h3>Mes autres consignes</h3><p class=\"plan-notes\">" + esc(notes).replace(/\n/g, "<br>") + "</p><p class=\"muted\">Notées ici : le programme ne les vérifie pas.</p>";
    box.innerHTML = h;
    box.querySelectorAll("[data-dev]").forEach((b) => b.addEventListener("click", () => showDeviation(o.deviations[Number(b.dataset.dev)])));
  }

  /* ---------- un écart sur la vraie vidéo ---------- */
  function showDeviation(d) {
    if (!d || !shown) return;
    if (!view) view = new window.FutsalRealView.RealView({ root: $("plan-real"), video: $("pl-video"), overlay: $("pl-overlay"), map: $("pl-map"), msg: $("pl-msg") });
    const root = $("plan-real");
    root.hidden = false; root.dataset.mapMode = "auto";
    if (!["br", "bl", "tl", "tr"].some((k) => root.classList.contains("map-" + k))) root.classList.add("map-br");
    const ev = Object.assign({ t: d.t, type: d.type }, d.type === "perte_zone_def" && d.data && d.data.event ? d.data.event : d.data);
    ev.t = d.t; ev.type = d.type;
    $("plan-view-text").innerHTML = "<b class=\"err\">À éviter</b> — " + esc(d.avoid) + "<br><b class=\"ok\">À faire</b> — " + esc(d.todo) + " <span class=\"muted\">La position du joueur vert est indicative.</span>";
    $("plan-view-text").hidden = false;
    view.open({
      url: App.getVideoUrl(), frames: shown.frames, lost: App.state.project.ai.lost || [], L: shown.L, W: shown.W,
      dirAt: App.ai && App.ai.dirAt ? App.ai.dirAt : null, event: ev, mode: "fixed", catalogSeq: null,
      segment: window.FSAI && window.FSAI.segment && App.api ? (req) => window.FSAI.segment(req) : null
    }).catch(() => { /* la vue affiche elle-même le repli */ });
  }

  /* ---------- affichage ---------- */
  function later() { clearTimeout(timer); timer = setTimeout(renderResult, 250); }
  /* ---------- mes entraînements : séance proposée d'après le plan ---------- */
  function renderTrainQ() {
    const box = $("plan-train-q"); if (!box || !KB.TRAINING_QUESTIONS) return;
    const tr = plan().training; box.innerHTML = "";
    KB.TRAINING_QUESTIONS.forEach((q) => {
      const fs = document.createElement("fieldset"); fs.className = "plan-q";
      const lg = document.createElement("legend"); lg.textContent = q.label; fs.appendChild(lg);
      const help = document.createElement("p"); help.className = "muted"; help.textContent = q.help; fs.appendChild(help);
      q.options.forEach((o) => {
        const lab = document.createElement("label"); lab.className = "plan-opt";
        const r = document.createElement("input"); r.type = "radio"; r.name = "train-" + q.id; r.value = o.id; r.checked = tr[q.id] === o.id;
        r.addEventListener("change", () => { plan().training[q.id] = o.id; App.changed(); });
        const sp = document.createElement("span"), b = document.createElement("b"); b.textContent = o.label; sp.appendChild(b);
        if (o.desc) { const d = document.createElement("small"); d.className = "muted"; d.textContent = " — " + o.desc; sp.appendChild(d); }
        lab.appendChild(r); lab.appendChild(sp); fs.appendChild(lab);
      });
      box.appendChild(fs);
    });
  }
  function renderSeance() {
    const out = $("plan-train-res"); if (!out || !KB.proposerSeance) return;
    const el = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
    const r = KB.proposerSeance(plan().answers, { duree: Number($("plan-train-dur").value) || 75, training: plan().training });
    out.innerHTML = "";
    out.appendChild(el("h3", "Séance proposée : " + r.total + " min sur " + r.duree));
    drawSeance(out, r, el);
  }
  function drawSeance(out, r, el) {
    out.appendChild(el("p", r.resume, "muted"));
    r.blocs.forEach((b) => {
      const card = el("div", null, "card"); out.appendChild(card);
      const draw = (id) => {   // un exercice, ou la variante choisie dans la liste (mur à deux ou en escalier, avec ou sans gardien, sur corner ou sur coup franc…)
        const d = KB.DRILLS.find((x) => x.id === id) || b.drill, v = (b.variantes || []).find((x) => x.id === id);
        card.innerHTML = "";
        card.appendChild(el("h3", b.ordre + ". " + b.phase + " — " + d.name + " (" + (id === b.drill.id ? b.minutes : d.duration) + " min)"));
        if (b.variantes && b.variantes.length > 1) {
          const lab = el("label", "Variante : "), sel = el("select");
          b.variantes.forEach((x) => { const o = el("option", x.label); o.value = x.id; if (x.id === id) o.selected = true; sel.appendChild(o); });
          sel.addEventListener("change", () => draw(sel.value)); lab.appendChild(sel); card.appendChild(lab);
        }
        card.appendChild(el("p", "Joueurs : " + d.players + " · Objectif : " + d.goal));
        card.appendChild(el("p", d.description));
        const why = el("p"); why.appendChild(el("strong", "Pourquoi : "));
        why.appendChild(document.createTextNode(id === b.drill.id ? b.pourquoi.join(" ; ") + "." : "variante choisie par toi (" + (v ? v.label : d.name) + "), à la place de « " + b.drill.name + " » proposé pour ton plan."));
        card.appendChild(why);
        const cr = el("p"); cr.appendChild(el("strong", "Critères de réussite : ")); cr.appendChild(document.createTextNode(d.criteria.join(" · "))); card.appendChild(cr);
      };
      draw(b.drill.id);
    });
    if (r.sansExercice.length) out.appendChild(el("p", "Sans exercice ciblé : " + r.sansExercice.join(" ; ") + ".", "muted"));
    out.appendChild(el("p", "Les animations de chaque exercice sont dans l'onglet « Corrections animées », rubrique Exercices. Durées et critères : repères d'entraîneur à adapter ; l'efficacité des exercices n'est pas mesurée par le programme.", "muted"));
  }
  /* séances prêtes : quinze séances thématiques de 45 à 120 min, composées avec le plan et les choix de l'entraîneur */
  function renderPretes() {
    const out = $("plan-pretes-res"); if (!out || !KB.proposerSeancesPretes) return;
    const el = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
    const liste = KB.proposerSeancesPretes(plan().answers, plan().training, { duree: Number($("plan-pretes-dur").value) || 0 });
    out.innerHTML = "";
    out.appendChild(el("p", liste.length + " séance(s) pour ton plan. Clique sur une séance pour voir ses exercices.", "muted"));
    liste.forEach((x) => {
      const det = el("details", null, "card"), sum = el("summary", x.titre + " — " + x.duree + " min (" + x.seance.total + " min d'exercices, " + x.seance.blocs.length + " exercices)");
      sum.style.cursor = "pointer"; sum.style.fontWeight = "600"; det.appendChild(sum);
      det.appendChild(el("p", "Quand : " + x.quand));
      det.appendChild(el("p", "Objectif : " + x.objectif));
      drawSeance(det, x.seance, el);
      out.appendChild(det);
    });
  }
  function render() { renderQuestions(); renderTrainQ(); renderResult(); }

  function bind() {
    $("plan-notes").addEventListener("input", () => { plan().notes = $("plan-notes").value; App.changed(); later(); });
    $("plan-train-go").addEventListener("click", renderSeance);
    $("plan-pretes-go").addEventListener("click", renderPretes);
    $("plan-pretes-dur").addEventListener("change", renderPretes);
    $("plan-reset").addEventListener("click", () => {
      const p = App.state.project;
      p.plan = { answers: KB.planDefaults(p.plan && p.plan.answers ? p.plan.answers.system : p.defaultSystem), notes: plan().notes };
      App.changed(); render();
    });
  }

  const prevLoad = App.hooks.onLoad;
  App.hooks.onLoad = function () { if (prevLoad) prevLoad.apply(this, arguments); if (view) view.close(); const r = $("plan-real"); if (r) r.hidden = true; const t = $("plan-view-text"); if (t) t.hidden = true; shown = null; };
  App.hooks.onPlan = render;
  bind();
  window.FSPlan = { render, plan };
})();
