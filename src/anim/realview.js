/* Correction animée sur la vraie vidéo : dessins collés au sol (calibrage inversé + suivi de la caméra), correction
   animée (joueur fantôme vert, flèche verte, croix sur la passe coupée), petite carte vue de dessus qui rejoue la scène.
   Modes : « fixed » (Figé : arrêt sur l'erreur, dessins un par un) et « seq » (Séquencé : quelques secondes réelles).
   Navigateur uniquement. Les calculs (projection, dessins) viennent de FutsalOverlay. */
(function (root) {
  "use strict";
  const O = root.FutsalOverlay;
  const COLOR = { err: "#ef4444", opp: "#f59e0b", ok: "#22c55e", ball: "#ffffff" };
  const TEAM = { A: "#3b82f6", B: "#ef4444", GKA: "#facc15", GKB: "#fb923c" };
  const SEQ_BEFORE = 3, SEQ_AFTER = 3;           // fenêtre du mode Séquencé (s)
  const STEP = 0.9, CORR_DUR = 3.6;              // apparition des dessins un par un ; durée de la correction animée
  const GHOST_SCALE = 1.1;                       // fantôme un peu plus grand que le joueur, pour bien le voir
  const REASONS = {
    "sans-analyse": "Pas d'analyse vidéo à cet instant : la scène est montrée sur le plan vu de dessus.",
    "camera-perdue": "La caméra a été perdue à cet instant (flou, mouvement trop rapide) : rien n'est dessiné sur l'image pour ne rien montrer de faux.",
    "trop-peu-de-joueurs": "Trop peu de joueurs visibles à cet instant pour placer les dessins sur l'image sans erreur : rien n'est dessiné sur l'image.",
    "sans-video": "La vidéo du match n'est pas chargée : la scène est montrée sur le plan vu de dessus."
  };

  function seek(video, t) {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - t) < 0.002 && video.readyState >= 2) return resolve(true);
      let done = false;
      const end = (ok) => { if (done) return; done = true; clearTimeout(to); video.removeEventListener("seeked", on); resolve(ok); };
      const on = () => end(true);
      const to = setTimeout(() => end(false), 8000);
      video.addEventListener("seeked", on);
      try { video.currentTime = t; } catch (_e) { end(false); }
    });
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));

  function RealView(el) {
    this.el = el;                    // { root, video, overlay, map, msg }
    this.ctx = el.overlay.getContext("2d");
    this.mctx = el.map.getContext("2d");
    this.raf = 0;
    this.s = null;
    this.ghosts = new Map();         // découpes déjà faites (clé = instant + joueur)
    this._tick = this._tick.bind(this);
  }

  /* o : { url, frames, lost, L, W, dirAt, event, segment(req) -> Promise<{masks}|{error}>, mode, onPhase(phase) } */
  RealView.prototype.open = async function (o) {
    this.close();
    const frames = (o.frames || []).slice().sort((a, b) => a.t - b.t);
    const s = this.s = {
      o, frames, L: o.L || 40, W: o.W || 20, ev: o.event, mode: o.mode === "seq" ? "seq" : "fixed",
      pr: new O.Projector(frames, { lost: o.lost }), ov: O.buildOverlay(o.event, frames, { L: o.L, W: o.W, dirAt: o.dirAt }),
      start: 0, phase: "load", mapOnly: false, reason: null, ghost: null, gen: (this.gen = (this.gen || 0) + 1)
    };
    const gen = s.gen;
    const at = s.pr.at(s.ev.t);
    // repli : sans vidéo -> plan seul ; vidéo mais projection impossible -> image réelle figée SANS dessin + plan agrandi
    if (!o.url) { s.mapOnly = true; s.reason = "sans-video"; }
    else if (!at.ok) { s.mapOnly = true; s.noDraw = true; s.reason = at.reason; }
    this.el.root.classList.toggle("map-only", s.mapOnly && !s.noDraw);
    this.el.root.classList.toggle("map-big", !!s.noDraw);
    // aucune position de joueur à cet instant (caméra perdue) : le plan joue l'animation type du catalogue, présentée comme telle
    s.catalog = s.mapOnly && !s.ov.items.length && o.catalogSeq && root.FutsalAnim && root.FutsalScenes ? o.catalogSeq : null;
    s.catT0 = performance.now();
    this.message(s.mapOnly ? REASONS[s.reason] + (s.catalog ? " Positions des joueurs indisponibles : le plan montre l'animation type du catalogue (un exemple, pas votre action)." : s.noDraw ? " La correction est montrée sur le plan." : "") : null);
    const v = this.el.video;
    v.pause();
    if (o.url && v.getAttribute("data-src") !== o.url) { v.setAttribute("data-src", o.url); v.src = o.url; }
    if (o.url && v.readyState < 1) await new Promise((r) => { const ok = () => { v.removeEventListener("loadedmetadata", ok); r(); }; v.addEventListener("loadedmetadata", ok); setTimeout(ok, 8000); });
    if (gen !== this.gen) return;
    if (o.url) await seek(v, s.ev.t);
    if (gen !== this.gen) return;
    // découpe du joueur fantôme (une fois par situation), avec message d'attente
    if (!s.mapOnly && s.ov.correction && s.ov.correction.ghost && o.segment) await this.prepareGhost(s);
    if (gen !== this.gen) return;
    this.restart();
  };

  RealView.prototype.close = function () {
    this.gen = (this.gen || 0) + 1;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.el.video) this.el.video.pause();
    this.s = null;
  };

  RealView.prototype.setMode = function (mode) { if (!this.s) return; this.s.mode = mode === "seq" ? "seq" : "fixed"; this.restart(); };

  RealView.prototype.restart = async function () {
    const s = this.s; if (!s) return;
    const v = this.el.video, gen = this.gen;
    if (this.raf) cancelAnimationFrame(this.raf);
    s.phase = s.mode === "seq" && !s.mapOnly ? "play" : "reveal";
    if (s.mode === "seq" && !s.mapOnly) {
      const f0 = s.frames.length ? s.frames[0].t : 0, f1 = s.frames.length ? s.frames[s.frames.length - 1].t : s.ev.t;
      s.win = [Math.max(f0, s.ev.t - SEQ_BEFORE), Math.min(f1, s.ev.t + SEQ_AFTER, (v.duration || 1e9) - 0.05)];
      await seek(v, s.win[0]);
      if (gen !== this.gen) return;
      v.play().catch(() => {});
    } else if (this.s.o.url) {
      v.pause(); await seek(v, s.ev.t);
      if (gen !== this.gen) return;
    }
    s.start = performance.now();
    this.notify();
    this.raf = requestAnimationFrame(this._tick);
  };

  /* ---------- export : la même correction, rendue image par image (hors temps réel) ---------- */
  /* Chronologie de la correction affichée : { duration, play (durée de l'extrait réel en mode Séquencé), reveal } ou null (rien à exporter). */
  RealView.prototype.timeline = function () {
    const s = this.s;
    if (!s || s.mapOnly) return null;
    const hasCorr = !!s.ov.correction, v = this.el.video, last = s.frames.length ? s.frames[s.frames.length - 1].t : s.ev.t, first = s.frames.length ? s.frames[0].t : 0;
    if (s.mode === "seq") {
      const win = [Math.max(first, s.ev.t - SEQ_BEFORE), Math.min(last, s.ev.t + SEQ_AFTER, (v.duration || 1e9) - 0.05)], play = Math.max(0.5, win[1] - win[0]);
      return { mode: "seq", win, play, duration: play + CORR_DUR + 2.5 };
    }
    const reveal = s.ov.items.length * STEP + 1;
    return { mode: "fixed", reveal, duration: reveal + (hasCorr ? CORR_DUR + 2.5 : 1) };
  };
  /* État à l'instant T (s) de l'export : instant de la vidéo, nombre de dessins montrés, avancement de la correction (-1 = pas encore). */
  RealView.prototype.clipState = function (T) {
    const s = this.s, tl = this.timeline(), n = s.ov.items.length, hasCorr = !!s.ov.correction;
    if (tl.mode === "seq") {
      if (T < tl.play) return { t: tl.win[0] + T, shown: n, corr: -1 };
      return { t: s.ev.t, shown: n, corr: Math.min(1, (T - tl.play) / CORR_DUR) };
    }
    if (T < tl.reveal) return { t: s.ev.t, shown: Math.min(n, Math.floor(T / STEP) + 1), corr: -1 };
    return { t: s.ev.t, shown: n, corr: hasCorr ? Math.min(1, (T - tl.reveal) / CORR_DUR) : -1 };
  };
  /* Taille de l'export (paire, bornée par maxW × maxH) et nombre d'images à fps images par seconde. */
  RealView.prototype.exportInfo = function (maxW, maxH, fps) {
    const tl = this.timeline(), c = this.el.overlay;
    if (!tl || !c.clientWidth || !c.clientHeight) return null;
    const k = Math.min(1, maxW / c.clientWidth, maxH / c.clientHeight), ev = (n) => Math.max(2, Math.round(n / 2) * 2);
    return { width: ev(c.clientWidth * k), height: ev(c.clientHeight * k), total: Math.ceil(tl.duration * fps) + 1, duration: tl.duration, fps };
  };
  /* Rend toutes les images : renderFrame(i) est appelé (et attendu) avec un canvas déjà composé (vidéo + dessins + petite carte). */
  RealView.prototype.exportFrames = async function (info, onFrame, signal) {
    const s = this.s;
    if (!s || !info) throw new Error("Rien à exporter");
    const gen = this.gen, v = this.el.video;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0; v.pause();
    const out = document.createElement("canvas"); out.width = info.width; out.height = info.height;
    const g = out.getContext("2d");
    try {
      for (let i = 0; i < info.total; i++) {
        if (signal && signal.aborted) throw new Error("Export interrompu");
        if (gen !== this.gen) throw new Error("La correction affichée a changé pendant l'export");
        if (!this.el.root.offsetParent) throw new Error("Restez sur l'onglet pendant l'export (les dessins sont calculés à la taille de l'écran)");
        const T = Math.min(info.duration, i / info.fps), st = this.clipState(T);
        if (!(await seek(v, st.t))) throw new Error("La vidéo n'a pas pu se positionner à " + st.t.toFixed(1) + " s");
        this.draw(st.t, st.shown, st.corr);
        this.compose(g, info.width, info.height);
        await onFrame(out, i, info.total);
      }
    } finally {
      if (gen === this.gen) this.restart();
    }
  };
  /* Compose l'image affichée (vidéo, dessins, petite carte) dans g, à la taille w × h. */
  RealView.prototype.compose = function (g, w, h) {
    const c = this.el.overlay, v = this.el.video, k = w / c.width, vw = v.videoWidth || 16, vh = v.videoHeight || 9;
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    const f = Math.min(c.width / vw, c.height / vh), rw = vw * f, rh = vh * f;
    try { g.drawImage(v, ((c.width - rw) / 2) * k, ((c.height - rh) / 2) * k, rw * k, rh * k); } catch (_e) { /* image vidéo indisponible */ }
    g.drawImage(c, 0, 0, w, h);
    const m = this.el.map;
    if (m.offsetParent && getComputedStyle(m).display !== "none") {
      const a = c.getBoundingClientRect(), b = m.getBoundingClientRect();
      if (a.width && b.width) {
        const sx = w / a.width, sy = h / a.height, x = (b.left - a.left) * sx, y = (b.top - a.top) * sy, mw = b.width * sx, mh = b.height * sy;
        g.drawImage(m, x, y, mw, mh);
        g.strokeStyle = "#fff"; g.lineWidth = Math.max(1, 2 * sx); g.strokeRect(x, y, mw, mh);
      }
    }
  };

  /* Phase en cours, aussi exposée sur la page (data-phase, data-ghost) pour les tests de bout en bout. */
  RealView.prototype.notify = function () {
    if (!this.s) return;
    this.el.root.dataset.phase = this.s.phase;
    this.el.root.dataset.ghost = this.s.ghostQuality || "";
    this.el.root.dataset.items = String(this.s.ov.items.length);
    if (this.s.o.onPhase) this.s.o.onPhase(this.s.phase);
  };
  RealView.prototype.message = function (text) { this.el.msg.hidden = !text; this.el.msg.textContent = text || ""; };

  RealView.prototype._tick = function (now) {
    const s = this.s; if (!s) return;
    if (!this.el.root.offsetParent) { this.el.video.pause(); this.raf = 0; return; }   // onglet quitté : on arrête
    const v = this.el.video, el = (now - s.start) / 1000;
    let tNow = s.ev.t, shown = s.ov.items.length, corr = -1;
    if (s.phase === "play") {
      tNow = v.currentTime;
      shown = s.ov.items.length;                     // les joueurs concernés sont suivis pendant tout l'extrait
      if (tNow >= s.win[1] || v.ended) {           // fin de l'extrait : retour sur l'erreur et correction animée
        v.pause(); s.phase = "correct"; s.start = now; this.notify();
        seek(v, s.ev.t);
      }
    } else if (s.phase === "reveal") {
      shown = Math.min(s.ov.items.length, Math.floor(el / STEP) + 1);
      if (el >= s.ov.items.length * STEP + 1) { s.phase = s.ov.correction ? "correct" : "done"; s.start = now; this.notify(); }
    } else if (s.phase === "correct") {
      corr = Math.min(1, el / CORR_DUR);
      if (el >= CORR_DUR + 2.5) {
        if (s.mode === "seq" && !s.mapOnly) { this.restart(); return; }
        s.phase = "done"; this.notify();
      }
    } else if (s.phase === "done") corr = s.ov.correction ? 1 : -1;
    this.draw(tNow, shown, corr);
    this.raf = requestAnimationFrame(this._tick);
  };

  /* ---------- rendu ---------- */
  RealView.prototype.draw = function (tNow, shown, corr) {
    const s = this.s, c = this.el.overlay, ctx = this.ctx;
    const dpr = root.devicePixelRatio || 1, cw = Math.round(c.clientWidth * dpr), ch = Math.round(c.clientHeight * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    ctx.clearRect(0, 0, c.width, c.height);
    this.drawMap(tNow, shown, corr);
    if (s.mapOnly) return;
    const proj = s.pr.at(tNow);
    if (!proj.ok) { this.message(REASONS[proj.reason] + " (dessins masqués sur l'image)"); return; }
    this.message(null);
    const v = this.el.video, vw = v.videoWidth || 16, vh = v.videoHeight || 9;
    const k = Math.min(c.width / vw, c.height / vh), rw = vw * k, rh = vh * k, rx = (c.width - rw) / 2, ry = (c.height - rh) / 2;
    const seen = [];                                 // points dessinés (pour placer la petite carte hors du chemin)
    const P = (x, y) => { const q = proj.project(x, y); const r = q ? [rx + q[0] * rw, ry + q[1] * rh] : null; if (r) seen.push(r); return r; };
    const st = O.stateAt(s.frames, tNow), byId = new Map(st.players.map((p) => [p.id, p]));
    const posOf = (it) => { const p = it.id != null ? byId.get(it.id) : null; return p ? [p.x, p.y, p] : (it.id != null && s.mode === "seq" && Math.abs(tNow - s.ev.t) > 0.3 ? null : [it.x, it.y, null]); };
    const unit = Math.max(1, rh / 360);
    ctx.lineJoin = ctx.lineCap = "round";
    // étiquettes posées à la fin (au plus 3), en évitant : la petite carte, les joueurs, les flèches, le fantôme
    this.labelQ = []; this.obst = [];
    const mapEl = this.el.map;
    if (mapEl.offsetParent && getComputedStyle(mapEl).display !== "none") {
      const a = c.getBoundingClientRect(), b = mapEl.getBoundingClientRect(), sx = c.width / Math.max(1, a.width), sy = c.height / Math.max(1, a.height);
      this.obst.push([(b.left - a.left) * sx, (b.top - a.top) * sy, (b.right - a.left) * sx, (b.bottom - a.top) * sy]);
    }
    st.players.forEach((p) => { if (p.b) this.obst.push([rx + (p.b[0] / 1000) * rw, ry + (p.b[1] / 1000) * rh, rx + (p.b[2] / 1000) * rw, ry + (p.b[3] / 1000) * rh]); });
    const labels = corr < 0;                        // pendant la correction, les étiquettes de l'erreur s'effacent (lisibilité)
    s.ov.items.slice(0, shown).map((it) => (labels ? it : Object.assign({}, it, { label: null }))).forEach((it, idx) => {
      if (it.type === "ring") {
        const q = posOf(it); if (!q) return;
        const pl = q[2], boxW = pl && pl.b ? ((pl.b[2] - pl.b[0]) / 1000) * rw : null;
        this.groundCircle(P, q[0], q[1], 0.75, COLOR[it.color], unit, boxW ? boxW * 1.3 : null);
        if (it.label) {
          // étiquette reliée à la tête du joueur (ou au-dessus de son cercle)
          const foot = P(q[0], q[1]);
          const head = pl && pl.b ? [rx + ((pl.b[0] + pl.b[2]) / 2000) * rw, ry + (pl.b[1] / 1000) * rh] : (foot ? [foot[0], foot[1] - 10 * unit] : null);
          if (head) this.queueLabel(it.label, COLOR[it.color], head, idx);
        }
      } else if (it.type === "arrow") this.polyArrow(it.pts.map((p) => P(p[0], p[1])), COLOR[it.color], unit, it.dashed, it.label, false, null, idx);
      else if (it.type === "line") this.polyArrow([P(it.from[0], it.from[1]), P(it.to[0], it.to[1])], COLOR[it.color], unit, it.dashed, it.label, true, null, idx);
      else if (it.type === "zone") this.zone(it.pts.map((p) => P(p[0], p[1])), COLOR[it.color], it.label, unit, idx);
    });
    if (corr >= 0 && s.ov.correction) this.drawCorrection(P, corr, unit, rx, ry, rw, rh);
    this.flushLabels(unit);
    this.autoMap(c, st, seen, unit, rx, ry, rw, rh);
  };

  /* Mode « carte automatique » : la petite carte va dans le coin qui cache le moins les joueurs et les dessins (les marges noires
     d'une vidéo verticale sont idéales). Le coin ne change que si le gain est net. */
  RealView.prototype.autoMap = function (c, st, seen, unit, rx, ry, rw, rh) {
    const r = this.el.root, mapEl = this.el.map;
    if (!r || !r.dataset || r.dataset.mapMode !== "auto" || r.classList.contains("map-only") || r.classList.contains("map-big") || !mapEl.offsetParent) return;
    const a = c.getBoundingClientRect(), b = mapEl.getBoundingClientRect();
    if (!a.width || !a.height || !b.width) return;
    const sx = c.width / a.width, sy = c.height / a.height, occ = [], pad = 18 * unit;
    st.players.forEach((p) => { if (p.b) occ.push([rx + (p.b[0] / 1000) * rw, ry + (p.b[1] / 1000) * rh, rx + (p.b[2] / 1000) * rw, ry + (p.b[3] / 1000) * rh]); });
    seen.forEach((q) => occ.push([q[0] - pad, q[1] - pad, q[0] + pad, q[1] + pad]));
    const corners = ["br", "bl", "tl", "tr"], cur = corners.find((k) => r.classList.contains("map-" + k)) || null;
    const best = O.chooseCorner({ w: c.width, h: c.height }, { w: b.width * sx, h: b.height * sy }, occ, cur, 10 * sx);
    if (best !== cur) corners.forEach((k) => r.classList.toggle("map-" + k, k === best));
  };

  /* File des étiquettes : une demande = un texte, une couleur, un point d'attache ; prio basse = plus important. */
  RealView.prototype.queueLabel = function (text, color, anchor, prio) {
    if (!this.labelQ || !text || !anchor) return;
    this.labelQ.push({ text, color, anchor, prio: prio == null ? 50 : prio });
  };
  const MAX_LABELS = 3;
  /* Pose des étiquettes : regroupement des textes identiques, 3 au plus, plus petites, sur le côté,
     sans chevaucher ni les autres étiquettes, ni les joueurs, ni les flèches, ni le fantôme, ni la petite carte. */
  RealView.prototype.flushLabels = function (unit) {
    const ctx = this.ctx, groups = new Map();
    (this.labelQ || []).forEach((q) => {
      const key = q.text + "|" + q.color, g = groups.get(key);
      if (g) { g.anchors.push(q.anchor); g.prio = Math.min(g.prio, q.prio); } else groups.set(key, { text: q.text, color: q.color, anchors: [q.anchor], prio: q.prio });
    });
    const list = [...groups.values()].sort((a, b) => a.prio - b.prio).slice(0, MAX_LABELS);
    ctx.save();
    ctx.font = "600 " + Math.round(12.5 * unit) + "px system-ui, sans-serif";
    const placed = [], W = ctx.canvas.width, H = ctx.canvas.height;
    const overlap = (r, o) => Math.max(0, Math.min(r[2], o[2]) - Math.max(r[0], o[0])) * Math.max(0, Math.min(r[3], o[3]) - Math.max(r[1], o[1]));
    list.forEach((g) => {
      const w = ctx.measureText(g.text).width + 12 * unit, h = 18 * unit;
      const ax = g.anchors.reduce((s, a) => s + a[0], 0) / g.anchors.length, ay = Math.min(...g.anchors.map((a) => a[1]));
      const cands = [];
      for (const k of [1, 1.8, 2.8]) for (const [dx, dy] of [[1, -0.6], [-1, -0.6], [1, 0.4], [-1, 0.4], [0, -1.4], [1, -1.4], [-1, -1.4]]) {
        cands.push([ax + dx * (w / 2 + 26 * unit) * k, ay + dy * (h + 18 * unit) * k]);
      }
      let best = null, bestCost = Infinity;
      cands.forEach(([x, y]) => {
        const r = [x - w / 2 - 3 * unit, y - h / 2 - 3 * unit, x + w / 2 + 3 * unit, y + h / 2 + 3 * unit];
        if (r[0] < 0 || r[1] < 0 || r[2] > W || r[3] > H) return;
        let cost = 0; this.obst.concat(placed).forEach((o) => { cost += overlap(r, o); });
        cost += Math.hypot(x - ax, y - ay) * 0.5;          // à coût égal, la position la plus proche
        if (cost < bestCost) { bestCost = cost; best = [x, y, r]; }
      });
      if (!best) return;
      const [x, y, r] = best;
      placed.push(r);
      // traits vers chaque joueur concerné (un seul texte pour plusieurs joueurs)
      ctx.strokeStyle = g.color; ctx.lineWidth = 1.8 * unit; ctx.fillStyle = g.color;
      g.anchors.forEach((a) => {
        const ex = Math.max(x - w / 2, Math.min(x + w / 2, a[0])), ey = a[1] < y ? y - h / 2 : y + h / 2;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(a[0], a[1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(a[0], a[1], 2.3 * unit, 0, Math.PI * 2); ctx.fill();
      });
      const x0 = x - w / 2, y0 = y - h / 2, rr = 4 * unit;
      ctx.fillStyle = "#0b1220e6"; ctx.lineWidth = 1.3 * unit;
      ctx.beginPath(); ctx.moveTo(x0 + rr, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, rr); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, rr); ctx.arcTo(x0, y0 + h, x0, y0, rr); ctx.arcTo(x0, y0, x0 + w, y0, rr); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(g.text, x, y + 0.5);
    });
    ctx.restore();
    this.labelQ = null;
  };
  /* Obstacle pour les étiquettes : le long d'un tracé (flèche, ligne). */
  RealView.prototype.obstaclePath = function (pts, unit) {
    if (!this.obst) return;
    const r = 7 * unit;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (10 * unit)));
      for (let j = 0; j <= n; j++) { const x = lerp(a[0], b[0], j / n), y = lerp(a[1], b[1], j / n); this.obst.push([x - r, y - r, x + r, y + r]); }
    }
  };

  /* Cercle au sol ; maxW : largeur maximale à l'écran (joueur proche de la caméra : cercle réduit). */
  RealView.prototype.groundCircle = function (P, x, y, r, color, unit, maxW) {
    const ctx = this.ctx;
    const ring = (rr) => { const out = []; for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, q = P(x + rr * Math.cos(a), y + rr * Math.sin(a)); if (q) out.push(q); } return out; };
    let pts = ring(r);
    if (maxW && pts.length >= 10) {
      const wpx = Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0]));
      if (wpx > maxW) pts = ring(r * Math.max(0.35, maxW / wpx));
    }
    if (pts.length < 10) return;
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
    ctx.fillStyle = color + "33"; ctx.fill();
    ctx.lineWidth = 3.5 * unit; ctx.strokeStyle = color; ctx.stroke();
  };

  RealView.prototype.polyArrow = function (pts, color, unit, dashed, label, noHead, progress, prio) {
    const ctx = this.ctx;
    pts = pts.filter(Boolean);
    if (pts.length < 2) return;
    if (progress != null && progress < 1) {          // tracé progressif (correction)
      const n = Math.max(2, Math.ceil(pts.length * progress)), last = pts[n - 1], prev = pts[n - 2];
      const k = pts.length === 2 ? progress : 1;
      pts = pts.slice(0, n - 1).concat([[lerp(prev[0], last[0], k), lerp(prev[1], last[1], k)]]);
    }
    ctx.save();
    ctx.setLineDash(dashed ? [10 * unit, 8 * unit] : []);
    ctx.lineWidth = 4 * unit; ctx.strokeStyle = color; ctx.shadowColor = "#000a"; ctx.shadowBlur = 4 * unit;
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    ctx.setLineDash([]);
    if (!noHead) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hs = 14 * unit;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - hs * Math.cos(ang - 0.45), b[1] - hs * Math.sin(ang - 0.45));
      ctx.lineTo(b[0] - hs * Math.cos(ang + 0.45), b[1] - hs * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    this.obstaclePath(pts, unit);
    if (label) { const m = pts[Math.floor(pts.length / 2)], m2 = pts[Math.max(0, Math.floor(pts.length / 2) - 1)]; this.queueLabel(label, color, [(m[0] + m2[0]) / 2, (m[1] + m2[1]) / 2], prio); }
  };

  RealView.prototype.zone = function (pts, color, label, unit, prio) {
    const ctx = this.ctx; pts = pts.filter(Boolean); if (pts.length < 3) return;
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
    ctx.fillStyle = color + "2e"; ctx.fill(); ctx.setLineDash([8 * unit, 6 * unit]); ctx.lineWidth = 2 * unit; ctx.strokeStyle = color; ctx.stroke(); ctx.setLineDash([]);
    if (label) { const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length; this.queueLabel(label, color, [cx, cy], (prio || 0) + 20); }
  };

  RealView.prototype.cross = function (P, x, y, unit, k) {
    const ctx = this.ctx, a = P(x - 0.45, y - 0.45), b = P(x + 0.45, y + 0.45), c = P(x - 0.45, y + 0.45), d = P(x + 0.45, y - 0.45);
    if (!a || !b || !c || !d) return;
    ctx.save(); ctx.globalAlpha = ease(k); ctx.lineWidth = 6 * unit; ctx.strokeStyle = COLOR.err; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke(); ctx.restore();
  };

  /* Étiquette centrée en (x, y) ; anchor (facultatif) : point du joueur auquel la relier par un petit trait. */
  RealView.prototype.tag = function (ctx, x, y, text, color, unit, anchor) {
    ctx.save();
    ctx.font = "600 " + Math.round(15 * unit) + "px system-ui, sans-serif";
    const w = ctx.measureText(text).width + 12 * unit, h = 22 * unit;
    // les étiquettes ne se chevauchent pas et évitent la petite carte : on les décale vers le haut, puis de côté
    if (this.placed && ctx === this.ctx) {
      const hit = (cx, cy) => this.placed.some((r) => cx - w / 2 < r[2] && cx + w / 2 > r[0] && cy - h / 2 < r[3] && cy + h / 2 > r[1]);
      let tries = 0;
      while (hit(x, y) && tries < 8) { y -= h + 6 * unit; tries++; }
      if (hit(x, y) || y - h / 2 < 0) { for (const dx of [-1, 1]) { const nx = x + dx * (w + 10 * unit), ny = Math.max(h, anchor ? anchor[1] - 30 * unit : y); if (!hit(nx, ny) && nx - w / 2 > 0 && nx + w / 2 < ctx.canvas.width) { x = nx; y = ny; break; } } }
      this.placed.push([x - w / 2 - 3 * unit, y - h / 2 - 3 * unit, x + w / 2 + 3 * unit, y + h / 2 + 3 * unit]);
    }
    if (anchor) {
      const ex = Math.max(x - w / 2, Math.min(x + w / 2, anchor[0])), ey = anchor[1] < y ? y - h / 2 : y + h / 2;
      ctx.strokeStyle = color; ctx.lineWidth = 2 * unit;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(anchor[0], anchor[1]); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(anchor[0], anchor[1], 2.5 * unit, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#0b1220e0"; ctx.strokeStyle = color; ctx.lineWidth = 1.5 * unit;
    const x0 = x - w / 2, y0 = y - h / 2, r = 5 * unit;
    ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r); ctx.arcTo(x0, y0 + h, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  };

  /* Correction animée sur l'image : croix sur la passe coupée, ligne verte, fantôme qui se déplace, flèche verte. */
  RealView.prototype.drawCorrection = function (P, k, unit, rx, ry, rw, rh) {
    const s = this.s, c = s.ov.correction, ctx = this.ctx;
    c.crosses.forEach((x) => this.cross(P, x.x, x.y, unit, Math.min(1, k * 3)));
    c.lines.forEach((l) => this.polyArrow([P(l.from[0], l.from[1]), P(l.to[0], l.to[1])], COLOR.ok, unit, false, k > 0.3 ? l.label : null, false, Math.min(1, k * 2), -5));
    // flèches vertes sans texte : l'étiquette de la correction est posée à côté du fantôme (jamais dessus)
    c.arrows.forEach((a) => this.polyArrow(a.pts.map((p) => P(p[0], p[1])), COLOR.ok, unit, true, null, false, ease((k - 0.1) / 0.8)));
    const g = c.ghost; if (!g) return;
    // arrivée hors du cadre (devant la caméra, sur le côté) : pas de fantôme coupé, renvoi vers le plan au bord de l'image
    const end = P(g.to[0], g.to[1]), mx = rw * 0.02, my = rh * 0.02;
    if (!end || end[0] < rx - mx || end[0] > rx + rw + mx || end[1] < ry - my || end[1] > ry + rh + my) {
      if (k > 0.6 && end) {
        const ex = Math.max(rx + 70 * unit, Math.min(rx + rw - 70 * unit, end[0])), ey = Math.max(ry + 20 * unit, Math.min(ry + rh - 20 * unit, end[1]));
        this.queueLabel((g.label ? g.label + " : " : "") + "voir le plan", COLOR.ok, [ex, ey], -10);
      }
      return;
    }
    const m = ease((k - 0.15) / 0.75), x = lerp(g.from[0], g.to[0], m), y = lerp(g.from[1], g.to[1], m);
    const foot = P(x, y), f0 = P(g.from[0], g.from[1]);
    if (!foot || !f0) return;
    // échelle locale : surface projetée d'un carré de 1 m à l'arrivée / au départ (la perspective joue dans les deux directions)
    const area = (cx0, cy0) => { const q = [P(cx0, cy0), P(cx0 + 1, cy0), P(cx0 + 1, cy0 + 1), P(cx0, cy0 + 1)]; if (q.some((p) => !p)) return NaN; let a = 0; for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p[0] * n[1] - n[0] * p[1]; } return Math.abs(a) / 2; };
    const scale = Math.sqrt(area(x, y) / Math.max(1e-6, area(g.from[0], g.from[1])));
    if (!isFinite(scale) || scale <= 0) return;
    const src = s.ghostBox ? [s.ghostBox[0] * rw, s.ghostBox[1] * rh] : [rh * 0.05, rh * 0.15];
    const cap = Math.min(1, (rh * 0.45) / Math.max(1, src[1] * scale * GHOST_SCALE));   // jamais plus haut que 45 % de l'image
    const gw = src[0] * scale * GHOST_SCALE * cap, gh = src[1] * scale * GHOST_SCALE * cap;
    this.groundCircle(P, x, y, 0.75, COLOR.ok, unit);
    ctx.save();
    if (s.ghost) { ctx.globalAlpha = 0.95; ctx.drawImage(s.ghost, foot[0] - gw / 2, foot[1] - gh, gw, gh); }
    else this.ghostShape(ctx, foot[0], foot[1], gw, gh, unit);
    ctx.restore();
    if (this.obst) this.obst.push([foot[0] - gw / 2, foot[1] - gh, foot[0] + gw / 2, foot[1]]);   // jamais d'étiquette sur le fantôme
    if (g.label && k > 0.6) this.queueLabel(g.label, COLOR.ok, [foot[0] + gw * 0.3, foot[1] - gh * 0.6], -10);
  };

  /* Silhouette verte nette (repli quand la découpe est absente ou de mauvaise qualité). */
  RealView.prototype.ghostShape = function (ctx, fx, fy, gw, gh, unit) {
    ctx.fillStyle = COLOR.ok + "b3"; ctx.strokeStyle = "#14532d"; ctx.lineWidth = 3 * unit;
    ctx.beginPath(); ctx.ellipse(fx, fy - gh * 0.42, Math.max(gw * 0.36, 6 * unit), gh * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(fx, fy - gh * 0.93, Math.max(gw * 0.2, 4 * unit), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = COLOR.ok; ctx.lineWidth = 1.5 * unit;
    ctx.beginPath(); ctx.ellipse(fx, fy - gh * 0.42, Math.max(gw * 0.36, 6 * unit) + 2 * unit, gh * 0.42 + 2 * unit, 0, 0, Math.PI * 2); ctx.stroke();
  };

  /* Découpe du joueur à déplacer (silhouette), teintée en vert ; repli sur une silhouette simplifiée. */
  RealView.prototype.prepareGhost = async function (s) {
    const g = s.ov.correction.ghost, key = s.ev.t + ":" + g.id;
    const st = O.stateAt(s.frames, s.ev.t), pl = st.players.find((p) => p.id === g.id);
    if (!pl || !pl.b) return;
    s.ghostBox = [(pl.b[2] - pl.b[0]) / 1000, (pl.b[3] - pl.b[1]) / 1000];
    if (this.ghosts.has(key)) { const c = this.ghosts.get(key); s.ghost = c ? c.canvas : null; if (c) s.ghostBox = c.box; s.ghostQuality = c ? "ok" : "repli"; return; }
    const v = this.el.video, vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return;
    this.message("Découpe du joueur en cours… (quelques secondes la première fois)");
    s.ghostQuality = "repli";
    try {
      const k = 1024 / Math.max(vw, vh), w = Math.round(vw * k), h = Math.round(vh * k);
      const box = [pl.b[0] / 1000 * w, pl.b[1] / 1000 * h, pl.b[2] / 1000 * w, pl.b[3] / 1000 * h];
      const bw = box[2] - box[0], bh = box[3] - box[1];
      // un autre joueur trop proche : la découpe mélangerait les deux silhouettes
      const iou = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])); const i = ix * iy; return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i); };
      const crowded = st.players.some((q) => q.id !== pl.id && q.b && iou(pl.b, q.b) > 0.12);
      const cut = pl.b[0] <= 4 || pl.b[1] <= 4 || pl.b[2] >= 996 || pl.b[3] >= 992;   // joueur coupé par le bord de l'image
      if (bh < 45) s.ghostQuality = "trop-petit";
      else if (cut) s.ghostQuality = "coupé";
      else if (crowded) s.ghostQuality = "trop-proche";
      else {
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const cx = cv.getContext("2d", { willReadFrequently: true });
        cx.drawImage(v, 0, 0, w, h);
        const img = cx.getImageData(0, 0, w, h);
        const res = await Promise.race([s.o.segment({ imgId: "corr" + Date.now().toString(36), width: w, height: h, buffer: img.data.buffer.slice(0), boxes: [box] }), new Promise((r) => setTimeout(() => r({ error: "délai" }), 20000))]);
        const m = res && !res.error && res.masks && res.masks[0];
        const made = m && m.w && m.h ? this.buildGhost(cx, m, bw, bh) : null;
        if (made && made.ok) { s.ghost = made.canvas; s.ghostBox = [made.canvas.width / w, made.canvas.height / h]; s.ghostQuality = "ok"; }
        else if (made) s.ghostQuality = made.reason;
      }
    } catch (_e) { s.ghostQuality = "repli"; }
    this.ghosts.set(key, s.ghost ? { canvas: s.ghost, box: s.ghostBox } : null);
    if (this.s === s) this.message(null);
  };

  /* Silhouette teintée en vert avec contour net ; refusée si elle est incomplète, trop petite ou floue. */
  RealView.prototype.buildGhost = function (cx, m, bw, bh) {
    const src = cx.getImageData(m.x0, m.y0, m.w, m.h), d = src.data;
    let x0 = m.w, y0 = m.h, x1 = 0, y1 = 0, area = 0, grad = 0, gn = 0;
    const lum = (i) => 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    for (let i = 0; i < m.w * m.h; i++) {
      if (!m.data[i]) continue;
      const x = i % m.w, y = (i / m.w) | 0;
      area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && y > 0 && x < m.w - 1 && y < m.h - 1) { grad += Math.abs(lum(i + 1) - lum(i - 1)) + Math.abs(lum(i + m.w) - lum(i - m.w)); gn++; }
    }
    if (!area || x1 <= x0 || y1 <= y0) return { ok: false, reason: "vide" };
    if ((y1 - y0 + 1) < bh * 0.6 || area < bw * bh * 0.2) return { ok: false, reason: "incomplète" };
    if (gn && grad / gn < 6) return { ok: false, reason: "floue" };
    const pad = 3, W = x1 - x0 + 1 + 2 * pad, H = y1 - y0 + 1 + 2 * pad;
    const sil = document.createElement("canvas"); sil.width = W; sil.height = H;
    const tin = document.createElement("canvas"); tin.width = W; tin.height = H;
    const sd = sil.getContext("2d").createImageData(W, H), td = tin.getContext("2d").createImageData(W, H);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * m.w + x; if (!m.data[i]) continue;
      const o = ((y - y0 + pad) * W + (x - x0 + pad)) * 4, l = lum(i);
      sd.data[o] = 22; sd.data[o + 1] = 163; sd.data[o + 2] = 74; sd.data[o + 3] = 255;                 // contour : vert franc
      td.data[o] = l * 0.2; td.data[o + 1] = 150 + l * 0.42; td.data[o + 2] = l * 0.25; td.data[o + 3] = 250;   // corps : vert teinté
    }
    sil.getContext("2d").putImageData(sd, 0, 0); tin.getContext("2d").putImageData(td, 0, 0);
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const oc = out.getContext("2d");
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) oc.drawImage(sil, dx, dy);
    oc.drawImage(tin, 0, 0);
    return { ok: true, canvas: out };
  };

  /* ---------- petite carte (ou plan en grand si l'image n'est pas utilisable) ---------- */
  /* Zone filmée sur la petite carte : activée par défaut. */
  RealView.prototype.setFov = function (on) { this.fov = on !== false; };
  RealView.prototype.drawMap = function (tNow, shown, corr) {
    const s = this.s, c = this.el.map, ctx = this.mctx;
    const dpr = root.devicePixelRatio || 1, cw = Math.max(2, Math.round(c.clientWidth * dpr)), ch = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    if (s.catalog) {
      const E = root.FutsalAnim, V = E.VIEW, sc = Math.min(cw / V.w, ch / V.h), T = ((performance.now() - s.catT0) / 1000) % s.catalog.duration;
      ctx.fillStyle = "#0b1510"; ctx.fillRect(0, 0, cw, ch);
      ctx.save(); ctx.translate((cw - V.w * sc) / 2, (ch - V.h * sc) / 2);
      E.drawOps(ctx, root.FutsalScenes.sequenceOps(s.catalog, T), sc);
      ctx.restore();
      return;
    }
    const L = s.L, W = s.W, pad = 0.06 * Math.min(cw, ch), k = Math.min((cw - 2 * pad) / L, (ch - 2 * pad) / W);
    const ox = (cw - L * k) / 2, oy = (ch - W * k) / 2, M = (x, y) => [ox + x * k, oy + y * k], u = Math.max(1, cw / 330);
    ctx.fillStyle = "#1d5a3a"; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(ox, oy, L * k, W * k);
    ctx.beginPath(); ctx.moveTo(ox + (L / 2) * k, oy); ctx.lineTo(ox + (L / 2) * k, oy + W * k); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox + (L / 2) * k, oy + (W / 2) * k, 3 * k, 0, Math.PI * 2); ctx.stroke();
    [0, L].forEach((gx) => { ctx.beginPath(); ctx.arc(ox + gx * k, oy + (W / 2) * k, 6 * k, gx ? Math.PI / 2 : -Math.PI / 2, gx ? Math.PI * 1.5 : Math.PI / 2); ctx.stroke(); });
    // zone réellement filmée à cet instant : le reste du terrain est assombri (rien n'est dessiné si la projection est inutilisable)
    if (this.fov !== false && !s.mapOnly) {
      const pj = s.pr.at(tNow), zone = pj.ok && pj.H ? O.visibleZone(pj.H, L, W) : null;
      if (zone) {
        ctx.save();
        ctx.beginPath(); ctx.rect(ox, oy, L * k, W * k);
        zone.forEach((p, n) => { const q = M(p[0], p[1]); if (n) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        ctx.closePath(); ctx.fillStyle = "rgba(4,14,9,0.5)"; ctx.fill("evenodd");
        ctx.beginPath(); zone.forEach((p, n) => { const q = M(p[0], p[1]); if (n) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        ctx.closePath(); ctx.setLineDash([5 * u, 3 * u]); ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 1.6 * u; ctx.stroke();
        ctx.restore();
        this.fovShown = true;
      } else this.fovShown = false;
    }
    const st = O.stateAt(s.frames, tNow), byId = new Map(st.players.map((p) => [p.id, p]));
    const it = s.ov.items.slice(0, shown);
    it.forEach((i) => {
      if (i.type === "zone") { ctx.fillStyle = COLOR[i.color] + "40"; ctx.beginPath(); i.pts.forEach((p, n) => { const q = M(p[0], p[1]); if (n) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fill(); }
    });
    it.forEach((i) => {
      if (i.type === "arrow" || i.type === "line") this.mapLine(ctx, (i.pts || [i.from, i.to]).map((p) => M(p[0], p[1])), COLOR[i.color], u, i.dashed);
    });
    st.players.forEach((p) => { const q = M(p.x, p.y); ctx.fillStyle = TEAM[p.team] || "#ccc"; ctx.beginPath(); ctx.arc(q[0], q[1], 4.5 * u, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1 * u; ctx.stroke(); });
    if (st.ball) { const q = M(st.ball.x, st.ball.y); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(q[0], q[1], 2.6 * u, 0, Math.PI * 2); ctx.fill(); }
    it.forEach((i) => {
      if (i.type !== "ring") return;
      const p = byId.get(i.id), q = p ? M(p.x, p.y) : M(i.x, i.y);
      ctx.strokeStyle = COLOR[i.color]; ctx.lineWidth = 2.5 * u; ctx.beginPath(); ctx.arc(q[0], q[1], 8 * u, 0, Math.PI * 2); ctx.stroke();
    });
    if (corr >= 0 && s.ov.correction) {
      const cr = s.ov.correction;
      cr.lines.forEach((l) => this.mapLine(ctx, [M(l.from[0], l.from[1]), M(l.to[0], l.to[1])], COLOR.ok, u));
      cr.arrows.forEach((a) => this.mapLine(ctx, a.pts.map((p) => M(p[0], p[1])), COLOR.ok, u, true));
      cr.crosses.forEach((x) => { const q = M(x.x, x.y), r = 5 * u; ctx.strokeStyle = COLOR.err; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(q[0] - r, q[1] - r); ctx.lineTo(q[0] + r, q[1] + r); ctx.moveTo(q[0] - r, q[1] + r); ctx.lineTo(q[0] + r, q[1] - r); ctx.stroke(); });
      if (cr.ghost) {
        // cible verte, fantôme (ellipse) qui s'y rend, étiquette à côté
        const tq = M(cr.ghost.to[0], cr.ghost.to[1]);
        ctx.strokeStyle = COLOR.ok; ctx.lineWidth = 2.5 * u;
        [9, 5].forEach((r) => { ctx.beginPath(); ctx.arc(tq[0], tq[1], r * u, 0, Math.PI * 2); ctx.stroke(); });
        const m = ease((corr - 0.15) / 0.75), q = M(lerp(cr.ghost.from[0], cr.ghost.to[0], m), lerp(cr.ghost.from[1], cr.ghost.to[1], m));
        ctx.fillStyle = COLOR.ok + "d9"; ctx.strokeStyle = "#14532d"; ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.ellipse(q[0], q[1], 6.5 * u, 4.5 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (cr.ghost.label && corr > 0.6) this.tag(ctx, tq[0] + (tq[0] < cw - 90 * u ? 1 : -1) * 55 * u, tq[1] - 16 * u, cr.ghost.label, COLOR.ok, u * 0.8, tq);
      }
    }
  };
  RealView.prototype.mapLine = function (ctx, pts, color, u, dashed) {
    if (pts.length < 2) return;
    ctx.save(); ctx.setLineDash(dashed ? [5 * u, 4 * u] : []); ctx.strokeStyle = color; ctx.lineWidth = (color === COLOR.ok ? 3.5 : 2.5) * u;
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    // pointe de flèche
    const a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hs = 7 * u;
    ctx.setLineDash([]); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(b[0], b[1]);
    ctx.lineTo(b[0] - hs * Math.cos(ang - 0.5), b[1] - hs * Math.sin(ang - 0.5)); ctx.lineTo(b[0] - hs * Math.cos(ang + 0.5), b[1] - hs * Math.sin(ang + 0.5)); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  root.FutsalRealView = { RealView, REASONS, SEQ_BEFORE, SEQ_AFTER };
})(window);
