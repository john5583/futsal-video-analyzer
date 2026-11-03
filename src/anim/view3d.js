/* Vue 3D des animations (sans bibliothèque : perspective calculée ici, dessin sur le même canvas 2D que la vue de dessus).
   Le terrain, les flèches, les zones, les repères et les textes sont ceux de la vue de dessus, projetés sur le sol ; les joueurs sont dessinés debout
   (jambes qui courent, bras, tête, numéro), avec leur ombre ; le ballon voyage en l'air sur les longues passes et les tirs, avec son ombre.
   Caméra orbitale : yaw (tour autour du terrain), pitch (hauteur), dist (recul). Repère : x le long du terrain (0 à 40), y en travers (0 à 20), z vers le haut. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.FutsalView3D = factory(root.FutsalAnim);
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  const L = E.L, W = E.W, C = E.COLORS;
  const TARGET = [L / 2, W / 2, 0];
  const PRESETS = {
    cote: { yaw: 0, pitch: 43, dist: 39, label: "Côté" },
    but: { yaw: 90, pitch: 22, dist: 40, label: "Derrière le but" },
    haut: { yaw: 0, pitch: 60, dist: 38, label: "Haut" }
  };
  const FOV = 38;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function newCamera(name) { const p = PRESETS[name] || PRESETS.cote; return { yaw: p.yaw, pitch: p.pitch, dist: p.dist, tx: 0, ty: 0 }; }
  function limitCamera(cam) { cam.pitch = clamp(cam.pitch, 6, 88); cam.dist = clamp(cam.dist, 12, 70); cam.yaw = ((cam.yaw % 360) + 360) % 360; cam.tx = clamp(cam.tx || 0, -26, 26); cam.ty = clamp(cam.ty || 0, -16, 16); return cam; }

  /* Base de la caméra : position, avant, droite, haut. */
  function basis(cam) {
    const yaw = (cam.yaw * Math.PI) / 180, pit = (clamp(cam.pitch, 6, 88) * Math.PI) / 180;
    const tg = [TARGET[0] + (cam.tx || 0), TARGET[1] + (cam.ty || 0), 0];   // point regardé : le centre du terrain, déplaçable (clic gauche maintenu)
    const pos = [tg[0] + cam.dist * Math.cos(pit) * Math.sin(yaw), tg[1] + cam.dist * Math.cos(pit) * Math.cos(yaw), cam.dist * Math.sin(pit)];
    const f = norm([tg[0] - pos[0], tg[1] - pos[1], tg[2] - pos[2]]);
    const r = norm(cross([0, 0, 1], f)), u = cross(f, r);
    return { pos, f, r, u };
  }

  /* Projette un point 3D : { x, y (pixels), s (pixels par mètre à cette profondeur), d (profondeur) } ou null s'il est derrière la caméra. */
  function project(B, p, w, h) {
    const focal = (h / 2) / Math.tan((FOV * Math.PI) / 360);
    const v = [p[0] - B.pos[0], p[1] - B.pos[1], p[2] - B.pos[2]], zc = dot(v, B.f);
    if (zc < 0.5) return null;
    const s = focal / zc;
    return { x: w / 2 + dot(v, B.r) * s, y: h * 0.47 - dot(v, B.u) * s, s, d: zc };
  }

  const alphaOf = (o) => (o.alpha != null ? o.alpha : 1);

  /* ---- sol : les opérations de la vue de dessus, projetées ---- */
  function drawGround(ctx, ops, B, w, h) {
    ops.forEach((o) => {
      ctx.save();
      ctx.globalAlpha = alphaOf(o);
      const pr = (x, y) => project(B, [x, y, 0], w, h);
      const ring = (pts) => { const q = pts.map((p) => pr(p[0], p[1])); return q.every(Boolean) ? q : null; };
      const fillStroke = (q, closed) => {
        ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (closed) ctx.closePath();
        const s = q.reduce((a, p) => a + p.s, 0) / q.length;
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke) { ctx.globalAlpha = o.strokeAlpha != null ? o.strokeAlpha : (o.alpha != null ? Math.max(o.alpha, 0.9) : 1); ctx.strokeStyle = o.stroke; ctx.lineWidth = Math.max(1, (o.lw || 0.1) * s); ctx.setLineDash(o.dash ? [0.5 * s, 0.35 * s] : []); ctx.stroke(); }
      };
      if (o.k === "rect") { const q = ring([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]); if (q) fillStroke(q, true); }
      else if (o.k === "circle") {
        const pts = []; for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push([o.x + o.r * Math.cos(a), o.y + o.r * Math.sin(a)]); }
        const q = ring(pts); if (q) fillStroke(q, true);
      } else if (o.k === "poly") {
        const q = ring(o.pts); if (q) {
          ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (o.closed) ctx.closePath();
          const s = q.reduce((a, p) => a + p.s, 0) / q.length;
          if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
          if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = Math.max(1, (o.lw || 0.1) * s); ctx.setLineDash(o.dash ? [0.5 * s, 0.35 * s] : []); ctx.stroke(); }
        }
      } else if (o.k === "line" || o.k === "arrow") {
        const a = pr(o.x1, o.y1), b = pr(o.x2, o.y2);
        if (a && b) {
          const s = (a.s + b.s) / 2, lw = Math.max(1.5, (o.lw || 0.2) * s * 0.8);
          ctx.strokeStyle = o.color || "#fff"; ctx.fillStyle = o.color || "#fff"; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.setLineDash(o.dash ? [0.6 * s, 0.4 * s] : []);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
          if (o.k === "arrow" && o.head) {
            const ang = Math.atan2(b.y - a.y, b.x - a.x), hl = Math.max(8, 0.9 * s * 0.8);
            ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - hl * Math.cos(ang - 0.45), b.y - hl * Math.sin(ang - 0.45)); ctx.lineTo(b.x - hl * Math.cos(ang + 0.45), b.y - hl * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
          }
        }
      } else if (o.k === "text") {
        const p = pr(o.x, o.y - (o.size || 0.8) * 0.3);
        if (p) {
          const px = clamp((o.size || 0.8) * p.s * 0.8, 11, 22);
          ctx.font = (o.bold ? "700 " : "400 ") + Math.round(px) + "px 'Segoe UI',Arial,sans-serif"; ctx.textAlign = o.anchor === "middle" ? "center" : o.anchor === "end" ? "right" : "left"; ctx.textBaseline = "middle";
          const s = o.caps ? String(o.s).toUpperCase() : String(o.s);
          if (o.halo) { ctx.lineWidth = 4; ctx.strokeStyle = "rgba(8,16,12,.85)"; ctx.lineJoin = "round"; ctx.strokeText(s, p.x, p.y); }
          ctx.fillStyle = o.color || "#fff"; ctx.fillText(s, p.x, p.y);
        }
      }
      ctx.restore();
    });
  }

  /* ---- buts en 3D ---- */
  function drawGoal(ctx, B, w, h, side) {
    const x0 = side === 0 ? 0 : L, dx = side === 0 ? -0.9 : 0.9, y0 = 8.5, y1 = 11.5, hz = 2;
    const P = (x, y, z) => project(B, [x, y, z], w, h);
    const a = [P(x0, y0, 0), P(x0, y0, hz), P(x0, y1, hz), P(x0, y1, 0)], b = [P(x0 + dx, y0, 0), P(x0 + dx, y0, hz * 0.8), P(x0 + dx, y1, hz * 0.8), P(x0 + dx, y1, 0)];
    if (a.some((p) => !p) || b.some((p) => !p)) return;
    const s = a[0].s;
    ctx.save();
    ctx.strokeStyle = "rgba(235,240,235,.28)"; ctx.lineWidth = 1;
    ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(a[i].x, a[i].y); ctx.lineTo(b[i].x, b[i].y); }
    for (let k = 1; k < 6; k++) { const u = k / 6; const m = (p, q) => ({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }); const t0 = m(b[1], b[2]), t1 = m(b[0], b[3]); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); }
    ctx.moveTo(b[0].x, b[0].y); ctx.lineTo(b[1].x, b[1].y); ctx.lineTo(b[2].x, b[2].y); ctx.lineTo(b[3].x, b[3].y); ctx.stroke();
    ctx.strokeStyle = "#f4f6f2"; ctx.lineWidth = Math.max(2, 0.1 * s); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(a[0].x, a[0].y); ctx.lineTo(a[1].x, a[1].y); ctx.lineTo(a[2].x, a[2].y); ctx.lineTo(a[3].x, a[3].y); ctx.stroke();
    ctx.restore();
  }

  /* ---- ballon : hauteur selon le trajet (passe au sol, passe longue ou tir en cloche légère) ---- */
  const BALL_R = 0.16;
  function ballState(scene, t) {
    const path = scene.ball;
    if (!path || !path.length) return null;
    const p = E.positionAt(path, t);
    let z = BALL_R;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (t >= a[0] && t <= b[0] && b[0] - a[0] > 0.011) {
        const len = Math.hypot(b[1] - a[1], b[2] - a[2]), u = (t - a[0]) / (b[0] - a[0]);
        const hmax = len > 6 ? Math.min(1.4, 0.06 * len) : (b[1] >= L - 0.5 && len > 3 ? 0.7 : 0);
        z = BALL_R + hmax * 4 * u * (1 - u);
        if (len < 0.5) z = BALL_R + 0.03 * Math.abs(Math.sin(t * 14));   // conduite : petits rebonds
        break;
      }
    }
    return { x: p[0], y: p[1], z };
  }

  /* ---- joueurs ---- */
  const JERSEY = { A: C.A, B: C.B, GKA: C.GKA, GKB: C.GKB };
  const FIG = 1.5;
  const SKIN = "#e9b995", SHORTS = "#16203a", SOCK = "#e9eef5";
  function drawPlayer(ctx, scene, a, t, B, w, h) {
    const p = E.actorPos(scene, a.id, t), P = project(B, [p[0], p[1], 0], w, h);
    if (!P) return;
    const q0 = E.actorPos(scene, a.id, Math.max(0, t - 0.12)), q1 = E.actorPos(scene, a.id, Math.min(scene.duration, t + 0.12));
    const dxw = q1[0] - q0[0], dyw = q1[1] - q0[1], speed = Math.hypot(dxw, dyw) / 0.24, amp = Math.min(1, speed / 3.5);
    const lat = speed > 0.01 ? Math.abs((dxw * B.r[0] + dyw * B.r[1]) / (Math.hypot(dxw, dyw) || 1)) : 0;
    const dir = speed > 0.01 ? Math.sign(dxw * B.r[0] + dyw * B.r[1]) || 1 : 1;
    const ph = t * 10.5 * (0.6 + 0.4 * amp), sw = Math.sin(ph) * amp, bob = 0.045 * amp * Math.abs(Math.cos(ph));
    const s = P.s, X = P.x, Y = P.y;
    const px = (m) => m * s * FIG;   // les joueurs sont un peu agrandis pour rester lisibles sur un terrain de 40 m
    const jersey = JERSEY[a.team] || "#888", gk = a.team === "GKA" || a.team === "GKB";
    // ombre
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.beginPath(); ctx.ellipse(X, Y, px(0.46), px(0.17), 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const hip = 0.92, shoulder = 1.46, lean = 0.1 * amp * dir;
    const hipP = [X, Y - px(hip + bob)], shP = [X + px(lean), Y - px(shoulder + bob)];
    const limb = (x0, y0, x1, y1, wd, col) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, px(wd)); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    // jambes (deux pieds qui alternent : écart latéral si le joueur court de côté, levée du pied sinon)
    [-1, 1].forEach((side) => {
      const ph2 = side * sw, fx = X + px(side * 0.11 + ph2 * 0.34 * (0.35 + 0.65 * lat) * dir), lift = Math.max(0, side * Math.sin(ph) * amp) * 0.2;
      const fy = Y - px(lift), kx = (hipP[0] + fx) / 2, ky = (hipP[1] + fy) / 2;
      limb(hipP[0], hipP[1], kx, ky, 0.2, SHORTS);
      limb(kx, ky, fx, fy, 0.14, SOCK);
      ctx.fillStyle = "#101521"; ctx.beginPath(); ctx.ellipse(fx + px(0.05 * dir), fy, px(0.13), px(0.065), 0, 0, Math.PI * 2); ctx.fill();
    });
    // bras arrière
    const arm = (side, front) => {
      const swing = -side * sw * 0.3 * (0.35 + 0.65 * lat) * dir, sx = shP[0] + px(side * 0.2), sy = shP[1] + px(0.06);
      const hx = sx + px(side * 0.06 + swing), hy = sy + px(0.5 - (front ? 0.04 * amp : 0));
      limb(sx, sy, hx, hy, 0.1, gk ? "#222" : SKIN);
    };
    arm(-1);
    // torse
    ctx.fillStyle = jersey; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = Math.max(1, px(0.025));
    const tw = px(0.23);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(Math.min(hipP[0], shP[0]) - tw, shP[1] - px(0.03), Math.abs(shP[0] - hipP[0]) + tw * 2, hipP[1] - shP[1] + px(0.06), px(0.12)); else ctx.rect(hipP[0] - tw, shP[1], tw * 2, hipP[1] - shP[1]);
    ctx.fill(); ctx.stroke();
    arm(1, true);
    // tête
    const hx = shP[0] + px(lean * 0.4), hy = shP[1] - px(0.2);
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hx, hy, px(0.115), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a2118"; ctx.beginPath(); ctx.arc(hx, hy - px(0.02), px(0.115), Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    // numéro
    const label = a.n != null ? String(a.n) : (gk ? "G" : "");
    if (label) {
      ctx.fillStyle = gk ? "#1a1400" : "#fff"; ctx.font = "700 " + Math.max(9, Math.round(px(0.3))) + "px 'Segoe UI',Arial,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, (hipP[0] + shP[0]) / 2, (hipP[1] + shP[1]) / 2);
    }
    if (a.tag) {
      ctx.font = "700 " + clamp(Math.round(px(0.34)), 10, 15) + "px 'Segoe UI',Arial,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(8,16,12,.85)"; ctx.strokeText(a.tag, X, Y - px(1.95)); ctx.fillStyle = C.text; ctx.fillText(a.tag, X, Y - px(1.95));
    }
    ctx.restore();
  }

  function drawCone(ctx, p, B, w, h) {
    const P = project(B, [p[0], p[1], 0], w, h); if (!P) return;
    const s = P.s;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(P.x, P.y, 0.42 * s, 0.14 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.cone; ctx.beginPath(); ctx.moveTo(P.x - 0.34 * s, P.y); ctx.lineTo(P.x + 0.34 * s, P.y); ctx.lineTo(P.x, P.y - 0.88 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(P.x - 0.18 * s, P.y - 0.42 * s, 0.36 * s, 0.1 * s);
    ctx.restore();
  }

  function drawBall(ctx, bs, B, w, h) {
    const g = project(B, [bs.x, bs.y, 0], w, h), c = project(B, [bs.x, bs.y, bs.z], w, h);
    if (!g || !c) return;
    const r = Math.max(5, BALL_R * c.s * 1.9), sh = Math.max(0.35, 1 - (bs.z - BALL_R) * 0.5);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0," + (0.3 * sh).toFixed(2) + ")"; ctx.beginPath(); ctx.ellipse(g.x, g.y, r * 1.1 * sh, r * 0.4 * sh, 0, 0, Math.PI * 2); ctx.fill();
    const grd = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.35, r * 0.1, c.x, c.y, r);
    grd.addColorStop(0, "#ffffff"); grd.addColorStop(1, "#b7bec9");
    ctx.fillStyle = grd; ctx.strokeStyle = "#1b1f27"; ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1b1f27"; ctx.beginPath(); ctx.arc(c.x + r * 0.1, c.y + r * 0.05, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* Ensemble de la scène à l'instant t : ctx (canvas w × h), cam = { yaw, pitch, dist }, opts = { ball (afficher le ballon), caption (bandeau d'explication) }. */
  function render(ctx, scene, t, cam, w, h, opts) {
    opts = opts || {};
    t = Math.max(0, Math.min(scene.duration, t));
    const B = basis(cam);
    // fond : salle sombre
    const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#0c1420"); bg.addColorStop(0.5, "#101c2a"); bg.addColorStop(1, "#0a1118");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // sol autour du terrain
    const out = [[-6, -6], [L + 6, -6], [L + 6, W + 6], [-6, W + 6]].map((p) => project(B, [p[0], p[1], 0], w, h));
    if (out.every(Boolean)) { ctx.fillStyle = "#14202c"; ctx.beginPath(); out.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); }
    // terrain, repères, flèches, zones (vue de dessus projetée au sol)
    const pitch = E.pitchOps().filter((o) => !(o.k === "rect" && (o.fill === C.bg || o.fill === "#0b1510")));
    drawGround(ctx, pitch, B, w, h);
    drawGround(ctx, E.groundOps(scene, t), B, w, h);
    // objets debout, du plus loin au plus proche
    const items = [];
    [0, 1].forEach((side) => { const P = project(B, [side === 0 ? 0 : L, W / 2, 0], w, h); if (P) items.push({ d: P.d, draw: () => drawGoal(ctx, B, w, h, side) }); });
    scene.actors.forEach((a) => {
      if (a.t0 != null && (t < a.t0 || t > (a.t1 != null ? a.t1 : Infinity))) return;
      const p = E.actorPos(scene, a.id, t), P = project(B, [p[0], p[1], 0], w, h);
      if (!P) return;
      items.push({ d: P.d, draw: a.team === "C" ? () => drawCone(ctx, p, B, w, h) : () => drawPlayer(ctx, scene, a, t, B, w, h) });
    });
    if (opts.ball !== false) { const bs = ballState(scene, t); if (bs) { const P = project(B, [bs.x, bs.y, 0], w, h); if (P) items.push({ d: P.d - 0.2, draw: () => drawBall(ctx, bs, B, w, h) }); } }
    items.sort((p, q) => q.d - p.d).forEach((it) => it.draw());
    // titre et bandeau d'explication (les mêmes que la vue de dessus)
    if (opts.caption !== false) {
      const veil = ctx.createLinearGradient(0, 0, 0, 90); veil.addColorStop(0, "rgba(6,12,18,.85)"); veil.addColorStop(1, "rgba(6,12,18,0)");
      ctx.fillStyle = veil; ctx.fillRect(0, 0, w, 90);
      E.drawOps(ctx, E.captionOnly(scene, t, opts.subtitle ? { subtitle: opts.subtitle } : null), w / E.VIEW.w);
    }
  }

  /* Déplace le point regardé de (dx, dy) pixels d'écran : le terrain suit la souris. */
  function pan(cam, dx, dy, w, h) {
    const focal = (h / 2) / Math.tan((FOV * Math.PI) / 360), m = cam.dist / focal, yaw = (cam.yaw * Math.PI) / 180, pit = (clamp(cam.pitch, 6, 88) * Math.PI) / 180;
    const rx = Math.cos(yaw), ry = -Math.sin(yaw), fx = -Math.sin(yaw), fy = -Math.cos(yaw), k = m / Math.max(0.2, Math.sin(pit));
    cam.tx = (cam.tx || 0) - dx * m * rx + dy * k * fx; cam.ty = (cam.ty || 0) - dx * m * ry + dy * k * fy;
    return limitCamera(cam);
  }

  return { PRESETS, FOV, newCamera, limitCamera, pan, basis, project, render, ballState };
});
