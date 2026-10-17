/* Volet « Analyse IA » : calibrage du terrain, choix des tenues, analyse de la vidéo, résultats (cadres, mini-carte, erreurs suggérées). */
(function () {
  "use strict";
  const App = window.FSApp;
  const KB = window.FutsalKB, HG = window.FutsalHomography, K = window.FutsalKit, P = window.FutsalPipeline, M = window.FutsalMatch, E = window.FutsalAnim, D = window.FutsalDoubt, BL = window.FutsalBallLabels, Q = window.FutsalQuality;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const video = App.video, api = App.api, state = App.state;

  const ROLES = [["A", "Mon équipe", "#2f6fed"], ["B", "Adversaire", "#e5484d"], ["GKA", "Mon gardien", "#f2b705"], ["GKB", "Gardien adverse", "#ff8a3d"], ["REF", "Arbitre", "#a78bfa"]];
  const TEAM_COLOR = { A: "#3b82f6", B: "#ef4444", GKA: "#f2b705", GKB: "#ff8a3d", REF: "#a78bfa", UNK: "#9aa5a0" };
  const PARTS = { shirt: "le MAILLOT", shorts: "le SHORT", socks: "les CHAUSSETTES", trim: "les MANCHES / le LISERÉ" };
  let pts = [];              // repères en cours de placement : { id, label, ix, iy }
  let placing = null;        // identifiant du repère à placer
  let pickRole = null;       // rôle de tenue à choisir
  let qGroup = null;         // proposition d'appliquer la même réponse aux pistes de la même personne : { team, q, group }
  let qHighlight = null;     // personne désignée par une question : { t, b } (cadre orange sur la vidéo)
  let benchMark = null;      // marquage d'une zone de banc en cours : { t, H, first: [x, y] | null }
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
    c.classList.toggle("fixable", frames.length > 0 && !(placing || pickRole || pip || pointer || benchMark));      // un clic sur un cadre permet de corriger la personne
    const dpr = sizeOverlay();
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!video.videoWidth) return;
    const r = videoRect();
    const a = state.project.ai;
    const t = video.currentTime || 0;
    // aperçu du terrain calibré
    // (tracé seulement si la projection est fiable à cet instant ; sinon un message l'explique, pas de lignes absurdes)
    if (a && $("ov-court").checked) {
      const ch = P.courtH(frames, a.calibrations, a.camera || $("ai-camera").value, t, video.videoWidth, video.videoHeight);
      if (ch && ch.H) {
        const Hi = HG.invert(ch.H), o = toView(0, 0), e = toView(r.vw, r.vh), far = 4;
        ctx.save(); ctx.beginPath(); ctx.rect(o[0], o[1], e[0] - o[0], e[1] - o[1]); ctx.clip();
        ctx.strokeStyle = "rgba(0,230,255,.9)"; ctx.lineWidth = 2;
        courtPolylines().forEach((pl) => {
          let pen = false;
          ctx.beginPath();
          pl.forEach((p) => {
            const q = HG.apply(Hi, p[0], p[1]);
            if (!isFinite(q[0]) || !isFinite(q[1]) || Math.abs(q[0]) > far * r.vw || Math.abs(q[1]) > far * r.vh) { pen = false; return; }
            const v = toView(q[0], q[1]);
            if (pen) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]);
            pen = true;
          });
          ctx.stroke();
        });
        ctx.restore();
      } else if (ch) {
        ctx.fillStyle = "rgba(11,18,32,.85)"; ctx.fillRect(8, 8, Math.min(520, boxSize().w - 16), 26);
        ctx.fillStyle = "#fff"; ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
        ctx.fillText("Terrain non tracé ici : la caméra a bougé depuis le calibrage.", 16, 26);
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
    // personne d'une question du programme : cadre orange sur l'image exacte de la question
    if (qHighlight && Math.abs((video.currentTime || 0) - qHighlight.t) < 0.4 && Array.isArray(qHighlight.polys)) {
      ctx.strokeStyle = "#f97316"; ctx.lineWidth = 3; ctx.setLineDash([8, 5]);
      qHighlight.polys.forEach((pl) => { ctx.beginPath(); pl.forEach((p, k) => { const v = toView(p[0] * r.vw, p[1] * r.vh); if (k) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); }); ctx.closePath(); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    if (qHighlight && Math.abs((video.currentTime || 0) - qHighlight.t) < 0.4 && Array.isArray(qHighlight.b)) {
      const b = qHighlight.b, a1 = toView((b[0] / 1000) * r.vw, (b[1] / 1000) * r.vh), a2 = toView((b[2] / 1000) * r.vw, (b[3] / 1000) * r.vh);
      ctx.strokeStyle = "#f97316"; ctx.lineWidth = 4; ctx.strokeRect(a1[0], a1[1], a2[0] - a1[0], a2[1] - a1[1]);
      ctx.font = "700 13px 'Segoe UI',Arial,sans-serif";
      const label = qHighlight.label || "Question", tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "#f97316"; ctx.fillRect(a1[0], a1[1] - 20, tw, 20);
      ctx.fillStyle = "#fff"; ctx.fillText(label, a1[0] + 5, a1[1] - 5);
    }
    if (qHighlight && qHighlight.ballPt && Math.abs((video.currentTime || 0) - qHighlight.t) < 0.4) {
      const v = toView(qHighlight.ballPt.u, qHighlight.ballPt.v);
      ctx.strokeStyle = "#f97316"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(v[0], v[1], 16, 0, Math.PI * 2); ctx.stroke();
      ctx.font = "700 13px 'Segoe UI',Arial,sans-serif"; const lb = qHighlight.label || "Ballon proposé", tw = ctx.measureText(lb).width + 10;
      ctx.fillStyle = "#f97316"; ctx.fillRect(v[0] - tw / 2, v[1] - 40, tw, 20); ctx.fillStyle = "#fff"; ctx.fillText(lb, v[0] - tw / 2 + 5, v[1] - 25);
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
    // zones des bancs marquées (en coordonnées terrain, redessinées avec le calibrage de l'instant)
    const zones = (a && a.benchZones) || [];
    const projZ = a && (zones.length || benchMark) ? projectionAt(t) : null;
    if (projZ) {
      const Hi = HG.invert(projZ);
      ctx.strokeStyle = "rgba(255,170,0,.95)"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      zones.forEach((z) => {
        ctx.beginPath();
        [[z.x1, z.y1], [z.x2, z.y1], [z.x2, z.y2], [z.x1, z.y2]].forEach((p, i) => { const q = HG.apply(Hi, p[0], p[1]); const v = toView(q[0], q[1]); if (i) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); });
        ctx.closePath(); ctx.stroke();
      });
      ctx.setLineDash([]);
      if (benchMark && benchMark.first) { const q = HG.apply(Hi, benchMark.first[0], benchMark.first[1]); const v = toView(q[0], q[1]); ctx.fillStyle = "rgba(255,170,0,.95)"; ctx.beginPath(); ctx.arc(v[0], v[1], 6, 0, Math.PI * 2); ctx.fill(); }
    }
    if (benchMark) {
      ctx.fillStyle = "rgba(11,18,32,.85)"; ctx.fillRect(8, 8, Math.min(560, boxSize().w - 16), 26);
      ctx.fillStyle = "#fff"; ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
      ctx.fillText(benchMark.first ? "Banc : cliquez le coin opposé (Échap : annuler)" : "Banc : cliquez un coin de la zone du banc (Échap : annuler)", 16, 26);
    }
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
    c.classList.toggle("pick", !!(placing || pickRole || pip || pointer || benchMark));
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

  /* Tenues de référence trop proches : avertissements en clair (noms affichés dans l'interface). */
  function kitWarnings(r) {
    return K.ambiguityMessages(r || refs(), Object.fromEntries(ROLES.map(([key, label]) => [key, label])));
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
    kitWarnings(r).forEach((m) => { const p = document.createElement("p"); p.className = "hint kit-warn"; p.textContent = "⚠ " + m; box.appendChild(p); });
    const ok = !!(r.A && r.B);
    setChip("ai-s2-state", ok ? "Équipes reconnues" : "Choisir au moins 2 équipes", ok ? "ok" : "warn");
    renderNext();
  }

  /* ---------- contrôle qualité : ce qui rend l'analyse fragile, mesuré, avec le remède ---------- */
  function updateQuality(res) {
    const a = state.project.ai;
    if (!a || !Q) return;
    try {
      const oq = D.openQuestions({ doubts: a.doubts || [], subs: a.subs || [], uncertain: a.uncertain || [], memory: memory() }).length;
      a.quality = Q.evaluate({ res, ai: a, project: state.project, L: L(), videoWidth: video.videoWidth, openQuestions: oq, kitWarnings: kitWarnings(refs()) });
    } catch (_e) { /* le contrôle qualité ne doit jamais bloquer l'analyse */ }
  }
  function renderQuality() {
    const box = $("ai-quality"), a = state.project.ai;
    if (!box) return;
    if (!a || !Q || !a.stats) { box.hidden = true; return; }
    if (!a.quality && frames.length) {                              // ancien projet : le contrôle est calculé une fois
      try {
        const s = a.settings || {};
        updateQuality(M.analyze(frames, { L: L(), W: W(), dirAt, lost: a.lost || [], span: [s.t0 || frames[0].t, s.t1 || frames[frames.length - 1].t], bench: benchSetting(), benchSeen: a.benchSeen || null, subAnswers: subAnswers() }));
      } catch (_e) { /* ignoré */ }
    }
    const q = a.quality;
    if (!q) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = "";
    const h = document.createElement("div"); h.className = "q-head " + q.level;
    h.textContent = q.level === "bon" ? "✔ Qualité de l'analyse : aucun problème repéré" : "⚠ Qualité de l'analyse : " + q.items.filter((i) => i.level === "attention").length + " point(s) à améliorer";
    box.appendChild(h);
    q.items.forEach((it) => {
      const row = document.createElement("div"); row.className = "q-item " + it.level;
      const t = document.createElement("b"); t.textContent = it.title; row.appendChild(t);
      const d = document.createElement("div"); d.textContent = it.detail; row.appendChild(d);
      const f = document.createElement("div"); f.className = "muted"; f.textContent = "À faire : " + it.fix; row.appendChild(f);
      box.appendChild(row);
    });
    if (q.good.length) { const g = document.createElement("div"); g.className = "muted q-good"; g.textContent = "Contrôles réussis : " + q.good.join(" · "); box.appendChild(g); }
  }

  function renderStats() {
    const a = state.project.ai, box = $("ai-stats");
    box.innerHTML = "";
    renderQuality();
    if (!a || !a.stats) { setChip("ai-s4-state", "Pas encore d'analyse", ""); renderNext(); return; }
    const st = a.stats;
    const cells = [
      ["Possession (moi)", st.possession && st.possession.known ? st.possession.A + " %" : "n.d."],
      ["Possession (adv.)", st.possession && st.possession.known ? st.possession.B + " %" : "n.d."],
      ["Ballon tenu déduit", st.possession && st.possession.known ? (st.possession.deduced || 0) + " % de la possession" : "n.d."],
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
    const unc = (a && a.uncertain) || [];
    const ctxInfo = a && a.context;
    const uncNote = () => {
      const add = (id, text) => { const p = document.createElement("p"); p.className = "muted"; p.id = id; p.style.padding = "6px"; p.textContent = text; list.appendChild(p); return p; };
      if (unc.length) add("ai-uncertain", unc.length + " situation(s) non signalée(s), contexte incertain : " + unc.map((u) => App.fmt(u.t) + " " + App.labelOf(u.type) + " (" + (u.reason || "ballon pas assez visible") + ")").join(", ") + ".");
      if (ctxInfo && ctxInfo.reliable && ctxInfo.reliable.total > 0) {
        const r = ctxInfo.reliable;
        add("ai-reliable", "Temps de jeu analysé de façon fiable : " + Math.round(r.ratio * 100) + " % (" + App.fmt(r.sec) + " sur " + App.fmt(r.total) + ").");
        const ps = (ctxInfo.passages || []).filter((x) => x.kind !== "tenu");
        if (ps.length) { const p = add("ai-passages", ""); p.innerHTML = ps.map((x) => esc(x.text)).join("<br>"); }
        add("ai-bench-info", ctxInfo.bench
          ? "Bancs des remplaçants : " + (ctxInfo.bench.side === "left" ? "à gauche" : "à droite") + " (" + ctxInfo.bench.source + ") ; les joueurs qui entrent ou sortent par la zone de remplacement ne sont pas comptés comme des erreurs."
          : "Côté des bancs non déduit (trop peu de remplaçants visibles) : choisissez-le dans les réglages ; en attendant, les remplacements volants ne sont pas distingués.");
      }
    };
    if (!items.length) { list.innerHTML = "<p class=\"muted\" style=\"padding:6px\">Aucune erreur en attente.</p>"; uncNote(); renderQuestions(); return; }
    items.forEach((e) => {
      const row = document.createElement("div"); row.className = "ev";
      row.innerHTML = "<button class=\"t\">" + App.fmt(e.t) + "</button><div><div class=\"lbl\"><span class=\"dot\" style=\"background:" + App.phaseColor(e.type) + "\"></span>" + esc(App.labelOf(e.type)) + "</div><div class=\"chips\">" + esc(e.note || "") + (typeof e.ballConf === "number" ? " · ballon vu sur " + Math.round(e.ballConf * 100) + " % des images" : "") + "</div></div><div class=\"btns\"><button data-a=\"ok\" title=\"Ajouter aux événements\">✔</button><button data-a=\"no\" title=\"Écarter\">✖</button></div>";
      row.querySelector(".t").addEventListener("click", () => App.seek(Math.max(0, e.t - 3)));
      row.querySelector("[data-a=ok]").addEventListener("click", () => acceptSuggestion(e));
      row.querySelector("[data-a=no]").addEventListener("click", () => { D.reject(memory(), e); a.suggestedEvents = a.suggestedEvents.filter((x) => x.sid !== e.sid); a.suggested = a.suggestedEvents.length; renderSuggestions(); App.changed(); });
      list.appendChild(row);
    });
    uncNote();
    renderQuestions();
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
  function floorMarks() { return $("ai-marks").checked; }
  function benchSetting() { return $("ai-bench").value; }

  /* ---------- zones des bancs ---------- */
  function renderBenchZones() {
    const z = (state.project.ai && state.project.ai.benchZones) || [];
    $("ai-bench-zones").textContent = z.length ? z.length + " zone(s) de banc marquée(s)" : "aucune zone de banc marquée";
  }
  /* Projection image (pixels vidéo) -> terrain à l'instant t : celle de l'image analysée la plus proche (la caméra a pu
     bouger depuis le calibrage), sinon le calibrage s'il a été fait à cet instant. */
  function projectionAt(t) {
    const f = frames.length ? P.frameNear(frames, t, 0.3) : null;
    if (f && Array.isArray(f.h) && video.videoWidth) return HG.mul3(f.h, [1 / video.videoWidth, 0, 0, 0, 1 / video.videoHeight, 0, 0, 0, 1]);
    const a = state.project.ai, cal = a ? P.calibrationAt(a.calibrations, t) : null;
    return cal && Math.abs(cal.t - t) < 0.5 ? cal.H : null;
  }
  function startBenchMark() {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    const H = projectionAt(video.currentTime || 0);
    if (!H) { App.toast("Placez la vidéo sur un instant déjà analysé ou calibré pour marquer un banc.", true); return; }
    video.pause();
    placing = null; pickRole = null; if (pip) cancelPipette();
    benchMark = { H, first: null };
    updateOverlayMode();
  }
  function benchClick(ix, iy) {
    const p = HG.apply(benchMark.H, ix, iy);
    if (!isFinite(p[0]) || !isFinite(p[1])) return;
    if (!benchMark.first) { benchMark.first = p; drawOverlay(); return; }
    const a = ai(), f = benchMark.first;
    const z = { x1: Math.min(f[0], p[0]), y1: Math.min(f[1], p[1]), x2: Math.max(f[0], p[0]), y2: Math.max(f[1], p[1]) };
    benchMark = null;
    if (z.x2 - z.x1 < 0.3 || z.y2 - z.y1 < 0.3) { App.toast("Zone trop petite : cliquez deux coins opposés autour du banc.", true); updateOverlayMode(); return; }
    a.benchZones = ((a.benchZones || []).concat([Object.fromEntries(Object.entries(z).map(([k, v]) => [k, Math.round(v * 100) / 100]))])).slice(-3);
    renderBenchZones(); updateOverlayMode(); App.changed();
  }

  /* La mémoire du projet filtre un résultat d'analyse : les erreurs que le coach a écartées ne reviennent pas. */
  const subAnswers = () => memory().answers.filter((x) => x.kind === "sub" || x.kind === "team");
  function applyMemory(res) {
    const mem = memory();
    if (state.project.ai) state.project.ai.subs = res.subs || [];
    res.events = D.filterRejected(res.events, mem);
    res.uncertain = (res.uncertain || []).filter((u) => !D.isRejected(mem, u));
    return res;
  }

  /* ---------- questions du programme ---------- */
  const qThumbs = new Map();
  /* Zones de banc d'une question (terrain, en m) -> polygones en coordonnées d'image normalisées (0..1), via la projection mesurée à cet instant. */
  function benchPolys(q) {
    const f = frames.length ? P.frameNear(frames, q.t, 0.6) : null;
    if (!f || !Array.isArray(f.h) || f.h.length !== 9 || !Array.isArray(q.zones)) return null;
    const Hi = HG.invert(f.h);
    return q.zones.map((z) => [[z.x1, z.y1], [z.x2, z.y1], [z.x2, z.y2], [z.x1, z.y2]].map((p) => HG.apply(Hi, p[0], p[1])));
  }
  const markBox = (url, b, polys) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      if (polys) { g.strokeStyle = "#f97316"; g.lineWidth = 3; g.setLineDash([8, 5]); polys.forEach((pl) => { g.beginPath(); pl.forEach((p, k) => { if (k) g.lineTo(p[0] * c.width, p[1] * c.height); else g.moveTo(p[0] * c.width, p[1] * c.height); }); g.closePath(); g.stroke(); }); }
      if (b) { g.strokeStyle = "#f97316"; g.lineWidth = 3; g.strokeRect((b[0] / 1000) * c.width, (b[1] / 1000) * c.height, ((b[2] - b[0]) / 1000) * c.width, ((b[3] - b[1]) / 1000) * c.height); }
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
  let thumbBusy = false, thumbAgain = false;
  async function loadQuestionThumbs(qs) {
    if (thumbBusy) { thumbAgain = true; return; }                 // une seule capture à la fois (chacune ouvre la vidéo)
    const todo = qs.filter((q) => !qThumbs.has(q.key));
    if (!todo.length || !App.getVideoUrl() || !App.isVideoReady()) return;
    thumbBusy = true;
    let shots = [];
    try { shots = await P.captureFrames(App.getVideoUrl(), todo.map((q) => q.t), 480); } catch (_e) { thumbBusy = false; return; }
    for (let i = 0; i < todo.length; i++) if (shots[i]) qThumbs.set(todo[i].key, await markBox(shots[i], todo[i].kind === "team" || todo[i].kind === "sub" ? todo[i].b : null, todo[i].kind === "bench" ? benchPolys(todo[i]) : null));
    document.querySelectorAll("#ai-q img[data-k]").forEach((im) => { const u = qThumbs.get(im.dataset.k); if (u) im.src = u; });
    thumbBusy = false;
    if (thumbAgain) { thumbAgain = false; renderQuestions(); }
  }
  function renderQuestions() {
    const box = $("ai-q");
    if (!box) return;
    const a = state.project.ai;
    renderAnswers(); renderBallLabels();
    const qs = a ? D.openQuestions({ doubts: a.doubts || [], subs: a.subs || [], uncertain: a.uncertain || [], memory: memory() }) : [];
    $("ai-q-count").textContent = "(" + qs.length + ")";
    box.innerHTML = "";
    if (qGroup) {
      const open = qGroup.group.filter((g) => qs.some((x) => x.kind === "team" && x.id === g.id));
      if (open.length) {
        const ban = document.createElement("div"); ban.className = "q"; ban.style.gridTemplateColumns = "1fr";
        const tx = document.createElement("div"); tx.className = "qt";
        tx.textContent = open.length + " autre(s) question(s) concernent peut-être la même personne (une piste qui commence juste après ou finit juste avant, au même endroit, avec la même équipe retenue)" + (qGroup.look ? " ou une personne qui porte la même allure (pantalon ou survêtement, sans peau visible aux jambes)" : "") + ". Appliquer la même réponse (« " + (D.TEAM_LABEL[qGroup.team] || qGroup.team) + " ») ?" + (qGroup.look ? " La tenue seule ne suffit pas à reconnaître un gardien : vérifie avant d'accepter." : "");
        const bt = document.createElement("div"); bt.className = "qb";
        const yes = document.createElement("button"); yes.className = "primary"; yes.textContent = "Oui, appliquer aux " + open.length; yes.addEventListener("click", () => applyGroup(open));
        const no = document.createElement("button"); no.textContent = "Non, une par une"; no.addEventListener("click", () => { qGroup = null; renderQuestions(); });
        bt.appendChild(yes); bt.appendChild(no); ban.appendChild(tx); ban.appendChild(bt); box.appendChild(ban);
      } else qGroup = null;
    }
    if (!qs.length) { const p = document.createElement("p"); p.className = "muted"; p.style.padding = "6px"; p.textContent = "Aucune question en attente."; box.appendChild(p); return; }
    qs.forEach((q) => {
      const row = document.createElement("div"); row.className = "q";
      const im = document.createElement("img"); im.dataset.k = q.key; im.alt = ""; if (qThumbs.has(q.key)) im.src = qThumbs.get(q.key);
      im.title = "Voir cette image dans la vidéo"; im.style.cursor = "pointer";
      im.addEventListener("click", () => showQuestion(q));
      const col = document.createElement("div");
      const tx = document.createElement("div"); tx.className = "qt";
      const bt = document.createElement("div"); bt.className = "qb";
      const add = (label, fn, cls) => { const b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls; b.addEventListener("click", fn); bt.appendChild(b); };
      add("▶ Voir dans la vidéo", () => showQuestion(q), "primary");
      if (q.kind === "team") {
        tx.textContent = App.fmt(q.t) + " — Qui est la personne dans le cadre orange ? (" + q.why + ")";
        add("Mon équipe", () => answerTeam(q, "A")); add("Adversaire", () => answerTeam(q, "B"));
        add("Gardien (nous)", () => answerTeam(q, "GKA")); add("Gardien adverse", () => answerTeam(q, "GKB"));
        Object.keys(D.ROLE_LABEL).forEach((k) => add(D.ROLE_LABEL[k][0].toUpperCase() + D.ROLE_LABEL[k].slice(1) + " (ne pas compter)", () => answerTeam(q, "NONE", k)));
      } else if (q.kind === "sub") {
        tx.textContent = App.fmt(q.t) + " — Cette personne passe par la zone de remplacement : remplaçant qui entre ou sort, ou joueur sur le terrain ? (je ne la compte pas comme joueur pendant 3 s)";
        add("Remplaçant (entre / sort)", () => answerSub(q, "remplacant")); add("Joueur sur le terrain", () => answerSub(q, "joueur"));
      } else if (q.kind === "bench") {
        tx.textContent = App.fmt(q.t) + " — La zone du banc (en pointillé) a suivi la caméra sur " + String(q.d).replace(".", ",") + " m. Est-elle encore sur le banc ?";
        add("Oui, sur le banc", () => answerBench(true)); add("Non, elle a dérivé", () => answerBench(false));
      } else {
        tx.textContent = App.fmt(q.t) + " — « " + App.labelOf(q.type) + " » a-t-elle eu lieu ? Je n'ai pas pu le confirmer (" + (q.reason || "ballon pas assez visible") + ").";
        add("Oui, c'est arrivé", () => answerEvent(q, "oui")); add("Non", () => answerEvent(q, "non"));
      }
      col.appendChild(tx); col.appendChild(bt);
      row.appendChild(im); row.appendChild(col); box.appendChild(row);
    });
    loadQuestionThumbs(qs);
  }
  /* Montre la question dans la vraie vidéo : image exacte (en pause) avec le cadre orange sur la personne concernée ;
     pour une erreur incertaine, 2 s avant le moment, pour le voir se produire. */
  function showQuestion(q) {
    video.pause();
    qHighlight = q.kind === "team" || q.kind === "sub" ? { t: q.t, b: q.b, label: q.kind === "sub" ? "Remplaçant ?" : "Question : qui est-ce ?" } : q.kind === "bench" ? { t: q.t, polys: benchPolys(q), label: "Zone du banc" } : null;
    App.seek(q.kind === "team" || q.kind === "sub" || q.kind === "bench" ? q.t : Math.max(0, q.t - 2));
    drawOverlay();
  }
  function answerTeam(q, team, role) {
    const a = state.project.ai;
    qHighlight = null;
    const ans = D.answerTeam(memory(), q, team, undefined, role), r = D.applyOne(frames, ans, { id: q.id });
    if (r.ok) { ans.undo = r.undo; a.frames = P.compactFrames(frames); }
    else App.toast("Je ne retrouve pas cette personne dans les images : votre réponse est retenue pour la prochaine analyse.", true);
    const rest = D.openQuestions({ doubts: a.doubts || [], memory: memory() }).filter((x) => x.kind === "team");
    const dq = (a.doubts || []).find((d) => d.kind === "team" && d.id === q.id);          // un clic sur un cadre n'a pas la mesure des jambes : on la reprend de la question de cette personne
    const qq = dq ? Object.assign({}, q, { leg: q.leg != null ? q.leg : dq.leg, cur: q.cur != null ? q.cur : dq.cur }) : q;
    const cont = D.sameTrackHint(q, rest), look = team === "GKA" || team === "GKB" ? D.sameLookHint(qq, rest) : [];
    const group = cont.concat(look.filter((d) => !cont.some((c) => c.id === d.id)));
    qGroup = group.length ? { team, q, group, look: look.length > 0 } : null;
    reanalyzeSuggestions(); refreshLive(); App.changed(true);
  }
  /* Applique la réponse du coach aux pistes proposées (chacune reste une réponse distincte, annulable dans « Mes réponses »). */
  function applyGroup(list) {
    const a = state.project.ai, g = qGroup;
    if (!g) return;
    list.forEach((d) => {
      const ans = D.answerTeam(memory(), d, g.team, App.fmt(g.q.t)), r = D.applyOne(frames, ans, { id: d.id });
      if (r.ok) ans.undo = r.undo;
    });
    a.frames = P.compactFrames(frames);
    qGroup = null;
    reanalyzeSuggestions(); refreshLive(); App.changed(true);
  }
  /* ---------- corriger une personne ou le ballon en un clic sur la vidéo ---------- */
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function showMenu(e, title, items) {
    closeMenu();
    const m = document.createElement("div"); m.className = "person-menu";
    const h = document.createElement("div"); h.className = "pm-title"; h.textContent = title; m.appendChild(h);
    items.forEach((it) => { const b = document.createElement("button"); b.textContent = it.label; b.addEventListener("click", () => { closeMenu(); it.fn(); }); m.appendChild(b); });
    const x = document.createElement("button"); x.className = "ghost"; x.textContent = "Annuler"; x.addEventListener("click", closeMenu); m.appendChild(x);
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, e.clientX + 8)) + "px";
    m.style.top = Math.max(8, Math.min(window.innerHeight - r.height - 8, e.clientY + 8)) + "px";
    menuEl = m;
  }
  /* Clic sur un cadre : « qui est cette personne ? » ; clic ailleurs : « le ballon est ici ? ». Rien n'est changé sans ta réponse ; tout est annulable. */
  function personClick(e, ix, iy) {
    if (!frames.length || !state.project.ai) return;
    const t = video.currentTime || 0, f = P.frameNear(frames, t, 0.8), vw = video.videoWidth, vh = video.videoHeight;
    if (f) {
      let best = null, area = Infinity;
      f.players.forEach((p) => {
        if (!p.b || p.b.length < 4) return;
        const x1 = (p.b[0] / 1000) * vw, y1 = (p.b[1] / 1000) * vh, x2 = (p.b[2] / 1000) * vw, y2 = (p.b[3] / 1000) * vh;
        if (ix >= x1 - 6 && ix <= x2 + 6 && iy >= y1 - 6 && iy <= y2 + 6 && (x2 - x1) * (y2 - y1) < area) { area = (x2 - x1) * (y2 - y1); best = p; }
      });
      if (best) {
        const q = { kind: "team", id: best.id, t: f.t, x: best.x, y: best.y, b: best.b };
        qHighlight = { t: f.t, b: best.b, label: "Qui est-ce ?" }; drawOverlay();
        const lab = (k) => D.TEAM_LABEL[k] || k;
        showMenu(e, "Qui est cette personne ? (lue : " + (best.team === "A" ? "mon équipe" : best.team === "B" ? "adversaire" : lab(best.team)) + ")", [
          { label: "Mon équipe", fn: () => answerTeam(q, "A") }, { label: "Adversaire", fn: () => answerTeam(q, "B") },
          { label: "Mon gardien", fn: () => answerTeam(q, "GKA") }, { label: "Gardien adverse", fn: () => answerTeam(q, "GKB") },
        ].concat(Object.keys(D.ROLE_LABEL).map((k) => ({ label: D.ROLE_LABEL[k][0].toUpperCase() + D.ROLE_LABEL[k].slice(1) + " (ne pas compter)", fn: () => answerTeam(q, "NONE", k) }))));
        return;
      }
    }
    const H = projectionAt(t), p = H && f ? HG.apply(H, ix, iy) : null, items = [];
    if (p && isFinite(p[0]) && isFinite(p[1])) items.push({ label: "Oui, le ballon est ici (image de " + App.fmt(f.t) + ")", fn: () => { saveBallLabel(t, ix, iy, H); answerBallAt({ t: f.t, x: Math.round(p[0] * 100) / 100, y: Math.round(p[1] * 100) / 100 }); } });
    else items.push({ label: "Le ballon est ici (sert seulement à l'entraînement : terrain non repéré à cet instant)", fn: () => saveBallLabel(t, ix, iy, null) });
    items.push({ label: "Aucun ballon visible sur cette image", fn: () => saveBallLabel(t, null, null, null) });
    showMenu(e, "Le ballon est ici ?", items);
  }
  /* Étiquette exacte du ballon (pixel cliqué) pour mesurer puis entraîner le détecteur ; jamais déduite par le programme. */
  function saveBallLabel(t, ix, iy, H) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const lab = ix == null ? { t, none: true, vw, vh } : Object.assign({ t, u: ix, v: iy, vw, vh }, BL.ballSize(ix, iy, vw, H, HG));
    if (!BL.add(memory(), lab)) { App.toast("Étiquette refusée : le clic est en dehors de l'image.", true); return; }
    renderBallLabels(); App.changed();
    App.toast(ix == null ? "Noté : aucun ballon visible sur cette image." : "Étiquette du ballon enregistrée.");
    if (bs && bs.list[bs.i] != null && Math.abs(bs.list[bs.i] - t) < 0.5) bsMove(1);
  }
  /* ---------- session d'étiquetage : des images une à une, le ballon proposé par le programme, la réponse est la tienne ---------- */
  let bs = null;                 // { list: [t…], i, n } ; null = pas de session
  const BS_MAX = 150;
  function bsBox(show) { const b = $("ai-bs-box"); if (b) b.hidden = !show; }
  function startBallSession() {
    if (!App.isVideoReady() || !frames.length) { App.toast("Chargez la vidéo et lancez d'abord l'analyse : les images à étiqueter viennent de l'analyse.", true); return; }
    const done = BL.list(memory()), step = Math.max(1, Math.floor(frames.length / BS_MAX)), list = [];
    for (let k = 0; k < frames.length && list.length < BS_MAX; k += step) { const t = frames[k].t; if (!done.some((l) => Math.abs(l.t - t) < BL.T_SAME)) list.push(t); }
    if (!list.length) { App.toast("Toutes les images proposées sont déjà étiquetées."); return; }
    bs = { list, i: 0 }; bsBox(true); bsShow();
    try { $("ai-bs-box").scrollIntoView({ block: "nearest" }); } catch (_e) { /* défilement indisponible */ }
  }
  function bsEnd(msg) { bs = null; qHighlight = null; bsBox(false); drawOverlay(); if (msg) App.toast(msg); }
  function bsMove(d) {
    if (!bs) return;
    const j = bs.i + d;
    if (j >= bs.list.length) { bsEnd("Session terminée : " + BL.counts(memory()).total + " étiquette(s) au total dans ce projet."); return; }
    bs.i = Math.max(0, j); bsShow();
  }
  function bsShow() {
    const t = bs.list[bs.i], f = P.frameNear(frames, t, 0.3), H = projectionAt(t);
    let pt = null;
    if (f && f.ball && H) {
      try { const q = HG.apply(HG.invert(H), f.ball.x, f.ball.y); if (isFinite(q[0]) && isFinite(q[1]) && q[0] >= 0 && q[1] >= 0 && q[0] <= video.videoWidth && q[1] <= video.videoHeight) pt = { u: q[0], v: q[1] }; } catch (_e) { pt = null; }
    }
    bs.pt = pt; bs.H = H;
    video.pause();
    qHighlight = { t, ballPt: pt, label: "Ballon proposé" };
    $("ai-bs-text").textContent = "Image " + (bs.i + 1) + " sur " + bs.list.length + " (" + App.fmt(t) + ") — " + (pt ? "le programme propose le ballon dans le cercle orange. Est-ce bien le ballon ?" : "le programme ne propose aucun ballon. Vois-tu le ballon ?") + "  [Entrée = oui, N = aucun ballon, S = passer]";
    $("ai-bs-ok").disabled = !pt;
    App.seek(t); drawOverlay();
  }
  function bsOk() { if (bs && bs.pt) saveBallLabel(bs.list[bs.i], bs.pt.u, bs.pt.v, bs.H); }
  function bsNone() { if (bs) saveBallLabel(bs.list[bs.i], null, null, null); }
  function renderBallLabels() {
    const c = state.project.ai ? BL.counts(memory()) : { total: 0, positives: 0, negatives: 0 }, el = $("ai-bl-count");
    if (el) el.textContent = c.total ? c.positives + " avec ballon, " + c.negatives + " sans ballon" : "aucune étiquette";
    const b = $("ai-bl-export"); if (b) b.disabled = !c.total;
  }
  /* Exporte les images étiquetées (JPEG + fichier YOLO) dans un dossier choisi : rien ne part sur Internet. */
  async function exportBallLabels() {
    const labs = BL.list(memory()).slice();
    if (!labs.length || !App.isVideoReady()) { App.toast("Chargez la vidéo et étiquetez au moins une image.", true); return; }
    const cv = document.createElement("canvas"), items = [], wasPaused = video.paused, t0 = video.currentTime;
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    video.pause();
    for (const l of labs) {
      if (l.vw !== video.videoWidth || l.vh !== video.videoHeight) continue;      // étiquette d'une autre vidéo : ignorée
      await new Promise((res) => { const done = () => { video.removeEventListener("seeked", done); res(); }; video.addEventListener("seeked", done); video.currentTime = l.t; setTimeout(done, 4000); });
      cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.92));
      if (!blob) continue;
      items.push({ name: "balle_" + String(Math.round(l.t * 1000)).padStart(8, "0"), jpeg: await blob.arrayBuffer(), label: BL.yoloLine(l) });
    }
    video.currentTime = t0; if (!wasPaused) video.play();
    if (!items.length) { App.toast("Aucune étiquette ne correspond à cette vidéo.", true); return; }
    const r = await window.fsal.exportBallDataset(items);
    if (r && r.error) App.toast(r.error, true);
    else if (r && !r.canceled) App.toast(items.length + " image(s) exportée(s) dans : " + r.dir);
  }
  function answerBallAt(pt) {
    const a = state.project.ai, ans = D.answerBall(memory(), pt), r = D.applyOne(frames, ans);
    if (r.ok) { ans.undo = r.undo; a.frames = P.compactFrames(frames); }
    else App.toast("Aucune image analysée assez proche : ta réponse est retenue pour la prochaine analyse.", true);
    reanalyzeSuggestions(); refreshLive(); App.changed(true);
  }

  function answerSub(q, verdict) {
    D.answerSub(memory(), q, verdict);
    reanalyzeSuggestions(); App.changed();
  }
  function answerBench(ok) {
    D.answerBench(memory(), ok);
    App.toast(ok ? "Zone du banc confirmée." : "Noté : aux prochaines analyses, la zone du banc ne suivra plus la caméra. Relancez l'analyse pour l'appliquer.");
    renderQuestions(); App.changed();
  }

  /* ---------- écran « Mes réponses » : tout ce qui a été répondu ou écarté, avec Annuler ---------- */
  function renderAnswers() {
    const box = $("ai-ans");
    if (!box) return;
    const mem = state.project.ai ? memory() : { answers: [], rejected: [] }, rows = [];      // ne crée pas de projet IA vide juste pour afficher la liste
    mem.answers.slice().reverse().forEach((a) => rows.push({ text: D.describeAnswer(a, App.fmt, App.labelOf), label: "Annuler", fn: () => cancelAnswer(a) }));
    mem.rejected.slice().reverse().forEach((r) => rows.push({ text: App.fmt(r.t) + " — erreur écartée : " + App.labelOf(r.type), label: "Rétablir", fn: () => restoreRejected(r) }));
    $("ai-ans-count").textContent = "(" + rows.length + ")";
    box.innerHTML = "";
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted"; p.style.padding = "6px"; p.textContent = "Aucune réponse pour l'instant."; box.appendChild(p); return; }
    rows.forEach((x) => {
      const row = document.createElement("div"); row.className = "ev";
      const t = document.createElement("div"); t.className = "chips"; t.style.gridColumn = "1 / 3"; t.textContent = x.text;
      const b = document.createElement("button"); b.textContent = x.label; b.addEventListener("click", x.fn);
      row.appendChild(t); row.appendChild(b); box.appendChild(row);
    });
  }
  function cancelAnswer(a) {
    const p = state.project, ai = p.ai, mem = memory();
    if (a.kind === "team" || a.kind === "ball") {
      if (D.undoOne(frames, a)) ai.frames = P.compactFrames(frames);
      else App.toast("Cette réponse n'avait modifié aucune image (personne absente ou ambiguë) : rien à rétablir.");
    }
    if (a.kind === "event" && a.verdict === "oui") {
      const before = p.events.length;
      p.events = p.events.filter((e) => !(e.auto && e.type === a.type && Math.abs(e.t - a.t) < 2.5 && /confirmé par vous/.test(e.note || "")));
      if (p.events.length === before) App.toast("L'événement ajouté n'a pas été retrouvé (sa note a peut-être été modifiée) : supprime-le à la main dans la liste des événements.", true);
      App.renderEvents(); App.renderTimeline(); App.renderPalette();
    }
    D.removeAnswer(mem, a);
    reanalyzeSuggestions();
    // la question d'une erreur incertaine revient même si le recalcul ne la retrouve pas (elle est gardée avec la réponse)
    if (a.kind === "event" && a.event && !(ai.uncertain || []).some((u) => u.type === a.type && Math.abs(u.t - a.t) < 2)) {
      ai.uncertain = (ai.uncertain || []).concat([{ t: a.t, type: a.type, reason: a.reason || "ballon non visible", event: a.event }]);
      renderSuggestions();
    }
    refreshLive(); App.changed(true);
  }
  function restoreRejected(r) {
    D.unreject(memory(), r);
    reanalyzeSuggestions(); App.changed();
  }
  const evBusy = new Set();
  async function answerEvent(q, verdict) {
    if (evBusy.has(q.key)) return;                              // double clic : une seule réponse, un seul événement
    evBusy.add(q.key);
    try {
      const a = state.project.ai, mem = memory();
      D.answerEvent(mem, q, verdict);
      a.uncertain = (a.uncertain || []).filter((u) => !(u.type === q.type && Math.abs(u.t - q.t) < 2));
      renderSuggestions();                                      // la question disparaît tout de suite (la vignette de l'événement arrive ensuite)
      if (verdict === "oui") await acceptSuggestions([Object.assign({ sid: "q" + Date.now().toString(36) }, q.event, { note: ((q.event && q.event.note) || "") + " — confirmé par vous" })]);
      renderSuggestions(); App.changed();
    } finally { evBusy.delete(q.key); }
  }

  /* Recalcule les erreurs suggérées à partir des images déjà analysées (après un changement de réglage qui ne demande
     pas de nouvelle détection, comme le côté des bancs). */
  function reanalyzeSuggestions() {
    const a = state.project.ai;
    if (!a || !frames.length) return;
    const s = a.settings || {};
    const res = applyMemory(M.analyze(frames, { L: L(), W: W(), dirAt, lost: a.lost || [], span: [s.t0 || frames[0].t, s.t1 || frames[frames.length - 1].t], bench: benchSetting(), benchSeen: a.benchSeen || null, subAnswers: subAnswers() }));
    a.stats = Object.assign({}, res.stats); renderStats();
    a.suggestedEvents = res.events.filter((e) => !state.project.events.some((x) => x.type === e.type && Math.abs(x.t - e.t) < 2)).map((e, i) => Object.assign({ sid: "s" + Date.now().toString(36) + i }, e));
    a.suggested = a.suggestedEvents.length; a.uncertain = res.uncertain; a.context = res.context;
    updateQuality(res); renderQuality();
    renderSuggestions(); App.changed();
  }

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

  let engineKind = "cpu";        // moteur du détecteur (« dml » = carte graphique) : l'estimation de durée en dépend
  let engineBlocked = false;     // détecteur indisponible : le bouton d'analyse reste désactivé
  /* Correction apprise sur cet ordinateur (durée réelle / durée prévue), une par moteur. */
  const factorKey = () => "fsal.estFactor." + engineKind;
  function estFactor() {
    try { const v = Number(localStorage.getItem(factorKey())); return v >= P.FACTOR_MIN && v <= P.FACTOR_MAX ? v : 1; } catch (_e) { return 1; }
  }
  /* p : réglages de l'analyse { fps, tiles, camera } ; par défaut ceux affichés. */
  function estimate(range, withFactor, p) {
    p = p || { fps: Number($("ai-fps").value), tiles: Number($("ai-tiles").value), camera: $("ai-camera").value };
    return P.estimateDuration({ t0: range[0], t1: range[1], fps: p.fps, tiles: p.tiles, camera: p.camera,
      calibrations: ai().calibrations, kind: engineKind, factor: withFactor ? estFactor() : 1 });
  }
  function learnDuration(range, p, realSeconds) {
    const plan = estimate(range, false, p);
    if (plan.images < 20 || !(plan.seconds > 0)) return;   // trop court pour être représentatif
    try { localStorage.setItem(factorKey(), String(P.learnFactor(estFactor(), plan.seconds, realSeconds))); } catch (_e) { /* stockage indisponible */ }
  }
  function updateEstimate() {
    const r = readRange(), e = $("ai-est");
    if (!r) { e.textContent = ""; return; }
    const est = estimate(r, true);
    e.textContent = "Durée estimée : environ " + fmtEta(est.seconds) + " (" + est.images + " images, calcul sur " + (engineKind === "dml" ? "la carte graphique" : "le processeur") + "). Pour un match entier, analysez d'abord un extrait ou choisissez « Rapide ».";
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
        url: App.getVideoUrl(), t0: range[0], t1: range[1], fps, tiles, camera, tol: tol(), L: L(), W: W(), calibrations: a.calibrations, refs: r, floorMarks: floorMarks(), benchZones: a.benchZones || [], benchFollow: memory().benchFollow !== false, dirAt, signal: abort.signal, api,
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
      a.doubts = result.doubts || [];
      qGroup = null; qThumbs.clear();                    // les numéros de pistes d'une nouvelle analyse n'ont rien à voir avec les anciens
      D.applyAnswers(frames, memory().answers);
      a.camera = camera; a.lost = result.lost; a.notes = result.notes;
      a.frames = P.compactFrames(frames);
      a.benchSeen = result.bench || null;
      const res = applyMemory(M.analyze(frames, { L: L(), W: W(), dirAt, lost: result.lost, span: range, bench: benchSetting(), benchSeen: a.benchSeen, subAnswers: subAnswers() }));
      a.stats = Object.assign({}, res.stats);
      a.suggestedEvents = res.events.map((e, i) => Object.assign({ sid: "s" + Date.now().toString(36) + i }, e));
      a.suggested = a.suggestedEvents.length;
      a.uncertain = res.uncertain;
      a.context = res.context;
      a.settings = { fps, tiles, t0: range[0], t1: range[1], tol: tol(), floorMarks: floorMarks(), bench: benchSetting() };
      const lostTxt = result.lost.length ? " Caméra perdue : " + result.lost.map((l) => App.fmt(l[0]) + "–" + App.fmt(l[1])).join(", ") + "." : "";
      msg.textContent = (out.length ? "Analyse terminée : " + out.length + " images, " + a.suggestedEvents.length + " erreur(s) suggérée(s)" + (res.uncertain.length ? ", " + res.uncertain.length + " non signalée(s) (contexte incertain)" : "") + ". Temps de jeu analysé de façon fiable : " + Math.round(res.context.reliable.ratio * 100) + " %." : "Analyse terminée, mais aucun joueur n'a été retenu : vérifiez le calibrage et les tenues.") + (result.notes.length ? " " + result.notes.join(" ") : "") + lostTxt;
      if (out.length) learnDuration(range, { fps, tiles, camera }, (Date.now() - startedAt) / 1000);
      updateQuality(res);
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
    $("ai-marks").checked = !(d.settings && d.settings.floorMarks === false);
    $("ai-bench").value = (d.settings && ["left", "right"].includes(d.settings.bench)) ? d.settings.bench : "auto";
    benchMark = null; renderBenchZones();
    qGroup = null; qHighlight = null; qThumbs.clear(); bs = null; bsBox(false);
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
      a.settings = Object.assign({}, a.settings, { fps: Number($("ai-fps").value), tiles: Number($("ai-tiles").value), tol: tol(), floorMarks: floorMarks(), bench: benchSetting() });
      fillLandmarks(); App.changed();
    };
    ["ai-L", "ai-W", "ai-dir", "ai-flip", "ai-fps", "ai-tiles", "ai-camera", "ai-marks"].forEach((id) => $(id).addEventListener("change", upd));
    $("ai-bench").addEventListener("change", () => { upd(); reanalyzeSuggestions(); });
    $("ai-bench-mark").addEventListener("click", startBenchMark);
    $("ai-bl-export").addEventListener("click", exportBallLabels);
    $("ai-bs-start").addEventListener("click", startBallSession);
    $("ai-bs-ok").addEventListener("click", bsOk); $("ai-bs-none").addEventListener("click", bsNone);
    $("ai-bs-skip").addEventListener("click", () => bsMove(1)); $("ai-bs-prev").addEventListener("click", () => bsMove(-1));
    $("ai-bs-stop").addEventListener("click", () => bsEnd());
    // raccourcis pendant une session : Entrée = oui, N = aucun ballon, S = passer (jamais pendant une saisie de texte)
    document.addEventListener("keydown", (e) => {
      if (!bs || e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target && e.target.tagName;
      if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT" || (e.target && e.target.isContentEditable)) return;
      if (e.key === "Enter") { e.preventDefault(); bsOk(); }
      else if (e.key === "n" || e.key === "N") { e.preventDefault(); bsNone(); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); bsMove(1); }
    });
    $("ai-bench-clear").addEventListener("click", () => { const a = ai(); a.benchZones = []; renderBenchZones(); drawOverlay(); App.changed(); });
    $("ai-camera").addEventListener("change", updateEstimate);
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
    $("ai-clear-sugg").addEventListener("click", () => { const a = state.project.ai; if (!a) return; a.suggestedEvents.forEach((e) => D.reject(memory(), e)); a.suggestedEvents = []; a.suggested = 0; renderSuggestions(); App.changed(); });
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
      if (benchMark) { benchClick(ix, iy); return; }
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
      else personClick(e, ix, iy);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
    document.addEventListener("mousedown", (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && benchMark) { benchMark = null; updateOverlayMode(); return; } if (e.key === "Escape" && (placing || pickRole || pip)) { placing = null; pickRole = null; if (pip) cancelPipette(); else updateOverlayMode(); } });
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

  /* Mémoire du projet : ce que le coach a montré ou répondu (couleurs de but apprises, erreurs écartées, réponses aux questions).
     Elle vit dans le projet seulement ; rien n'est réutilisé d'un autre projet. */
  function memory() {
    const a = ai();
    if (!a.memory) a.memory = { goalPalettes: [], rejected: [], answers: [] };
    ["goalPalettes", "rejected", "answers"].forEach((k) => { if (!Array.isArray(a.memory[k])) a.memory[k] = []; });
    return a.memory;
  }

  const FSAI = window.FSAI = {
    hooks: {}, segmentImpl: null,
    ai, memory, refs, kitWarnings, quality: () => (state.project.ai ? state.project.ai.quality : null), grabSam, renderKits, renderStats, renderCalibs, renderPoints, validateCalibration, runAnalysis, updateEstimate,
    addLayer: (fn) => { layers.push(fn); }, setPointer: (p) => { pointer = p; updateOverlayMode(); }, redraw: refreshLive,
    beginPlacing: (id) => { if (!App.isVideoReady()) return false; video.pause(); pickRole = null; pip = null; renderPipette(); placing = id; $("ai-landmark").value = id; updateOverlayMode(); return true; },
    cancelPlacing: () => { placing = null; updateOverlayMode(); },
    getPoints: () => pts.slice(), clearPoints: () => { pts = []; placing = null; renderPoints(); updateOverlayMode(); },
    removePoint: (id) => { pts = pts.filter((q) => q.id !== id); renderPoints(); refreshLive(); },
    clearAnalysis: () => { frames = []; const a = ai(); a.frames = null; a.stats = null; a.suggestedEvents = []; a.uncertain = []; a.context = null; a.suggested = 0; renderStats(); renderSuggestions(); refreshLive(); },
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
