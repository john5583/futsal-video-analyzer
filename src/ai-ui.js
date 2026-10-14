/* Volet « Analyse IA » : calibrage du terrain, choix des tenues, analyse de la vidéo, résultats (cadres, mini-carte, erreurs suggérées). */
(function () {
  "use strict";
  const App = window.FSApp;
  const KB = window.FutsalKB, HG = window.FutsalHomography, K = window.FutsalKit, P = window.FutsalPipeline, M = window.FutsalMatch, E = window.FutsalAnim;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const video = App.video, api = App.api, state = App.state;

  const ROLES = [["A", "Mon équipe", "#2f6fed"], ["B", "Adversaire", "#e5484d"], ["GKA", "Mon gardien", "#f2b705"], ["GKB", "Gardien adverse", "#ff8a3d"], ["REF", "Arbitre", "#a78bfa"]];
  const TEAM_COLOR = { A: "#3b82f6", B: "#ef4444", GKA: "#f2b705", GKB: "#ff8a3d", REF: "#a78bfa", UNK: "#9aa5a0" };
  const PARTS = { shirt: "le MAILLOT", shorts: "le SHORT", socks: "les CHAUSSETTES", trim: "les MANCHES / le LISERÉ" };
  let pts = [];              // repères en cours de placement : { id, label, ix, iy }
  let placing = null;        // identifiant du repère à placer
  let pickRole = null;       // rôle de tenue à choisir
  let frames = [];           // trajectoires (format d'analyse)
  let abort = null;
  let running = false;
  let live = null;           // image affichée pendant l'analyse
  let pip = null;            // pipette en cours : { role, parts: { shirt, shorts, socks, trim }, part, points }
  let preview = null;        // aperçu de la reconnaissance sur l'image en pause
  let lastTest = null;       // dernière détection (pour re-classer quand la tolérance change)
  let raf = 0;
  const layers = [];         // couches de dessin ajoutées par l'assistant : fn(ctx, { toView, rect })
  let pointer = null;        // gestionnaires de souris de l'assistant : { click, down, move, up, cursor }

  /* ---------- données du projet ---------- */
  function ai() {
    const p = state.project;
    if (!p.ai) p.ai = { L: 40, W: 20, dir: 1, flip: true, camera: "mobile", calibrations: [], kits: {}, frames: null, stats: null, suggestedEvents: [], settings: { fps: 3, tiles: 1, t0: 0, t1: 0, tol: 42 } };
    return p.ai;
  }
  const hasAi = () => !!state.project.ai;
  function dirAt(t) {
    const a = ai();
    const second = a.flip && typeof state.project.secondHalfStart === "number" && t >= state.project.secondHalfStart;
    return (a.dir || 1) * (second ? -1 : 1);
  }
  function refs() {
    const a = ai(), out = {};
    Object.keys(a.kits).forEach((k) => { if (a.kits[k] && a.kits[k].length) out[k] = K.average(a.kits[k]); });
    return out;
  }
  const L = () => ai().L, W = () => ai().W;

  /* ---------- géométrie de l'affichage ---------- */
  function boxSize() { const b = $("video-box"); return { w: b.clientWidth, h: b.clientHeight }; }
  function videoRect() {
    const { w, h } = boxSize();
    const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
    const s = Math.min(w / vw, h / vh);
    return { s, x: (w - vw * s) / 2, y: (h - vh * s) / 2, vw, vh };
  }
  function toVideo(ox, oy) { const r = videoRect(); return [(ox - r.x) / r.s, (oy - r.y) / r.s]; }
  function toView(ix, iy) { const r = videoRect(); return [ix * r.s + r.x, iy * r.s + r.y]; }

  function sizeOverlay() {
    const c = $("overlay"), { w, h } = boxSize();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    return dpr;
  }

  /* ---------- tracés ---------- */
  function courtPolylines() {
    const l = L(), w = W(), cy = w / 2, arc = (cx, cyy, r, a0, a1) => { const o = []; for (let i = 0; i <= 14; i++) { const a = ((a0 + ((a1 - a0) * i) / 14) * Math.PI) / 180; o.push([cx + r * Math.cos(a), cyy + r * Math.sin(a)]); } return o; };
    const left = arc(0, cy - 1.5, 6, -90, 0).concat(arc(0, cy + 1.5, 6, 0, 90));
    const right = left.map((p) => [l - p[0], p[1]]);
    return [[[0, 0], [l, 0], [l, w], [0, w], [0, 0]], [[l / 2, 0], [l / 2, w]], arc(l / 2, cy, 3, 0, 360), left, right];
  }

  function drawOverlay() {
    const c = $("overlay");
    if (c.hidden) return;
    const dpr = sizeOverlay();
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!video.videoWidth) return;
    const r = videoRect();
    const a = state.project.ai;
    const t = video.currentTime || 0;
    // aperçu du terrain calibré
    if (a && $("ov-court").checked) {
      const cal = P.calibrationAt(a.calibrations, t);
      if (cal) {
        const Hi = HG.invert(cal.H);
        ctx.strokeStyle = "rgba(0,230,255,.9)"; ctx.lineWidth = 2;
        courtPolylines().forEach((pl) => {
          ctx.beginPath();
          pl.forEach((p, i) => { const q = HG.apply(Hi, p[0], p[1]); const v = toView(q[0], q[1]); if (i) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); });
          ctx.stroke();
        });
      }
    }
    // joueurs détectés
    const f = preview || live || (frames.length ? P.frameNear(frames, t, 0.8) : null);
    if (f && ($("ov-boxes").checked || $("ov-sil").checked)) {
      f.players.forEach((p) => {
        if (!p.b || p.b.length < 4) return;
        const x1 = (p.b[0] / 1000) * r.vw, y1 = (p.b[1] / 1000) * r.vh, x2 = (p.b[2] / 1000) * r.vw, y2 = (p.b[3] / 1000) * r.vh;
        const a1 = toView(x1, y1), a2 = toView(x2, y2);
        const col = TEAM_COLOR[p.team] || TEAM_COLOR.UNK;
        const w = a2[0] - a1[0], h = a2[1] - a1[1];
        if ($("ov-sil").checked) {
          ctx.fillStyle = col + "66"; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(a1[0] + w / 2, a1[1] + h * 0.1, w * 0.22, h * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.roundRect(a1[0] + w * 0.1, a1[1] + h * 0.2, w * 0.8, h * 0.8, w * 0.25); ctx.fill(); ctx.stroke();
        }
        if ($("ov-boxes").checked) {
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(a1[0], a1[1], w, h);
        }
        if ($("ov-ids").checked) {
          const label = p.team === "UNK" ? "non reconnu" : p.team === "REF" ? "arbitre" : (p.team === "A" ? "" : p.team === "B" ? "Adv. " : p.team === "GKA" ? "GB " : "GB adv. ") + (p.id != null ? "#" + p.id : (p.team === "A" ? "Mon équipe" : ""));
          ctx.font = "600 12px 'Segoe UI',Arial,sans-serif";
          const tw = ctx.measureText(label).width + 8;
          ctx.fillStyle = col; ctx.fillRect(a1[0], a1[1] - 16, tw, 16);
          ctx.fillStyle = "#fff"; ctx.fillText(label, a1[0] + 4, a1[1] - 4);
        }
      });
    }
    // repères de calibrage
    pts.forEach((p) => {
      const v = toView(p.ix, p.iy);
      ctx.strokeStyle = "#00e6ff"; ctx.fillStyle = "#00e6ff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v[0], v[1], 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(v[0] - 10, v[1]); ctx.lineTo(v[0] + 10, v[1]); ctx.moveTo(v[0], v[1] - 10); ctx.lineTo(v[0], v[1] + 10); ctx.stroke();
      ctx.font = "600 12px 'Segoe UI',Arial,sans-serif"; ctx.fillText(p.label.slice(0, 28), v[0] + 10, v[1] - 8);
    });
    if (pip) {
      (pip.points || []).forEach((q) => {
        const v = toView(q.ix, q.iy);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(v[0], v[1], 8, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(v[0], v[1], 9.5, 0, Math.PI * 2); ctx.stroke();
      });
    }
    layers.forEach((fn) => fn(ctx, { toView, rect: r }));
    if (placing || pickRole || pip) {
      ctx.fillStyle = "rgba(11,18,32,.85)"; ctx.fillRect(8, 8, Math.min(560, boxSize().w - 16), 26);
      ctx.fillStyle = "#fff"; ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
      const label = placing ? "Cliquez sur : " + (HG.landmarks(L(), W()).find((l) => l.id === placing) || {}).label
        : pip ? "Pipette (" + (ROLES.find((q) => q[0] === pip.role) || [])[1] + ") : cliquez sur " + PARTS[pip.part] + " d'un joueur (Échap : annuler)"
        : "Cliquez sur un joueur : " + (ROLES.find((q) => q[0] === pickRole) || [])[1];
      ctx.fillText(label, 16, 26);
    }
  }

  function updateOverlayMode() {
    const c = $("overlay");
    c.hidden = !video.videoWidth || video.hidden;
    c.classList.toggle("pick", !!(placing || pickRole || pip || pointer));
    drawOverlay();
  }

  /* ---------- mini-carte (vue de dessus) ---------- */
  function orient(f) {
    const flip = dirAt(f.t) < 0, l = L(), w = W();
    return { t: f.t, ball: f.ball ? (flip ? { x: l - f.ball.x, y: w - f.ball.y } : f.ball) : null,
      players: f.players.map((p) => Object.assign({}, p, flip ? { x: l - p.x, y: w - p.y } : {})) };
  }

  function drawMinimap() {
    const box = $("minimap-box");
    const a = state.project.ai;
    const has = frames.length || live;
    box.hidden = !has;
    if (!has) return;
    const t = video.currentTime || 0;
    const f = live || P.frameNear(frames, t, 1.2);
    $("mm-time").textContent = App.fmt(live ? live.t : t);
    const trails = {};
    if (!live && f && $("ov-trails").checked) {
      frames.forEach((g) => {
        if (g.t > f.t || g.t < f.t - 3) return;
        const o = orient(g);
        o.players.forEach((p) => { const arr = trails[p.id] || (trails[p.id] = Object.assign([], { team: p.team === "B" || p.team === "GKB" ? "B" : "A" })); arr.push([p.x, p.y]); });
      });
    }
    const canvas = $("minimap"), ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const heat = $("ov-heat").checked && a && a.stats ? a.stats.heat : null;
    E.drawOps(ctx, E.liveOps(f ? orient(f) : null, { showIds: $("ov-ids").checked, trails, heat }), canvas.width / E.COURT_VIEW.w, E.COURT_VIEW);
  }

  function refreshLive() {
    drawOverlay(); drawMinimap();
  }
  function loop() { refreshLive(); raf = !video.paused && !video.ended ? requestAnimationFrame(loop) : 0; }

  /* ---------- encadré « Prochaine étape » : dit à l'utilisateur quoi faire ---------- */
  function renderNext() {
    const box = $("ai-next"), a = state.project && state.project.ai;
    if (!box || !a) return;
    let title, steps = [], done = false;
    if (!App.isVideoReady()) {
      title = "Étape 0 — Charger la vidéo";
      steps = ["À gauche, cliquez sur « Choisir une vidéo… » et sélectionnez votre fichier de match."];
    } else if (!a.calibrations.length) {
      title = "Étape 1 — Montrer le terrain au programme";
      steps = [
        "Mettez la vidéo en pause (Espace) sur une image où l'on voit bien les lignes noires du terrain.",
        "Ci-dessous, dans « 1. Terrain », choisissez un repère dans la liste (ex. « Point de penalty gauche »).",
        "Cliquez « Placer sur l'image », puis cliquez à cet endroit sur la vidéo. Recommencez pour 4 repères ou plus, bien répartis.",
        "Cliquez « Valider le calibrage »."
      ];
    } else if (!(refs().A && refs().B)) {
      title = "Étape 2 — Apprendre les couleurs des équipes";
      steps = [
        "Mettez la vidéo en pause sur une image où vos joueurs et leurs adversaires sont bien visibles.",
        "Dans « 2. Tenues », ligne « Mon équipe », cliquez « Pipette », puis cliquez le maillot d'un de vos joueurs, puis son short, ses chaussettes et ses manches (« Passer » si inutile), puis « Terminer ».",
        "Faites la même chose sur la ligne « Adversaire ».",
        "Cliquez « Tester la reconnaissance sur cette image » pour vérifier."
      ];
    } else if (!(a.frames || frames.length)) {
      title = "Étape 3 — Lancer l'analyse";
      steps = [
        "Dans « 3. Analyse », réglez « De » et « À » (commencez par 1 à 2 minutes pour tester).",
        "Cliquez « Lancer l'analyse » et patientez (la durée estimée est affichée)."
      ];
    } else {
      done = true;
      title = "Analyse terminée ✔";
      steps = [
        "Dans « 4. Résultats », cochez Cadres, Silhouettes ou Trajectoires pour voir les joueurs sur la vidéo.",
        "Acceptez ou écartez les « Erreurs suggérées ».",
        "Ouvrez ensuite l'onglet « Rapport & solutions », puis « Corrections animées » pour obtenir les vidéos à partager."
      ];
    }
    box.className = "ai-next" + (done ? " done" : "");
    box.innerHTML = "<b class=\"t\">" + esc(title) + "</b>" + (steps.length === 1 ? esc(steps[0]) : "<ol>" + steps.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>");
  }

  /* ---------- volet de droite ---------- */
  function setChip(id, text, cls) { const e = $(id); e.textContent = text; e.className = "chip " + (cls || ""); }

  function renderPoints() {
    const l = $("ai-points");
    l.innerHTML = "";
    pts.forEach((p) => {
      const d = document.createElement("div"); d.className = "ai-item";
      d.innerHTML = "<span class=\"grow\">" + esc(p.label) + "</span><button title=\"Retirer\">×</button>";
      d.querySelector("button").addEventListener("click", () => { pts = pts.filter((q) => q.id !== p.id); renderPoints(); refreshLive(); });
      l.appendChild(d);
    });
  }

  function renderCalibs() {
    const a = ai(), l = $("ai-calibs");
    l.innerHTML = "";
    a.calibrations.forEach((c, i) => {
      const d = document.createElement("div"); d.className = "ai-item";
      d.innerHTML = "<span class=\"grow\">Calibrage à " + App.fmt(c.t) + " — erreur " + c.err.toFixed(2) + " m (" + c.points.length + " repères)</span><button data-a=\"go\" title=\"Aller à ce moment\">⏵</button><button data-a=\"del\" title=\"Supprimer\">×</button>";
      d.querySelector("[data-a=go]").addEventListener("click", () => App.seek(c.t));
      d.querySelector("[data-a=del]").addEventListener("click", () => { a.calibrations.splice(i, 1); renderCalibs(); App.changed(); refreshLive(); });
      l.appendChild(d);
    });
    setChip("ai-s1-state", a.calibrations.length ? a.calibrations.length + " calibrage(s)" : "À faire", a.calibrations.length ? "ok" : "warn");
    renderNext();
  }

  function fillLandmarks() {
    const sel = $("ai-landmark"), cur = sel.value;
    sel.innerHTML = "";
    HG.landmarks(L(), W()).forEach((l) => { const o = document.createElement("option"); o.value = l.id; o.textContent = l.label; sel.appendChild(o); });
    if (cur) sel.value = cur;
  }

  function renderKits() {
    const a = ai(), box = $("ai-kits"), r = refs();
    box.innerHTML = "";
    ROLES.forEach(([key, label, color]) => {
      const sw = r[key] ? K.swatches(r[key]) : null, n = (a.kits[key] || []).length;
      const row = document.createElement("div"); row.className = "kit-row";
      row.innerHTML = "<span><span class=\"sw\" style=\"background:" + color + ";width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px\"></span>" + esc(label) + (n ? " <span class=\"muted\">(" + n + " échantillon" + (n > 1 ? "s" : "") + ")</span>" : "") + "</span>" +
        "<span class=\"kit-sw\">" + (sw ? "<i class=\"sw\" style=\"background:" + sw.shirt + "\" title=\"Maillot\"></i><i class=\"sw\" style=\"background:" + sw.shorts + "\" title=\"Short\"></i><i class=\"sw\" style=\"background:" + sw.socks + "\" title=\"Chaussettes\"></i>" + (sw.trim ? "<i class=\"sw\" style=\"background:" + sw.trim + "\" title=\"Manches / liseré\"></i>" : "") : "") + "</span>" +
        "<span class=\"btns\"><button data-a=\"pip\" title=\"Cliquer vous-même le maillot, le short, les chaussettes\">Pipette</button><button data-a=\"pick\" title=\"Cliquer un joueur : couleurs lues automatiquement\">Auto</button>" + (n ? "<button data-a=\"clear\" class=\"ghost\" title=\"Effacer\">×</button>" : "") + "</span>";
      row.querySelector("[data-a=pick]").addEventListener("click", () => startPick(key));
      row.querySelector("[data-a=pip]").addEventListener("click", () => startPipette(key));
      const c = row.querySelector("[data-a=clear]");
      if (c) c.addEventListener("click", () => { delete a.kits[key]; renderKits(); App.changed(); });
      box.appendChild(row);
    });
    const ok = !!(r.A && r.B);
    setChip("ai-s2-state", ok ? "Équipes reconnues" : "Choisir au moins 2 équipes", ok ? "ok" : "warn");
    renderNext();
  }

  function renderStats() {
    const a = state.project.ai, box = $("ai-stats");
    box.innerHTML = "";
    if (!a || !a.stats) { setChip("ai-s4-state", "Pas encore d'analyse", ""); renderNext(); return; }
    const st = a.stats;
    const cells = [
      ["Possession (moi)", st.possession && st.possession.known ? st.possession.A + " %" : "n.d."],
      ["Possession (adv.)", st.possession && st.possession.known ? st.possession.B + " %" : "n.d."],
      ["Durée analysée", App.fmt(st.duration)],
      ["Profondeur moy.", st.shape ? st.shape.depth + " m" : "n.d."],
      ["Largeur moy.", st.shape ? st.shape.width + " m" : "n.d."],
      ["Images", String(frames.length)]
    ];
    cells.forEach(([k, v]) => { const d = document.createElement("div"); d.className = "st"; d.innerHTML = esc(k) + "<b>" + esc(v) + "</b>"; box.appendChild(d); });
    setChip("ai-s4-state", frames.length + " images", "ok");
    renderNext();
  }

  function renderSuggestions() {
    const a = state.project.ai, list = $("ai-sugg");
    list.innerHTML = "";
    const items = (a && a.suggestedEvents) || [];
    $("ai-sugg-count").textContent = "(" + items.length + ")";
    if (!items.length) { list.innerHTML = "<p class=\"muted\" style=\"padding:6px\">Aucune erreur en attente.</p>"; return; }
    items.forEach((e) => {
      const row = document.createElement("div"); row.className = "ev";
      row.innerHTML = "<button class=\"t\">" + App.fmt(e.t) + "</button><div><div class=\"lbl\"><span class=\"dot\" style=\"background:" + App.phaseColor(e.type) + "\"></span>" + esc(App.labelOf(e.type)) + "</div><div class=\"chips\">" + esc(e.note || "") + "</div></div><div class=\"btns\"><button data-a=\"ok\" title=\"Ajouter aux événements\">✔</button><button data-a=\"no\" title=\"Écarter\">✖</button></div>";
      row.querySelector(".t").addEventListener("click", () => App.seek(Math.max(0, e.t - 3)));
      row.querySelector("[data-a=ok]").addEventListener("click", () => acceptSuggestion(e));
      row.querySelector("[data-a=no]").addEventListener("click", () => { a.suggestedEvents = a.suggestedEvents.filter((x) => x.sid !== e.sid); a.suggested = a.suggestedEvents.length; renderSuggestions(); App.changed(); });
      list.appendChild(row);
    });
  }

  /* Ajoute des suggestions aux événements du projet, avec une vignette de la vidéo à l'instant de l'erreur. */
  async function acceptSuggestions(list) {
    const p = state.project, a = p.ai;
    const todo = list.filter((e) => !p.events.some((x) => x.type === e.type && Math.abs(x.t - e.t) < 2));
    let thumbs = [];
    if (todo.length && App.getVideoUrl() && App.isVideoReady()) {
      try { thumbs = await P.captureFrames(App.getVideoUrl(), todo.map((e) => e.t), 320); } catch (_e) { thumbs = []; }
    }
    todo.forEach((e, i) => {
      p.events.push({ id: App.uid(), t: Math.round(e.t * 10) / 10, type: e.type, zone: e.zone, side: e.side, outcome: e.outcome || "AUCUN", system: p.defaultSystem, note: e.note || "", auto: true, thumb: thumbs[i] || null });
    });
    p.events.sort((x, y) => x.t - y.t);
    const sids = new Set(list.map((e) => e.sid));
    a.suggestedEvents = a.suggestedEvents.filter((x) => !sids.has(x.sid));
    a.suggested = a.suggestedEvents.length;
    App.renderEvents(); App.renderTimeline(); App.renderPalette(); renderSuggestions(); App.changed();
  }
  const acceptSuggestion = (e) => acceptSuggestions([e]);

  /* ---------- calibrage ---------- */
  function startPlacing() {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    video.pause();
    pickRole = null; pip = null; renderPipette();
    placing = $("ai-landmark").value;
    updateOverlayMode();
  }

  function validateCalibration() {
    const a = ai(), msg = $("ai-calib-msg");
    if (!App.isVideoReady()) { msg.textContent = "Chargez d'abord une vidéo."; return false; }
    if (pts.length < 4) { msg.textContent = "Placez au moins 4 repères (" + pts.length + " pour l'instant)."; return false; }
    const lm = Object.fromEntries(HG.landmarks(L(), W()).map((l) => [l.id, l]));
    const src = pts.map((p) => [p.ix, p.iy]), dst = pts.map((p) => [lm[p.id].x, lm[p.id].y]);
    const area = HG.spread(src) / (video.videoWidth * video.videoHeight);
    if (area < 0.04) { msg.textContent = "Les repères sont trop regroupés : répartissez-les sur tout le terrain visible."; return false; }
    let H, err;
    try { H = HG.solve(src, dst); err = HG.reprojectionError(H, src, dst); }
    catch (e) { msg.textContent = e.message; return false; }
    if (!isFinite(err) || err > 1.5) { msg.textContent = "Calibrage imprécis (erreur " + (isFinite(err) ? err.toFixed(2) : "?") + " m). Replacez les repères avec plus de précision ou ajoutez-en d'autres."; return false; }
    const t = Math.round(video.currentTime * 10) / 10;
    a.calibrations = a.calibrations.filter((c) => Math.abs(c.t - t) > 0.5).concat([{ t, points: pts.map((p) => ({ id: p.id, ix: p.ix, iy: p.iy })), H, err }]).sort((x, y) => x.t - y.t);
    pts = []; placing = null;
    msg.textContent = "Calibrage enregistré (erreur moyenne " + err.toFixed(2) + " m). Cochez « Terrain » pour vérifier le tracé sur l'image.";
    $("ov-court").checked = true;
    renderPoints(); renderCalibs(); updateOverlayMode(); App.changed();
    return true;
  }

  /* ---------- choix des tenues ---------- */
  async function startPick(role) {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    if (!api) { App.toast("Fonction disponible dans l'application uniquement.", true); return; }
    video.pause();
    placing = null; pickRole = role; pip = null; preview = null; renderPipette();
    updateOverlayMode();
  }

  async function handlePick(ix, iy) {
    const role = pickRole;
    pickRole = null; updateOverlayMode();
    App.toast("Détection en cours…");
    try {
      const res = await P.detectAt(video, api, 1);
      const cx = ix * res.scale, cy = iy * res.scale;
      const persons = res.dets.filter((d) => d.cls === 0);
      let best = null, bs = Infinity;
      persons.forEach((d) => {
        const inside = cx >= d.x1 && cx <= d.x2 && cy >= d.y1 && cy <= d.y2;
        const dist = inside ? (d.x2 - d.x1) * (d.y2 - d.y1) : Infinity;
        if (dist < bs) { bs = dist; best = d; }
      });
      if (!best) {
        let md = 80 * res.scale + 1;
        persons.forEach((d) => { const dd = Math.hypot((d.x1 + d.x2) / 2 - cx, (d.y1 + d.y2) / 2 - cy); if (dd < md) { md = dd; best = d; } });
      }
      if (!best) { App.toast("Aucun joueur détecté à cet endroit. Cliquez sur le joueur lui-même.", true); return; }
      const feat = K.sample(res.img, [best.x1, best.y1, best.x2, best.y2]);
      if (!feat) { App.toast("Joueur trop petit pour lire la tenue : choisissez une image où il est plus grand.", true); return; }
      const a = ai();
      (a.kits[role] = a.kits[role] || []).push(feat);
      renderKits(); App.changed();
      App.toast("Tenue enregistrée.");
    } catch (e) { App.toast("Détection impossible : " + e.message, true); }
  }

  /* ---------- pipette ---------- */
  function grabFrame() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.min(1, 1280 / Math.max(vw, vh * (16 / 9)));
    const w = Math.max(2, Math.round(vw * scale)), h = Math.max(2, Math.round(vh * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    return { img: ctx.getImageData(0, 0, w, h), scale };
  }

  function startPipette(role) {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    video.pause();
    placing = null; pickRole = null; preview = null;
    pip = { role, parts: { shirt: null, shorts: null, socks: null, trim: null }, part: "shirt", points: [] };
    renderPipette(); updateOverlayMode();
  }

  function renderPipette() {
    const box = $("ai-pipette");
    box.hidden = !pip;
    if (!pip) return;
    $("pp-title").textContent = "Pipette — " + (ROLES.find((q) => q[0] === pip.role) || [])[1];
    box.querySelectorAll("button[data-part]").forEach((b) => {
      const part = b.dataset.part, lab = pip.parts[part];
      b.classList.toggle("cur", part === pip.part);
      b.innerHTML = esc(b.textContent.replace(/\s*$/, "")) + (lab ? "<i class=\"sw\" style=\"background:" + K.toHex(lab) + "\"></i>" : "");
    });
    $("pp-hint").textContent = "Cliquez sur " + PARTS[pip.part] + " d'un joueur de l'image. Short, chaussettes et manches/liseré sont facultatifs (les manches aident quand les deux maillots sont sombres) : « Passer » ou « Terminer ». Plusieurs joueurs possibles : relancez la pipette.";
  }

  function nextPart() {
    const order = ["shirt", "shorts", "socks", "trim"], i = order.indexOf(pip.part);
    if (i >= order.length - 1) finishPipette(); else { pip.part = order[i + 1]; renderPipette(); drawOverlay(); }
  }

  function pipetteClick(ix, iy) {
    const g = grabFrame();
    const lab = K.pipette(g.img, ix * g.scale, iy * g.scale, 3);
    if (!lab) { App.toast("Impossible de lire la couleur ici.", true); return; }
    pip.parts[pip.part] = lab;
    pip.points.push({ ix, iy });
    nextPart();
  }

  function finishPipette() {
    if (!pip) return;
    if (!pip.parts.shirt) { App.toast("Cliquez d'abord sur le maillot (partie obligatoire).", true); return; }
    const a = ai(), f = K.fromParts(pip.parts.shirt, pip.parts.shorts, pip.parts.socks, pip.parts.trim);
    (a.kits[pip.role] = a.kits[pip.role] || []).push(f);
    pip = null; renderPipette(); renderKits(); updateOverlayMode(); App.changed();
    App.toast("Tenue enregistrée.");
    if (lastTest) renderPreview();
  }

  function cancelPipette() { pip = null; renderPipette(); updateOverlayMode(); }

  /* ---------- test de la reconnaissance sur l'image en pause ---------- */
  function tol() { return Number($("ai-tol").value) || 42; }

  function renderPreview() {
    if (!lastTest) return;
    const r = refs(), res = lastTest;
    const counts = {};
    const players = res.dets.filter((d) => d.cls === 0).map((d) => {
      const feat = K.sample(res.img, [d.x1, d.y1, d.x2, d.y2]);
      K.addAccents(feat, res.img, [d.x1, d.y1, d.x2, d.y2], r);
      const cls = K.classify(feat, r, { reject: tol() });
      counts[cls.team] = (counts[cls.team] || 0) + 1;
      return { id: null, team: cls.team, b: [Math.round((d.x1 / res.width) * 1000), Math.round((d.y1 / res.height) * 1000), Math.round((d.x2 / res.width) * 1000), Math.round((d.y2 / res.height) * 1000)] };
    });
    preview = { t: video.currentTime, players, ball: null };
    const names = { A: "Mon équipe", B: "Adversaire", GKA: "Mon gardien", GKB: "Gardien adverse", REF: "Arbitre", UNK: "Non reconnus" };
    $("ai-test-msg").textContent = players.length ? Object.keys(counts).map((k) => names[k] + " : " + counts[k]).join(" · ") + " — ajustez la tolérance si besoin." : "Aucun joueur détecté sur cette image.";
    $("ov-boxes").checked = true;
    drawOverlay();
  }

  async function testRecognition() {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    if (!api) { App.toast("Fonction disponible dans l'application uniquement.", true); return; }
    const r = refs();
    if (!r.A && !r.B) { $("ai-test-msg").textContent = "Choisissez d'abord au moins « Mon équipe » (pipette ou auto)."; return; }
    video.pause();
    $("ai-test-msg").textContent = "Détection en cours…";
    try {
      lastTest = await P.detectAt(video, api, Number($("ai-tiles").value));
      renderPreview();
    } catch (e) { $("ai-test-msg").textContent = "Détection impossible : " + e.message; }
  }

  /* ---------- analyse ---------- */
  function readRange() {
    const t0 = App.parseTime($("ai-t0").value), t1 = App.parseTime($("ai-t1").value);
    if (t0 == null || t1 == null || t1 <= t0) return null;
    return [t0, t1];
  }

  const SEC_KEY = "fsal.secPerSample";
  let engineKind = "cpu";        // moteur du détecteur (« dml » = carte graphique) : la durée mesurée est mémorisée pour chacun
  let engineBlocked = false;     // détecteur indisponible : le bouton d'analyse reste désactivé
  const secKey = () => (engineKind === "dml" ? SEC_KEY + ".gpu" : SEC_KEY);
  function secPerSample() {
    const def = engineKind === "dml" ? 0.08 : 0.35;
    try { const v = Number(localStorage.getItem(secKey())); return v > 0.005 && v < 30 ? v : def; } catch (_e) { return def; }
  }
  function updateEstimate() {
    const r = readRange(), e = $("ai-est");
    if (!r) { e.textContent = ""; return; }
    const n = Math.ceil((r[1] - r[0]) * Number($("ai-fps").value)) * Number($("ai-tiles").value);
    e.textContent = "Durée estimée : environ " + fmtEta(n * secPerSample()) + " (" + n + " détections). Pour un match entier, analysez d'abord un extrait ou choisissez « Rapide ».";
  }

  function fmtEta(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s"; }

  async function runAnalysis(opts) {
    const a = ai(), msg = $("ai-run-msg");
    let okRun = false;
    if (running) return false;
    if (!App.isVideoReady()) { msg.textContent = "Chargez d'abord une vidéo."; return false; }
    if (!a.calibrations.length) { msg.textContent = "Calibrez d'abord le terrain (étape 1)."; return false; }
    const r = refs();
    if (!r.A || !r.B) { msg.textContent = "Choisissez au moins « Mon équipe » et « Adversaire » (étape 2)."; return false; }
    const range = readRange();
    if (!range) { msg.textContent = "Plage de temps invalide."; return false; }
    if (frames.length && !(opts && opts.noConfirm) && !confirm("Une analyse existe déjà : la remplacer ?")) return false;
    const fps = Number($("ai-fps").value), tiles = Number($("ai-tiles").value);
    running = true; abort = new AbortController(); live = null;
    const startedAt = Date.now();
    $("ai-run").disabled = true; $("ai-device").disabled = true; $("ai-cancel").hidden = false; $("ai-progress").hidden = false; $("ai-bar").style.width = "0%";
    msg.textContent = "Chargement du modèle de détection…";
    try {
      const camera = $("ai-camera").value;
      const result = await P.analyseVideo({
        url: App.getVideoUrl(), t0: range[0], t1: range[1], fps, tiles, camera, tol: tol(), L: L(), W: W(), calibrations: a.calibrations, refs: r, signal: abort.signal, api,
        onProgress: (p) => {
          $("ai-bar").style.width = Math.round((p.done / p.total) * 100) + "%";
          msg.textContent = "Image " + p.done + " / " + p.total + " — reste environ " + fmtEta(p.eta) + (p.lost ? " (caméra perdue sur cette image)" : "");
          if (FSAI.hooks.progress) FSAI.hooks.progress(p.done / p.total, msg.textContent);
          if (p.frame && p.done % 3 === 0) { live = p.frame; drawMinimap(); }
        }
      });
      live = null; preview = null;
      const out = result.frames;
      frames = out;
      a.camera = camera; a.lost = result.lost; a.notes = result.notes;
      a.frames = P.compactFrames(frames);
      const res = M.analyze(frames, { L: L(), W: W(), dirAt });
      a.stats = Object.assign({}, res.stats);
      a.suggestedEvents = res.events.map((e, i) => Object.assign({ sid: "s" + Date.now().toString(36) + i }, e));
      a.suggested = a.suggestedEvents.length;
      a.settings = { fps, tiles, t0: range[0], t1: range[1], tol: tol() };
      const lostTxt = result.lost.length ? " Caméra perdue : " + result.lost.map((l) => App.fmt(l[0]) + "–" + App.fmt(l[1])).join(", ") + "." : "";
      msg.textContent = (out.length ? "Analyse terminée : " + out.length + " images, " + a.suggestedEvents.length + " erreur(s) suggérée(s)." : "Analyse terminée, mais aucun joueur n'a été retenu : vérifiez le calibrage et les tenues.") + (result.notes.length ? " " + result.notes.join(" ") : "") + lostTxt;
      try { localStorage.setItem(secKey(), String(((Date.now() - startedAt) / 1000) / Math.max(1, out.length ? Math.ceil((range[1] - range[0]) * fps) * tiles : 1))); } catch (_e) { /* stockage indisponible */ }
      renderStats(); renderSuggestions(); refreshLive(); updateEstimate(); App.changed(true);
      okRun = out.length > 0;
    } catch (e) {
      live = null;
      msg.textContent = "Analyse arrêtée : " + e.message;
    } finally {
      running = false; abort = null;
      $("ai-run").disabled = engineBlocked; $("ai-device").disabled = false; $("ai-cancel").hidden = true;
      setTimeout(() => { $("ai-progress").hidden = true; }, 600);
      if (api && api.aiStop) { /* le détecteur reste chargé pour la prochaine analyse */ }
      if (api && api.aiStatus) refreshEngine();   // la carte graphique a pu céder la place au processeur en cours de route
      if (FSAI.hooks.finished) FSAI.hooks.finished(okRun, msg.textContent);
    }
    return okRun;
  }

  /* ---------- moteur de calcul ---------- */
  const ENGINE_WHY = {
    choix: " (réglage « Processeur uniquement »)",
    "plus-rapide": " (la carte graphique n'est pas plus rapide sur cet ordinateur)",
    indisponible: " (aucune carte graphique utilisable)",
    "echec-precedent": " (la carte graphique a posé problème lors d'un essai précédent)",
    "erreur-gpu": " (la carte graphique a cessé de répondre ; l'analyse continue normalement)"
  };
  function engineText(s) {
    const b = s.backend;
    if (b && b.kind === "dml") {
      const gain = b.cpuMs && b.ms ? Math.round(b.cpuMs / b.ms) : 0;
      return "Détecteur prêt : calcul sur la carte graphique" + (b.model === "precis" ? " avec le modèle précis" : "") + (gain >= 2 ? " (environ " + gain + " fois plus rapide que le processeur)" : "") + ".";
    }
    return "Détecteur prêt : calcul sur le processeur, " + s.cpus + " cœurs" + ((b && ENGINE_WHY[b.reason]) || "") + ".";
  }
  function refreshEngine() {
    const e = $("ai-status");
    if (!e.textContent) e.textContent = "Préparation du détecteur… (au premier lancement, la carte graphique est testée : jusqu'à une minute)";
    return api.aiStatus().then((s) => {
      if (s.device) $("ai-device").value = s.device;
      if (!s.modelPresent) { e.className = "ai-status bad"; e.textContent = "Modèle de détection introuvable : l'analyse IA est indisponible. Réinstallez l'application."; engineBlocked = true; $("ai-run").disabled = true; }
      else if (s.engineError) { e.className = "ai-status bad"; e.textContent = "Le détecteur n'a pas pu démarrer : " + s.engineError + " (sous Windows, installez « Microsoft Visual C++ Redistributable 2015-2022 » puis relancez)."; engineBlocked = true; $("ai-run").disabled = true; }
      else {
        engineKind = s.backend && s.backend.kind === "dml" ? "dml" : "cpu";
        e.className = "ai-status"; e.textContent = engineText(s) + " Fonctionne hors ligne : la vidéo ne quitte pas votre ordinateur.";
        if (engineBlocked) { engineBlocked = false; $("ai-run").disabled = running; }
        updateEstimate();
      }
    }).catch(() => {});
  }

  /* ---------- liaison ---------- */
  function syncFromProject() {
    const a = state.project.ai;
    frames = a && a.frames ? P.expandFrames(a.frames) : [];
    live = null; pts = []; placing = null; pickRole = null;
    const d = a || { L: 40, W: 20, dir: 1, flip: true, settings: { fps: 3, tiles: 1, t0: 0, t1: 0 } };
    $("ai-L").value = d.L; $("ai-W").value = d.W; $("ai-dir").value = String(d.dir || 1); $("ai-flip").checked = d.flip !== false;
    $("ai-fps").value = String((d.settings && d.settings.fps) || 3); $("ai-tiles").value = String((d.settings && d.settings.tiles) || 1);
    $("ai-camera").value = d.camera || "mobile"; $("ai-tol").value = String((d.settings && d.settings.tol) || 42); $("ai-tol-v").textContent = "(" + $("ai-tol").value + ")";
    pip = null; preview = null; lastTest = null; renderPipette(); $("ai-test-msg").textContent = "";
    $("ai-t0").value = App.fmt((d.settings && d.settings.t0) || 0);
    $("ai-t1").value = App.fmt((d.settings && d.settings.t1) || state.project.duration || 0);
    fillLandmarks(); renderPoints(); renderCalibs(); renderKits(); renderStats(); renderSuggestions(); updateEstimate();
    $("ai-run-msg").textContent = ""; $("ai-calib-msg").textContent = "";
    updateOverlayMode(); drawMinimap();
  }

  function bindSettings() {
    const upd = () => {
      const a = ai();
      const l = Number($("ai-L").value), w = Number($("ai-W").value);
      if (l >= 25 && l <= 42) a.L = l;
      if (w >= 15 && w <= 25) a.W = w;
      a.dir = Number($("ai-dir").value); a.flip = $("ai-flip").checked; a.camera = $("ai-camera").value;
      a.settings = Object.assign({}, a.settings, { fps: Number($("ai-fps").value), tiles: Number($("ai-tiles").value), tol: tol() });
      fillLandmarks(); App.changed();
    };
    ["ai-L", "ai-W", "ai-dir", "ai-flip", "ai-fps", "ai-tiles", "ai-camera"].forEach((id) => $(id).addEventListener("change", upd));
    $("ai-tol").addEventListener("input", () => { $("ai-tol-v").textContent = "(" + tol() + ")"; if (lastTest) renderPreview(); });
    $("ai-tol").addEventListener("change", upd);
    $("ai-test").addEventListener("click", testRecognition);
    $("pp-cancel").addEventListener("click", cancelPipette);
    $("pp-skip").addEventListener("click", () => { if (pip) nextPart(); });
    $("pp-done").addEventListener("click", finishPipette);
    $("ai-pipette").querySelectorAll("button[data-part]").forEach((b) => b.addEventListener("click", () => { if (pip) { pip.part = b.dataset.part; renderPipette(); drawOverlay(); } }));
    ["ai-t0", "ai-t1", "ai-fps", "ai-tiles"].forEach((id) => $(id).addEventListener("input", updateEstimate));
    $("ai-t0").addEventListener("change", updateEstimate); $("ai-t1").addEventListener("change", updateEstimate);
    ["ov-boxes", "ov-sil", "ov-ids", "ov-trails", "ov-heat", "ov-court"].forEach((id) => $(id).addEventListener("change", refreshLive));
  }

  function init() {
    // volets
    document.querySelectorAll("#seg button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#seg button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + b.dataset.pane));
    }));
    $("ai-place").addEventListener("click", startPlacing);
    $("ai-validate").addEventListener("click", validateCalibration);
    $("ai-run").addEventListener("click", runAnalysis);
    $("ai-cancel").addEventListener("click", () => { if (abort) abort.abort(); });
    $("ai-accept-all").addEventListener("click", () => {
      const a = state.project.ai; if (!a || !a.suggestedEvents.length) return;
      acceptSuggestions(a.suggestedEvents.slice());
    });
    $("ai-clear-sugg").addEventListener("click", () => { const a = state.project.ai; if (!a) return; a.suggestedEvents = []; a.suggested = 0; renderSuggestions(); App.changed(); });
    const inVideo = (e) => { const [ix, iy] = toVideo(e.offsetX, e.offsetY); return { ix, iy, ok: ix >= 0 && iy >= 0 && ix <= video.videoWidth && iy <= video.videoHeight }; };
    ["down", "move", "up"].forEach((n) => $("overlay").addEventListener("pointer" + n, (e) => {
      if (!pointer || !pointer[n]) return;
      const q = inVideo(e);
      pointer[n](q.ix, q.iy, q.ok, e);
    }));
    $("overlay").addEventListener("click", (e) => {
      const [ix, iy] = toVideo(e.offsetX, e.offsetY);
      if (pointer && pointer.click) { pointer.click(ix, iy, ix >= 0 && iy >= 0 && ix <= video.videoWidth && iy <= video.videoHeight, e); return; }
      if (ix < 0 || iy < 0 || ix > video.videoWidth || iy > video.videoHeight) return;
      if (placing) {
        const lm = HG.landmarks(L(), W()).find((l) => l.id === placing);
        pts = pts.filter((p) => p.id !== placing).concat([{ id: placing, label: lm.label, ix, iy }]);
        const order = HG.landmarks(L(), W()).map((l) => l.id);
        const next = order.find((id) => !pts.some((p) => p.id === id));
        const placedId = placing;
        placing = null; renderPoints();
        if (next) $("ai-landmark").value = next;
        updateOverlayMode();
        if (FSAI.hooks.pointPlaced) FSAI.hooks.pointPlaced(placedId);
      } else if (pip) pipetteClick(ix, iy);
      else if (pickRole) handlePick(ix, iy);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && (placing || pickRole || pip)) { placing = null; pickRole = null; if (pip) cancelPipette(); else updateOverlayMode(); } });
    ["loadedmetadata", "seeked", "pause", "timeupdate", "emptied"].forEach((ev) => video.addEventListener(ev, () => {
      if (preview && ev === "seeked" && lastTest && Math.abs(video.currentTime - preview.t) > 0.2) { preview = null; lastTest = null; $("ai-test-msg").textContent = ""; }
      if (ev === "loadedmetadata" || ev === "emptied") updateOverlayMode(); else refreshLive();
    }));
    ["loadedmetadata", "emptied", "error"].forEach((ev) => video.addEventListener(ev, () => setTimeout(renderNext, 0)));
    video.addEventListener("play", () => { preview = null; lastTest = null; $("ai-test-msg").textContent = ""; });
    video.addEventListener("play", () => { if (!raf) raf = requestAnimationFrame(loop); });
    window.addEventListener("resize", refreshLive);
    if (window.ResizeObserver) new ResizeObserver(refreshLive).observe($("video-box"));
    App.hooks.onLoad = syncFromProject;
    bindSettings();
    fillLandmarks(); renderCalibs(); renderKits(); renderStats(); renderSuggestions();
    video.addEventListener("loadedmetadata", () => {
      const a = state.project.ai;
      if (!a || !a.settings || !a.settings.t1) {
        $("ai-t1").value = App.fmt(video.duration);
        if (video.videoHeight > video.videoWidth) { $("ai-tiles").value = "2"; $("ai-run-msg").textContent = "Vidéo verticale : précision « Renforcée » sélectionnée pour mieux voir les joueurs lointains."; }
      }
      updateEstimate();
    });
    if (api && api.aiStatus) {
      refreshEngine();
      $("ai-device").addEventListener("change", async () => {
        const sel = $("ai-device");
        if (running || !api.aiSetDevice) return;
        sel.disabled = true;
        const e = $("ai-status");
        e.className = "ai-status"; e.textContent = "Changement du moteur de calcul…";
        try { const r = await api.aiSetDevice(sel.value); if (r && r.error) $("ai-run-msg").textContent = r.error; } catch (_e) { /* l'état ci-dessous indique le moteur réel */ }
        await refreshEngine();
        sel.disabled = running;
      });
    } else { $("ai-status").textContent = "L'analyse IA est disponible dans l'application installée."; $("ai-device").disabled = true; }
    syncFromProject();
  }

  /* Image de la vidéo à l'instant courant, dont le plus grand côté vaut 1024 px (taille attendue par le modèle de découpe). */
  function grabSam() {
    const vw = video.videoWidth, vh = video.videoHeight, k = 1024 / Math.max(vw, vh);
    const w = Math.max(2, Math.round(vw * k)), h = Math.max(2, Math.round(vh * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    return { canvas: c, img: ctx.getImageData(0, 0, w, h), w, h, k, t: video.currentTime, id: "f" + Date.now().toString(36) };
  }

  const FSAI = window.FSAI = {
    hooks: {}, segmentImpl: null,
    ai, refs, grabSam, renderKits, renderStats, renderCalibs, renderPoints, validateCalibration, runAnalysis, updateEstimate,
    addLayer: (fn) => { layers.push(fn); }, setPointer: (p) => { pointer = p; updateOverlayMode(); }, redraw: refreshLive,
    beginPlacing: (id) => { if (!App.isVideoReady()) return false; video.pause(); pickRole = null; pip = null; renderPipette(); placing = id; $("ai-landmark").value = id; updateOverlayMode(); return true; },
    cancelPlacing: () => { placing = null; updateOverlayMode(); },
    getPoints: () => pts.slice(), clearPoints: () => { pts = []; placing = null; renderPoints(); updateOverlayMode(); },
    removePoint: (id) => { pts = pts.filter((q) => q.id !== id); renderPoints(); refreshLive(); },
    clearAnalysis: () => { frames = []; const a = ai(); a.frames = null; a.stats = null; a.suggestedEvents = []; a.suggested = 0; renderStats(); renderSuggestions(); refreshLive(); },
    setRange: (t0, t1) => { $("ai-t0").value = App.fmt(t0); $("ai-t1").value = App.fmt(t1); updateEstimate(); },
    setCamera: (v) => { $("ai-camera").value = v; $("ai-camera").dispatchEvent(new Event("change")); },
    setDirection: (v) => { $("ai-dir").value = String(v); $("ai-dir").dispatchEvent(new Event("change")); },
    setPrecision: (fps, tiles) => { $("ai-fps").value = String(fps); $("ai-tiles").value = String(tiles); $("ai-fps").dispatchEvent(new Event("change")); },
    hasAnalysis: () => frames.length > 0,
    /* Enregistre le calibrage trouvé par l'assistant (remplace les précédents). */
    setCalibration: (cal, t) => {
      const a = ai();
      a.calibrations = [{ t: Math.round(t * 10) / 10, points: cal.points, H: cal.H, err: cal.err }];
      pts = []; placing = null;
      $("ov-court").checked = true;
      renderPoints(); renderCalibs(); updateOverlayMode(); App.changed();
    },
    videoSize: () => ({ w: video.videoWidth, h: video.videoHeight }),
    segment: (req) => (FSAI.segmentImpl ? FSAI.segmentImpl(req) : api.aiSegment(req)),
    detectPersons: async (canvas) => (await P.detectCanvas(canvas, 2, api, { minPerson: 0.3, minBall: 0.12 })).filter((d) => d.cls === 0),
    toggle: (id, on) => { $(id).checked = on; refreshLive(); }
  };

  window.FSApp.ai = { syncFromProject, dirAt, refreshLive, getFrames: () => frames };
  init();
})();
