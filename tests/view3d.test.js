"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../src/anim/view3d");
const SC = require("../src/anim/registry");
const KB = require("../src/knowledge");

/* faux canvas : enregistre ce qui est dessiné (aucun écran nécessaire) */
function fakeCtx() {
  const calls = { arc: 0, ellipse: 0, fillText: 0, stroke: 0, fill: 0 };
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === "calls") return calls;
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
      if (k === "measureText") return () => ({ width: 10 });
      return (...a) => { if (k in calls) calls[k]++; };
    },
    set() { return true; }
  });
  return ctx;
}

test("projection : le centre du terrain est au milieu de l'image, x croissant va vers la droite, le lointain est plus petit", () => {
  const B = V.basis(V.newCamera("cote")), c = V.project(B, [20, 10, 0], 1280, 800);
  assert.ok(Math.abs(c.x - 640) < 2, "centre horizontal : " + c.x);
  const a = V.project(B, [10, 10, 0], 1280, 800), b = V.project(B, [30, 10, 0], 1280, 800);
  assert.ok(b.x > a.x, "x croissant vers la droite");
  const far = V.project(B, [20, 0, 0], 1280, 800), near = V.project(B, [20, 20, 0], 1280, 800);
  assert.ok(far.s < near.s && far.y < near.y, "le côté lointain est plus petit et plus haut dans l'image");
  assert.strictEqual(V.project(B, [20, 200, 0], 1280, 800), null, "un point derrière la caméra n'est pas dessiné");
  const up = V.project(B, [20, 10, 2], 1280, 800); assert.ok(up.y < c.y, "un point en hauteur est plus haut dans l'image");
});

test("caméra : limites respectées, préréglages valides", () => {
  const cam = V.limitCamera({ yaw: -30, pitch: 200, dist: 1 });
  assert.ok(cam.yaw >= 0 && cam.yaw < 360 && cam.pitch <= 88 && cam.dist >= 12);
  Object.keys(V.PRESETS).forEach((n) => { const c = V.newCamera(n); assert.ok(V.project(V.basis(c), [20, 10, 0], 1280, 800), n); });
});

test("déplacement de la vue : le terrain suit la souris, sous tous les angles, et reste borné", () => {
  [0, 90, 200].forEach((yaw) => {
    const c = V.newCamera("cote"); c.yaw = yaw;
    const p0 = V.project(V.basis(c), [20, 10, 0], 1280, 800); V.pan(c, 100, 0, 1280, 800);
    const p1 = V.project(V.basis(c), [20, 10, 0], 1280, 800); assert.ok(Math.abs(p1.x - p0.x - 100) < 3 && Math.abs(p1.y - p0.y) < 3, "glisser à droite, yaw " + yaw);
    const d = V.newCamera("cote"); d.yaw = yaw; V.pan(d, 0, 60, 1280, 800);
    const p2 = V.project(V.basis(d), [20, 10, 0], 1280, 800); assert.ok(p2.y > p0.y + 40 && Math.abs(p2.x - p0.x) < 3, "glisser vers le bas, yaw " + yaw);
  });
  const e = V.newCamera("cote"); V.pan(e, 1e6, 1e6, 1280, 800); assert.ok(Math.abs(e.tx) <= 26 && Math.abs(e.ty) <= 16);
});

test("ballon : au sol sur une passe courte, en l'air sur une longue passe, de retour au sol à l'arrivée", () => {
  const s = { duration: 5, ball: [[0, 10, 10], [1, 11, 10], [2, 30, 10], [3, 30, 10]] };
  const sol = V.ballState(s, 0.5), air = V.ballState(s, 1.5), fin = V.ballState(s, 3);
  assert.ok(air.z > sol.z + 0.2, "la longue passe passe en l'air");
  assert.ok(Math.abs(fin.z - sol.z) < 0.05, "le ballon est au sol à l'arrivée");
});

test("tous les exercices et toutes les erreurs se dessinent en 3D : joueurs, ballon optionnel, trois caméras, sans erreur", () => {
  let n = 0;
  const scenes = KB.DRILLS.map((d) => SC.forDrill(d.id)).concat(KB.ERRORS.map((e) => SC.forError(e.id)));
  scenes.forEach((s) => ["cote", "but", "haut"].forEach((cam) => [0, s.duration / 2, s.duration].forEach((t) => {
    const ctx = fakeCtx(); V.render(ctx, s, t, V.newCamera(cam), 1280, 800, { ball: true });
    assert.ok(ctx.calls.fillText >= 1 && (ctx.calls.arc + ctx.calls.ellipse) >= s.actors.filter((a) => a.team !== "C").length, s.id + " : joueurs non dessinés");
    n++;
  })));
  assert.strictEqual(n, scenes.length * 9, "images dessinées : " + n);
  assert.ok(scenes.length >= 140, "scènes : " + scenes.length);
  const avec = fakeCtx(), sans = fakeCtx(), s = SC.forDrill("corner_court_triangle");
  V.render(avec, s, 2.4, V.newCamera("cote"), 1280, 800, { ball: true }); V.render(sans, s, 2.4, V.newCamera("cote"), 1280, 800, { ball: false });
  assert.ok(avec.calls.arc > sans.calls.arc, "le ballon n'est dessiné que si on le demande");
});
