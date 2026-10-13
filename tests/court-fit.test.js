const test = require("node:test");
const assert = require("node:assert/strict");
const CF = require("../src/ai/court-fit");
const G = require("../src/ai/goal");
const HG = require("../src/ai/homography");
const { render } = require("./helpers/scene");

const L = 40, W = 20, w = 960, h = 540;
const TRUE = [24, 13, 5.5, 188, 24, 70];

test("but : poteaux rayés rouge/blanc détectés dans une scène synthétique", () => {
  const img = render(TRUE, w, h, L, W);
  const wk = CF.prepare(img, 640);
  const g = G.detect(wk).goals[0];
  assert.ok(g, "but trouvé");
  // vérité terrain : pieds des poteaux
  const B = CF.cameraBasis(TRUE), f = CF.focalPx(wk.w, TRUE[5]);
  const l = CF.project(B, f, wk.w, wk.h, 0, W / 2 - 1.5, 0), r = CF.project(B, f, wk.w, wk.h, 0, W / 2 + 1.5, 0);
  assert.ok(Math.hypot(g.left.u - l.u, g.left.v1 - l.v) < 5 && Math.hypot(g.right.u - r.u, g.right.v1 - r.v) < 5, "pieds des poteaux au bon endroit");
});

test("but : aucune détection sans poteaux", () => {
  const img = render(TRUE, w, h, L, W, { lines: true });
  // on efface la zone du but en repeignant l'image avec le sol seulement
  for (let i = 0; i < w * h; i++) { img.data[i * 4] = 70; img.data[i * 4 + 1] = 110; img.data[i * 4 + 2] = 160; }
  const wk = CF.prepare(img, 640);
  assert.equal(G.detect(wk).goals.length, 0);
});

test("repérage : le but + un clic sur la ligne des 6 m retrouvent le terrain (erreur < 0,6 m)", () => {
  const img = render(TRUE, w, h, L, W);
  const wk = CF.prepare(img, 640);
  const g = G.detect(wk).goals[0];
  const B = CF.cameraBasis(TRUE), f = CF.focalPx(wk.w, TRUE[5]);
  const click = CF.project(B, f, wk.w, wk.h, 6, W / 2, 0);
  const r = CF.poseFromGoal(g, wk.w, wk.h, L, W, false, [], [{ x: 6, y: W / 2, u: click.u, v: click.v }]);
  assert.ok(r.err < 3, "écart de reprojection " + r.err);
  const sep = Math.hypot(g.right.u - g.left.u, g.right.v1 - g.left.v1);
  const cal = CF.calibrationFromPose(r.pose, wk.w, wk.h, w, h, L, W, r.err, sep);
  // vérification : des points du terrain projetés avec la vraie caméra doivent être renvoyés au bon endroit par H
  let worst = 0, n = 0;
  for (let x = 0; x <= 14; x += 2) for (let y = 4; y <= 16; y += 2) {
    const q = CF.project(B, f, wk.w, wk.h, x, y, 0);
    if (!q || q.u < 10 || q.v < 10 || q.u > wk.w - 10 || q.v > wk.h - 10) continue;
    const m = HG.apply(cal.H, q.u * (w / wk.w), q.v * (w / wk.w));
    worst = Math.max(worst, Math.hypot(m[0] - x, m[1] - (W - y))); n++;
  }
  assert.ok(n >= 20, "assez de points visibles : " + n);
  assert.ok(worst < 0.6, "erreur maximale " + worst.toFixed(2) + " m");
  assert.ok(cal.points.length >= 4, "repères du terrain visibles : " + cal.points.length);
  assert.ok(cal.err > 0 && cal.err <= 1.4);
});

test("repérage : but attaqué (côté x = L) -> les coordonnées sont retournées", () => {
  const pose = [16, 7, 5, 8, 22, 72];
  const img = render(pose, w, h, L, W, { goalAtEnd: true });
  const wk = CF.prepare(img, 640);
  const g = G.detect(wk).goals[0];
  assert.ok(g);
  const B = CF.cameraBasis(pose), f = CF.focalPx(wk.w, pose[5]);
  const click = CF.project(B, f, wk.w, wk.h, L - 6, W / 2, 0);
  const r = CF.poseFromGoal(g, wk.w, wk.h, L, W, true, [], [{ x: 6, y: W / 2, u: click.u, v: click.v }]);
  const cal = CF.calibrationFromPose(r.pose, wk.w, wk.h, w, h, L, W, r.err, 60);
  const m = HG.apply(cal.H, click.u * (w / wk.w), click.v * (w / wk.w));
  assert.ok(Math.hypot(m[0] - (L - 6), m[1] - W / 2) < 0.6, "le point des 6 m est renvoyé à (" + m.map((v) => v.toFixed(1)) + ")");
});

