/* Bout en bout : le détecteur de buts entraîné, appelé comme le fait l'assistant (fenêtre → preload → processus principal → fil d'inférence).
   Une image réelle (étiquetée par le coach) est envoyée ; les cadres rendus doivent recouvrir les buts étiquetés.
   Usage : node tests/e2e/buts-ia.js <image.jpg> <etiquette.txt>   (modèle models/but.onnx requis) */
"use strict";
const path = require("path");
const fs = require("fs");
const electronLib = require("playwright-core");
const { _electron: electron } = electronLib;
const APP = path.join(__dirname, "..", "..");
const out = (...a) => console.log(...a);
const must = (c, m) => { if (!c) { out("FAIL", m); process.exitCode = 1; } else out("ok  ", m); };
(async () => {
  const [img, lab] = [process.argv[2], process.argv[3]];
  if (!img || !lab) { out("Usage : node tests/e2e/buts-ia.js <image.jpg> <etiquette.txt>"); process.exit(2); }
  const b64 = fs.readFileSync(img).toString("base64");
  const gt = fs.readFileSync(lab, "utf8").trim().split(/\n/).filter(Boolean).map((l) => l.split(/\s+/).map(Number));
  const ud = fs.mkdtempSync(path.join(require("os").tmpdir(), "fsal-buts-"));   // dossier de données à part : n'entre pas en conflit avec une autre instance ouverte
  const app = await electron.launch({ args: [APP, "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  const dispo = await win.evaluate(() => window.fsal.aiGoalsDispo());
  must(dispo === true, "le détecteur de buts est présent");
  const r = await win.evaluate(async (b) => {
    const im = new Image(); await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = "data:image/jpeg;base64," + b; });
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const t0 = performance.now();
    const res = await window.fsal.aiGoals({ buffer: d.data.buffer.slice(0), width: c.width, height: c.height, seuil: 0.3 });
    return { res, w: c.width, h: c.height, ms: Math.round(performance.now() - t0) };
  }, b64);
  must(!r.res.error && Array.isArray(r.res.boxes), "réponse sans erreur (" + (r.res.error || r.res.boxes.length + " cadre(s), " + r.ms + " ms") + ")");
  const iou = (a, b) => { const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), i = ix * iy; return i / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i); };
  const G = gt.map((a) => ({ x0: (a[1] - a[3] / 2) * r.w, y0: (a[2] - a[4] / 2) * r.h, x1: (a[1] + a[3] / 2) * r.w, y1: (a[2] + a[4] / 2) * r.h }));
  const trouves = G.filter((g) => r.res.boxes.some((b) => iou(g, b) >= 0.3)).length;
  must(trouves === G.length, "buts étiquetés retrouvés : " + trouves + " / " + G.length);
  await app.close();
})().catch((e) => { out("FAIL", e.message); process.exit(1); });
