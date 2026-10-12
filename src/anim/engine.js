/* Moteur d'animation tactique en vue de dessus.
   Une scène (données) + un instant t -> liste d'opérations de dessin (en mètres), rendue
   à l'identique sur un canvas (animation, vidéo) ou en SVG (rapport PDF, images fixes).
   Repère : terrain 40 x 20 m, mon équipe (A, bleu) attaque vers la droite (x croissant). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalAnim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const L = 40, W = 20;
  const VIEW = { x: -1, y: -3, w: 42, h: 26.25 };   // 1280 x 800
  const COURT_VIEW = { x: -1, y: -1, w: 42, h: 22 };  // terrain seul (mini-carte, cartes de chaleur)
  const COLORS = {
    bg: "#0f1a14", pitch1: "#1d6b3a", pitch2: "#1a5f34", line: "#f1f5ee", A: "#2f6fed", B: "#e5484d",
    GKA: "#f2b705", GKB: "#ff8a3d", cone: "#ff9f1c", ball: "#ffffff", text: "#f1f5ee", dim: "#9fb3a5",
    bad: "#ff5a5f", good: "#3ddc84", pass: "#f1f5ee", press: "#ffb020", target: "#3ddc84", danger: "#ff5a5f", free: "#5b93ff"
  };
  const ARROW_STYLES = {
    pass: { color: COLORS.pass, dash: false }, run: { color: COLORS.pass, dash: true },
    bad: { color: COLORS.bad, dash: false }, badrun: { color: COLORS.bad, dash: true },
    good: { color: COLORS.good, dash: false }, goodrun: { color: COLORS.good, dash: true },
    press: { color: COLORS.press, dash: true }
  };
  const BADGES = {
    erreur: { text: "ERREUR OBSERVÉE", color: COLORS.bad }, correction: { text: "CORRECTION", color: COLORS.good },
    exercice: { text: "EXERCICE", color: COLORS.free }, consigne: { text: "CONSIGNE", color: COLORS.press }
  };

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (u) => u * u * (3 - 2 * u);

  /* Position le long d'une trajectoire [[t, x, y], ...] (interpolation douce entre points clés). */
  function positionAt(path, t) {
    if (!path || !path.length) return null;
    if (t <= path[0][0]) return [path[0][1], path[0][2]];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (t <= b[0]) {
        if (b[0] - a[0] < 0.011) return [b[1], b[2]];    // saut instantané
        const u = ease(clamp01((t - a[0]) / (b[0] - a[0])));
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      }
    }
    const last = path[path.length - 1];
    return [last[1], last[2]];
  }

  function actorPos(scene, id, t) {
    const a = scene.actors.find((x) => x.id === id);
    if (!a) return null;
    const p = positionAt(scene.moves[id], t);
    return p || [a.x, a.y];
  }

  function resolvePoint(scene, p, t) {
    if (typeof p === "string") return actorPos(scene, p, t);
    return p;
  }

  /* Contrôle de cohérence d'une scène ; renvoie la liste des problèmes. */
  function validate(scene) {
    const errs = [];
    const bad = (m) => errs.push((scene && scene.id ? scene.id + " : " : "") + m);
    if (!scene || !scene.id || !scene.title) return ["scène sans identifiant ou titre"];
    if (!(scene.duration > 0)) bad("durée invalide");
    const ids = new Set();
    (scene.actors || []).forEach((a) => {
      if (ids.has(a.id)) bad("acteur en double " + a.id);
      ids.add(a.id);
      if (!isFinite(a.x) || !isFinite(a.y) || a.x < -1 || a.x > L + 1 || a.y < -1 || a.y > W + 1) bad("acteur hors terrain " + a.id);
    });
    Object.keys(scene.moves || {}).forEach((id) => {
      if (!ids.has(id)) bad("déplacement d'un acteur inconnu " + id);
      let last = -1;
      scene.moves[id].forEach((k) => {
        if (k.length !== 3 || !k.every(isFinite)) bad("point clé invalide pour " + id);
        if (k[0] < last) bad("temps non croissants pour " + id);
        last = k[0];
        if (k[0] > scene.duration + 0.01) bad("point clé après la fin pour " + id);
        if (k[1] < -1 || k[1] > L + 1 || k[2] < -1 || k[2] > W + 1) bad("position hors terrain pour " + id);
      });
    });
    let last = -1;
    (scene.ball || []).forEach((k) => {
      if (k.length !== 3 || !k.every(isFinite)) bad("point clé du ballon invalide");
      if (k[0] < last) bad("temps du ballon non croissants");
      last = k[0];
      if (k[1] < -1 || k[1] > L + 1 || k[2] < -1 || k[2] > W + 1) bad("ballon hors terrain");
    });
    (scene.arrows || []).forEach((a) => {
      if (!ARROW_STYLES[a.kind]) bad("type de flèche inconnu " + a.kind);
      [a.from, a.to].forEach((p) => {
        if (typeof p === "string" ? !ids.has(p) : !(Array.isArray(p) && p.length === 2 && p.every(isFinite))) bad("extrémité de flèche invalide");
      });
      if (!(a.t1 >= a.t0) || a.t0 < 0 || a.t1 > scene.duration + 0.01) bad("temps de flèche invalide");
    });
    (scene.zones || []).forEach((z) => {
      if (!["danger", "free", "press", "target"].includes(z.kind)) bad("type de zone inconnu " + z.kind);
      if (!(Array.isArray(z.rect) && z.rect.length === 4 && z.rect.every(isFinite)) && !(Array.isArray(z.circle) && z.circle.length === 3 && z.circle.every(isFinite))) bad("forme de zone invalide");
      if (!(z.t1 > z.t0) || z.t0 < 0 || z.t1 > scene.duration + 0.01) bad("temps de zone invalide");
    });
    if (!scene.steps || !scene.steps.length) bad("aucune légende");
    (scene.steps || []).forEach((s) => {
      if (!BADGES[s.badge]) bad("badge inconnu " + s.badge);
      if (!(s.t1 > s.t0) || s.t0 < 0 || s.t1 > scene.duration + 0.01 || !s.text) bad("légende invalide");
    });
    return errs;
  }

  /* ---- Construction des opérations de dessin ---- */
  function pitchOps(ops) {
    ops.push({ k: "rect", x: VIEW.x, y: VIEW.y, w: VIEW.w, h: VIEW.h, fill: COLORS.bg });
    ops.push({ k: "rect", x: -0.8, y: -0.8, w: L + 1.6, h: W + 1.6, fill: COLORS.pitch2 });
    for (let i = 0; i < 8; i++) ops.push({ k: "rect", x: i * 5, y: 0, w: 2.5, h: W, fill: COLORS.pitch1, alpha: 0.6 });
    const arc = (cx, cy, r, a0, a1) => {
      const p = [];
      for (let i = 0; i <= 16; i++) { const a = ((a0 + ((a1 - a0) * i) / 16) * Math.PI) / 180; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      return p;
    };
    const left = arc(0, 8.5, 6, -90, 0).concat(arc(0, 11.5, 6, 0, 90));
    const right = left.map((p) => [L - p[0], p[1]]).reverse();
    const stroke = { stroke: COLORS.line, lw: 0.11 };
    ops.push(Object.assign({ k: "poly", pts: [[0, 0], [L, 0], [L, W], [0, W]], closed: true }, stroke));
    ops.push(Object.assign({ k: "poly", pts: [[L / 2, 0], [L / 2, W]] }, stroke));
    ops.push(Object.assign({ k: "poly", pts: arc(L / 2, W / 2, 3, 0, 360), closed: true }, stroke));
    ops.push(Object.assign({ k: "poly", pts: left }, stroke));
    ops.push(Object.assign({ k: "poly", pts: right }, stroke));
    [[6, 10], [L - 6, 10], [10, 10], [L - 10, 10], [L / 2, 10]].forEach((p) => ops.push({ k: "circle", x: p[0], y: p[1], r: 0.14, fill: COLORS.line }));
    ops.push({ k: "rect", x: -0.55, y: 8.5, w: 0.55, h: 3, fill: "#0b1510", stroke: COLORS.line, lw: 0.08 });
    ops.push({ k: "rect", x: L, y: 8.5, w: 0.55, h: 3, fill: "#0b1510", stroke: COLORS.line, lw: 0.08 });
  }

  /* Garde un texte centré à l'intérieur du cadre visible. */
  function fitX(x, s, size) {
    const half = (String(s).length * size * 0.28) + 0.3;
    return Math.max(VIEW.x + half + 0.2, Math.min(VIEW.x + VIEW.w - half - 0.2, x));
  }

  function arrowOps(scene, t, ops) {
    (scene.arrows || []).forEach((a) => {
      const t2 = a.t2 != null ? a.t2 : scene.duration + 1;
      if (t < a.t0 || t > t2) return;
      const st = ARROW_STYLES[a.kind];
      const p0 = resolvePoint(scene, a.from, a.t0), p1 = resolvePoint(scene, a.to, a.t1);
      if (!p0 || !p1) return;
      const prog = a.t1 > a.t0 ? clamp01((t - a.t0) / (a.t1 - a.t0)) : 1;
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
      // raccourcit légèrement pour ne pas masquer les joueurs
      const sx = p0[0] + (dx / len) * 0.8, sy = p0[1] + (dy / len) * 0.8;
      const ex = p1[0] - (dx / len) * 0.8, ey = p1[1] - (dy / len) * 0.8;
      if (len < 1.8) return;
      const cx = sx + (ex - sx) * prog, cy = sy + (ey - sy) * prog;
      const fade = t > t2 - 0.3 ? clamp01((t2 - t) / 0.3) : 1;
      ops.push({ k: "arrow", x1: sx, y1: sy, x2: cx, y2: cy, color: st.color, lw: st.dash ? 0.18 : 0.26, dash: st.dash, head: prog >= 0.98, alpha: fade });
      if (a.label && prog > 0.5) ops.push({ k: "text", x: fitX((sx + ex) / 2, a.label, 0.78), y: (sy + ey) / 2 - 0.6, s: a.label, size: 0.78, color: st.color, bold: true, anchor: "middle", halo: true, alpha: fade });
    });
  }

  function zoneOps(scene, t, ops) {
    (scene.zones || []).forEach((z) => {
      if (t < z.t0 || t > z.t1) return;
      const fadeIn = clamp01((t - z.t0) / 0.5), fadeOut = clamp01((z.t1 - t) / 0.4);
      const pulse = z.kind === "danger" ? 0.8 + 0.2 * Math.sin(t * 5) : 1;
      const alpha = Math.min(fadeIn, fadeOut) * pulse;
      const col = COLORS[z.kind];
      if (z.rect) ops.push({ k: "rect", x: z.rect[0], y: z.rect[1], w: z.rect[2], h: z.rect[3], fill: col, alpha: 0.22 * alpha, stroke: col, lw: 0.12, dash: true, strokeAlpha: alpha, rx: 0.4 });
      else ops.push({ k: "circle", x: z.circle[0], y: z.circle[1], r: z.circle[2], fill: col, alpha: 0.22 * alpha, stroke: col, lw: 0.12, dash: true, strokeAlpha: alpha });
      if (z.label) {
        const cx = z.rect ? z.rect[0] + z.rect[2] / 2 : z.circle[0];
        const cy = z.rect ? z.rect[1] + z.rect[3] / 2 : z.circle[1];
        ops.push({ k: "text", x: fitX(cx, z.label, 0.78), y: cy + 0.3, s: z.label, size: 0.78, color: COLORS.text, bold: true, anchor: "middle", halo: true, alpha });
      }
    });
  }

  function lineOps(scene, t, ops) {
    (scene.lines || []).forEach((l) => {
      if (t < l.t0 || t > l.t1) return;
      const a = clamp01((t - l.t0) / 0.4) * clamp01((l.t1 - t) / 0.4);
      ops.push({ k: "line", x1: l.from[0], y1: l.from[1], x2: l.to[0], y2: l.to[1], color: l.color || COLORS.press, lw: 0.16, dash: true, alpha: a });
      if (l.label) ops.push({ k: "text", x: l.from[0] + (l.align === "left" ? 0.4 : 0), y: l.from[1] - 0.35, s: l.label, size: 0.72, color: l.color || COLORS.press, bold: true, anchor: l.align === "left" ? "start" : "middle", halo: true, alpha: a });
    });
  }

  function labelOps(scene, t, ops) {
    (scene.labels || []).forEach((l) => {
      if (t < l.t0 || t > l.t1) return;
      const a = clamp01((t - l.t0) / 0.3) * clamp01((l.t1 - t) / 0.3);
      ops.push({ k: "text", x: fitX(l.x, l.text, l.size || 0.9), y: l.y, s: l.text, size: l.size || 0.9, color: l.color || COLORS.text, bold: true, anchor: "middle", halo: true, alpha: a });
    });
    (scene.marks || []).forEach((m) => {
      if (t < m.t0 || t > m.t1) return;
      const a = clamp01((t - m.t0) / 0.2) * clamp01((m.t1 - t) / 0.3);
      const col = m.kind === "check" ? COLORS.good : COLORS.bad;
      ops.push({ k: "circle", x: m.x, y: m.y, r: 0.9, fill: "#0b1510", stroke: col, lw: 0.16, alpha: a });
      ops.push({ k: "text", x: m.x, y: m.y + 0.42, s: m.kind === "check" ? "✓" : "✕", size: 1.15, color: col, bold: true, anchor: "middle", alpha: a });
    });
  }

  function actorOps(scene, t, ops) {
    scene.actors.forEach((a) => {
      if (a.t0 != null && (t < a.t0 || t > (a.t1 != null ? a.t1 : Infinity))) return;
      const p = actorPos(scene, a.id, t);
      if (a.team === "C") {
        ops.push({ k: "poly", pts: [[p[0], p[1] - 0.5], [p[0] + 0.45, p[1] + 0.35], [p[0] - 0.45, p[1] + 0.35]], closed: true, fill: COLORS.cone, stroke: "#7a4a00", lw: 0.06 });
        return;
      }
      const col = COLORS[a.team];
      ops.push({ k: "circle", x: p[0] + 0.12, y: p[1] + 0.16, r: 0.82, fill: "#000", alpha: 0.3 });
      ops.push({ k: "circle", x: p[0], y: p[1], r: 0.82, fill: col, stroke: "#ffffff", lw: 0.13 });
      const label = a.n != null ? String(a.n) : (a.team === "GKA" || a.team === "GKB" ? "G" : "");
      if (label) ops.push({ k: "text", x: p[0], y: p[1] + 0.3, s: label, size: 0.88, color: a.team === "GKA" || a.team === "GKB" ? "#1a1400" : "#ffffff", bold: true, anchor: "middle" });
      if (a.tag) ops.push({ k: "text", x: p[0], y: p[1] - 1.15, s: a.tag, size: 0.62, color: COLORS.text, bold: true, anchor: "middle", halo: true });
    });
  }

  function captionOps(scene, t, ops, opts) {
    ops.push({ k: "text", x: VIEW.x + 0.9, y: -1.35, s: scene.title, size: 1.25, color: COLORS.text, bold: true, anchor: "start", caps: true });
    if (opts && opts.subtitle) ops.push({ k: "text", x: VIEW.x + VIEW.w - 0.9, y: -1.35, s: opts.subtitle, size: 0.8, color: COLORS.dim, anchor: "end" });
    const step = scene.steps.find((s) => t >= s.t0 && t < s.t1) || scene.steps[scene.steps.length - 1];
    const b = BADGES[step.badge];
    ops.push({ k: "rect", x: VIEW.x + 0.4, y: W + 0.7, w: VIEW.w - 0.8, h: 2.9, fill: "#0b1510", alpha: 0.92, rx: 0.5, stroke: b.color, lw: 0.1 });
    ops.push({ k: "rect", x: VIEW.x + 0.4, y: W + 0.7, w: 7.6, h: 2.9, fill: b.color, rx: 0.5 });
    ops.push({ k: "text", x: VIEW.x + 4.2, y: W + 2.3, s: b.text, size: 0.74, color: "#0b1510", bold: true, anchor: "middle" });
    wrap(step.text, 62).slice(0, 2).forEach((line, i) => ops.push({ k: "text", x: VIEW.x + 8.6, y: W + 1.85 + i * 1.05, s: line, size: 0.86, color: COLORS.text, anchor: "start" }));
    // barre de progression
    ops.push({ k: "rect", x: VIEW.x + 0.4, y: W + 3.75, w: (VIEW.w - 0.8) * clamp01(t / scene.duration), h: 0.14, fill: b.color });
  }

  function wrap(text, max) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = "";
    words.forEach((w) => {
      if ((cur + " " + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function ballOps(scene, t, ops) {
    const p = positionAt(scene.ball, t);
    if (!p) return;
    ops.push({ k: "circle", x: p[0] + 0.1, y: p[1] + 0.12, r: 0.42, fill: "#000", alpha: 0.3 });
    ops.push({ k: "circle", x: p[0], y: p[1], r: 0.42, fill: COLORS.ball, stroke: "#111", lw: 0.1 });
    ops.push({ k: "circle", x: p[0], y: p[1], r: 0.15, fill: "#111" });
  }

  function buildOps(scene, t, opts) {
    const ops = [];
    t = Math.max(0, Math.min(scene.duration, t));
    pitchOps(ops);
    zoneOps(scene, t, ops);
    lineOps(scene, t, ops);
    arrowOps(scene, t, ops);
    actorOps(scene, t, ops);
    ballOps(scene, t, ops);
    labelOps(scene, t, ops);
    captionOps(scene, t, ops, opts);
    return ops;
  }

  /* Carton de titre (séquences de plusieurs scènes). */
  function titleOps(title, subtitle) {
    const ops = [];
    pitchOps(ops);
    ops.push({ k: "rect", x: VIEW.x, y: VIEW.y, w: VIEW.w, h: VIEW.h, fill: "#0b1510", alpha: 0.82 });
    wrap(title, 34).slice(0, 3).forEach((l, i) => ops.push({ k: "text", x: L / 2, y: 7.5 + i * 2.2, s: l, size: 1.9, color: COLORS.text, bold: true, anchor: "middle", caps: true }));
    if (subtitle) wrap(subtitle, 60).slice(0, 3).forEach((l, i) => ops.push({ k: "text", x: L / 2, y: 14.5 + i * 1.3, s: l, size: 1.0, color: COLORS.dim, anchor: "middle" }));
    return ops;
  }


  /* Mini-carte en direct : une image de trajectoires (joueurs A / B, ballon) sur le terrain. */
  function liveOps(frame, opts) {
    opts = opts || {};
    const ops = [];
    pitchOps(ops);
    ops.splice(0, 1, { k: "rect", x: COURT_VIEW.x, y: COURT_VIEW.y, w: COURT_VIEW.w, h: COURT_VIEW.h, fill: COLORS.bg });
    (opts.heat ? heatOps(opts.heat) : []).forEach((o) => ops.push(o));
    const trails = opts.trails || {};
    Object.keys(trails).forEach((id) => {
      const tr = trails[id];
      if (tr.length < 2) return;
      ops.push({ k: "poly", pts: tr, stroke: tr.team === "B" ? COLORS.B : COLORS.A, lw: 0.14, alpha: 0.45 });
    });
    ((frame && frame.players) || []).forEach((p) => {
      const col = p.team === "A" ? COLORS.A : p.team === "B" ? COLORS.B : p.team === "GKA" ? COLORS.GKA : COLORS.GKB;
      ops.push({ k: "circle", x: p.x, y: p.y, r: 0.72, fill: col, stroke: "#ffffff", lw: 0.12 });
      if (opts.showIds && p.id != null) ops.push({ k: "text", x: p.x, y: p.y + 0.26, s: String(p.id), size: 0.74, color: p.team === "GKA" || p.team === "GKB" ? "#1a1400" : "#ffffff", bold: true, anchor: "middle" });
    });
    if (frame && frame.ball) {
      ops.push({ k: "circle", x: frame.ball.x, y: frame.ball.y, r: 0.38, fill: COLORS.ball, stroke: "#111", lw: 0.1 });
    }
    return ops;
  }

  /* Carte de chaleur : tableau [rangées][colonnes] de proportions (somme = 1). */
  function heatOps(heat) {
    const ops = [];
    const rows = heat.length, cols = heat[0].length;
    let max = 0;
    heat.forEach((r) => r.forEach((v) => { if (v > max) max = v; }));
    if (!max) return ops;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = heat[r][c] / max;
        if (a < 0.03) continue;
        ops.push({ k: "rect", x: (c * L) / cols, y: (r * W) / rows, w: L / cols, h: W / rows, fill: a > 0.66 ? "#ff5a5f" : a > 0.33 ? "#ffb020" : "#5b93ff", alpha: 0.18 + 0.5 * a });
      }
    }
    return ops;
  }

  /* ---- Rendus ---- */
  function drawOps(ctx, ops, scale, view) {
    view = view || VIEW;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-view.x, -view.y);
    ops.forEach((o) => {
      ctx.save();
      ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
      if (o.k === "rect") {
        if (o.rx && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, o.h, o.rx); } else { ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); }
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke) { ctx.globalAlpha = o.strokeAlpha != null ? o.strokeAlpha : (o.alpha != null ? Math.max(o.alpha, 0.9) : 1); ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 0.1; ctx.setLineDash(o.dash ? [0.5, 0.35] : []); ctx.stroke(); }
      } else if (o.k === "circle") {
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke) { ctx.globalAlpha = o.strokeAlpha != null ? o.strokeAlpha : (o.alpha != null ? Math.max(o.alpha, 0.9) : 1); ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 0.1; ctx.setLineDash(o.dash ? [0.5, 0.35] : []); ctx.stroke(); }
      } else if (o.k === "poly") {
        ctx.beginPath();
        o.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        if (o.closed) ctx.closePath();
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 0.1; ctx.lineJoin = "round"; ctx.stroke(); }
      } else if (o.k === "line" || o.k === "arrow") {
        ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = o.lw; ctx.lineCap = "round";
        ctx.setLineDash(o.dash ? [0.6, 0.45] : []);
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
        if (o.k === "arrow" && o.head) {
          ctx.setLineDash([]);
          const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), h = 0.95;
          ctx.beginPath();
          ctx.moveTo(o.x2 + Math.cos(a) * 0.15, o.y2 + Math.sin(a) * 0.15);
          ctx.lineTo(o.x2 - Math.cos(a - 0.45) * h, o.y2 - Math.sin(a - 0.45) * h);
          ctx.lineTo(o.x2 - Math.cos(a + 0.45) * h, o.y2 - Math.sin(a + 0.45) * h);
          ctx.closePath(); ctx.fill();
        }
      } else if (o.k === "text") {
        ctx.font = (o.bold ? "700 " : "500 ") + o.size + "px 'Barlow','Segoe UI',Arial,sans-serif";
        ctx.textAlign = o.anchor === "middle" ? "center" : o.anchor === "end" ? "right" : "left";
        const s = o.caps ? o.s.toUpperCase() : o.s;
        if (o.halo) { ctx.lineWidth = 0.22; ctx.strokeStyle = "rgba(8,16,11,0.85)"; ctx.lineJoin = "round"; ctx.strokeText(s, o.x, o.y); }
        ctx.fillStyle = o.color; ctx.fillText(s, o.x, o.y);
      }
      ctx.restore();
    });
    ctx.restore();
  }

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const n2 = (v) => (Math.round(v * 100) / 100).toString();

  function opsToSVG(ops, width, view) {
    view = view || VIEW;
    width = width || 960;
    const height = Math.round((width * view.h) / view.w);
    let body = "";
    ops.forEach((o) => {
      const alpha = o.alpha != null && o.alpha < 1 ? ' opacity="' + n2(o.alpha) + '"' : "";
      const dash = o.dash ? ' stroke-dasharray="0.5 0.35"' : "";
      if (o.k === "rect") {
        body += '<rect x="' + n2(o.x) + '" y="' + n2(o.y) + '" width="' + n2(o.w) + '" height="' + n2(o.h) + '"' + (o.rx ? ' rx="' + n2(o.rx) + '"' : "") +
          ' fill="' + (o.fill || "none") + '"' + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + n2(o.lw || 0.1) + '"' + dash : "") + alpha + "/>";
      } else if (o.k === "circle") {
        body += '<circle cx="' + n2(o.x) + '" cy="' + n2(o.y) + '" r="' + n2(o.r) + '" fill="' + (o.fill || "none") + '"' + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + n2(o.lw || 0.1) + '"' + dash : "") + alpha + "/>";
      } else if (o.k === "poly") {
        body += "<" + (o.closed ? "polygon" : "polyline") + ' points="' + o.pts.map((p) => n2(p[0]) + "," + n2(p[1])).join(" ") + '" fill="' + (o.fill || "none") + '"' + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + n2(o.lw || 0.1) + '" stroke-linejoin="round"' : "") + alpha + "/>";
      } else if (o.k === "line" || o.k === "arrow") {
        body += '<line x1="' + n2(o.x1) + '" y1="' + n2(o.y1) + '" x2="' + n2(o.x2) + '" y2="' + n2(o.y2) + '" stroke="' + o.color + '" stroke-width="' + n2(o.lw) + '" stroke-linecap="round"' + dash + alpha + "/>";
        if (o.k === "arrow" && o.head) {
          const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), h = 0.95;
          const pts = [[o.x2 + Math.cos(a) * 0.15, o.y2 + Math.sin(a) * 0.15], [o.x2 - Math.cos(a - 0.45) * h, o.y2 - Math.sin(a - 0.45) * h], [o.x2 - Math.cos(a + 0.45) * h, o.y2 - Math.sin(a + 0.45) * h]];
          body += '<polygon points="' + pts.map((p) => n2(p[0]) + "," + n2(p[1])).join(" ") + '" fill="' + o.color + '"' + alpha + "/>";
        }
      } else if (o.k === "text") {
        const s = o.caps ? o.s.toUpperCase() : o.s;
        const anchor = o.anchor === "middle" ? "middle" : o.anchor === "end" ? "end" : "start";
        const common = ' x="' + n2(o.x) + '" y="' + n2(o.y) + '" font-size="' + n2(o.size) + '" font-family="Barlow,Segoe UI,Arial,sans-serif" font-weight="' + (o.bold ? 700 : 500) + '" text-anchor="' + anchor + '"';
        if (o.halo) body += "<text" + common + ' fill="none" stroke="rgba(8,16,11,0.85)" stroke-width="0.22" stroke-linejoin="round"' + alpha + ">" + esc(s) + "</text>";
        body += "<text" + common + ' fill="' + o.color + '"' + alpha + ">" + esc(s) + "</text>";
      }
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + view.x + " " + view.y + " " + view.w + " " + view.h + '" width="' + width + '" height="' + height + '" role="img">' + body + "</svg>";
  }

  /* Instant le plus parlant d'une scène pour une image fixe : juste avant la fin de chaque étape. */
  function keyTimes(scene) {
    return scene.steps.map((s) => Math.max(s.t0, s.t1 - 0.05));
  }

  return { L, W, VIEW, COURT_VIEW, COLORS, liveOps, heatOps, ARROW_STYLES, BADGES, positionAt, actorPos, validate, buildOps, titleOps, drawOps, opsToSVG, keyTimes, wrap };
});