test("couleurs de lignes : le noir est reconnu dans la scène synthétique, le clic se cale sur le trait", () => {
  const img = render(TRUE, w, h, L, W);
  const wk = CF.prepare(img, 640);
  const c = CF.colorCandidates(wk);
  assert.ok(c.some((x) => x.key === "black"), "noir proposé : " + c.map((x) => x.key));
  const rm = CF.ridgeMap(wk, "black");
  const B = CF.cameraBasis(TRUE), f = CF.focalPx(wk.w, TRUE[5]);
  const q = CF.project(B, f, wk.w, wk.h, 6, W / 2, 0);
  const s = CF.snapToRidge(rm, q.u + 4, q.v + 3, 10);
  assert.ok(s.snapped && Math.hypot(s.u - q.u, s.v - q.v) < 3, "calé à " + Math.hypot(s.u - q.u, s.v - q.v).toFixed(1) + " px");
});

function meanError(pose, extras) {
  const img = render(pose, w, h, L, W);
  const wk = CF.prepare(img, 640), g = G.detect(wk).goals[0];
  const B = CF.cameraBasis(pose), f = CF.focalPx(wk.w, pose[5]);
  const jit = [[1, -1], [-1, 1], [1, 1], [-1, -1]];
  const ex = extras.map(([x, y], i) => { const q = CF.project(B, f, wk.w, wk.h, x, y, 0); return { x, y, u: q.u + jit[i % 4][0], v: q.v + jit[i % 4][1] }; });
  const r = CF.poseFromGoal(g, wk.w, wk.h, L, W, false, [], ex);
  const cal = CF.calibrationFromPose(r.pose, wk.w, wk.h, w, h, L, W, r.err, 60);
  let sum = 0, n = 0;
  for (let x = 0; x <= 20; x += 2) for (let y = 3; y <= 17; y += 2) {
    const q = CF.project(B, f, wk.w, wk.h, x, y, 0);
    if (!q || q.u < 10 || q.v < 10 || q.u > wk.w - 10 || q.v > wk.h - 10) continue;
    const m = HG.apply(cal.H, q.u * (w / wk.w), q.v * (w / wk.w));
    sum += Math.hypot(m[0] - x, m[1] - (W - y)); n++;
  }
  return { mean: sum / n, n };
}

test("repérage : la précision s'améliore avec le nombre de repères (clics à ±1 px)", () => {
  const two = meanError(TRUE, [[6, 10], [9, 10]]);
  const four = meanError(TRUE, [[6, 10], [9, 10], [0, 2.5], [0, 17.5]]);
  assert.ok(two.n >= 30 && two.mean < 1.3, "2 repères : " + two.mean.toFixed(2) + " m");
  assert.ok(four.mean < 0.9, "4 repères : " + four.mean.toFixed(2) + " m");
});

test("repérage : le but attaqué est de l'autre côté (demi-tour du terrain)", () => {
  const img = render(TRUE, w, h, L, W);
  const wk = CF.prepare(img, 640), g = G.detect(wk).goals[0];
  const B = CF.cameraBasis(TRUE), f = CF.focalPx(wk.w, TRUE[5]);
  const c6 = CF.project(B, f, wk.w, wk.h, 6, W / 2, 0);
  const r = CF.poseFromGoal(g, wk.w, wk.h, L, W, false, [], [{ x: 6, y: W / 2, u: c6.u, v: c6.v }]);
  const cal = CF.calibrationFromPose(r.pose, wk.w, wk.h, w, h, L, W, r.err, 60);
  const rot = CF.rotateCalibration(cal, L, W, w, h);
  const px = c6.u * (w / wk.w), py = c6.v * (w / wk.w);
  const a = HG.apply(cal.H, px, py), b = HG.apply(rot.H, px, py);
  assert.ok(Math.abs(a[0] - 6) < 0.8 && Math.abs(b[0] - (L - 6)) < 0.8, "x : " + a[0].toFixed(1) + " -> " + b[0].toFixed(1));
  assert.ok(Math.abs(b[1] - (W - a[1])) < 1e-6, "y retourné");
  assert.ok(rot.points.length >= 4 && rot.points.every((p) => p.ix >= 0 && p.iy >= 0), "repères recalculés");
});
