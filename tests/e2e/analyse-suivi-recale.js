/* Test de bout en bout : l'analyse complète utilise le suivi de caméra recalé (pose + lignes) pour placer le terrain, et garde l'ancienne chaîne en repli là où le suivi dit « recalage incertain ».
   Vidéo d'essai (caméra qui tourne, lignes noires + cercle) ; le calibrage de départ est décalé de 3° de cap (0,63 m). Vérifie :
   - le suivi se recale tout seul ; l'analyse (sans rien cocher) reprend sa position : note « reprise du suivi » et projection des images analysées plus proche de la vérité que le calibrage décalé ;
   - un suivi ancien (non recalé, sans qualité) n'est PAS utilisé si la case « réutiliser » est décochée (projets existants inchangés) ;
   - un passage « recalage incertain » : l'analyse le dit et continue avec sa propre chaîne (aucune image perdue, aucune erreur) ;
   - aucune erreur dans la console.
   Usage : xvfb-run -a node tests/e2e/analyse-suivi-recale.js   (nécessite ffmpeg ; FSAL_VIDEO_LIGNES = vidéo de remplacement déjà générée) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { _electron: electron } = require("playwright-core");
const CF = require("../../src/ai/court-fit");
const HG = require("../../src/ai/homography");
const { POSE, poseAt } = require("../helpers/make-video");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg)) return true; await sleep(250); } return false; }

const PAN = { yaw1: 196, secondes: 6, fps: 10 };
const SCENE = { lineHalf: 0.04, texture: true, circle: true, bus: false };
const L = 40, W = 20, VW = 960, VH = 540;
function projH(pose) {
  const B = CF.cameraBasis(pose), f = CF.focalPx(VW, pose[5]), src = [], dst = [];
  for (let x = 4; x <= 36; x += 4) for (let y = 3; y <= 17; y += 3.5) { const q = CF.project(B, f, VW, VH, x, y, 0); if (q && q.u > 0 && q.u < VW && q.v > 0 && q.v < VH) { src.push([q.u, q.v]); dst.push([x, W - y]); } }
  return HG.solve(src, dst);
}
const truthH = (t) => projH(poseAt(POSE, PAN, t));
const fausseH = (t) => { const p = poseAt(POSE, PAN, t).slice(); p[3] += 3.0; return projH(p); };
function gap(Ha, Hb) {
  const e = [];
  for (let gx = 0.15; gx < 0.9; gx += 0.1) for (let gy = 0.3; gy < 0.9; gy += 0.1) {
    const a = HG.apply(Ha, gx * VW, gy * VH), b = HG.apply(Hb, gx * VW, gy * VH);
    if (a[0] > 0 && a[0] < L && a[1] > 0 && a[1] < W) e.push(Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return e.length ? e.reduce((s, v) => s + v, 0) / e.length : NaN;
}
const KITS = { A: [{ shirt: [70, 5, 15], shorts: [10, 0, 0], socks: [35, 1, 2], trim: null, id: "ka1", t: 0, v: "x", src: "silhouette" }], B: [{ shirt: [30, 30, -40], shorts: [10, 0, 0], socks: [35, 1, 2], trim: null, id: "kb1", t: 0, v: "x", src: "silhouette" }] };

async function lance(dir, video, name, ai) {
  const ud = path.join(dir, "ud-" + name); fs.mkdirSync(ud);
  const proj = { version: 1, name: "essai analyse", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1500, height: 950 });
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => window.FSAI && document.querySelector("video").readyState >= 1, 30000), name + " : projet chargé");
  return { app, win, errors };
}
const baseAi = (extra) => Object.assign({
  L, W, dir: 1, flip: true, camera: "mobile", calibrations: [{ t: 0, points: [], H: fausseH(0), err: 0 }], kits: KITS, frames: null, lost: [], recalage: [], stats: null, suggestedEvents: [],
  settings: { fps: 3, tiles: 1, t0: 0, t1: 6, tol: 42 }, doubts: [], uncertain: [], subs: []
}, extra || {});
/* Projection (pixels -> terrain) de l'analyse à t, écart à la vérité */
const ecartAnalyse = (win, t) => win.evaluate((t) => {
  const a = window.FSAI.ai(), fr = window.FSApp.ai.getFrames(), f = window.FutsalPipeline.frameNear(fr, t, 0.3), v = document.querySelector("video");
  return f && Array.isArray(f.h) ? window.FutsalHomography.mul3(f.h, [1 / v.videoWidth, 0, 0, 0, 1 / v.videoHeight, 0, 0, 0, 1]) : null;
}, t);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-anasuivi-"));
  let video = process.env.FSAL_VIDEO_LIGNES || path.join(dir, "lignes.mp4");
  if (!process.env.FSAL_VIDEO_LIGNES) execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video, JSON.stringify(POSE), JSON.stringify(SCENE), JSON.stringify(PAN)], { stdio: "ignore" });

  // ---- 1. suivi recalé : l'analyse le reprend d'office ----
  const A = await lance(dir, video, "recale", baseAi({ lineColor: "black" }));
  must(await waitFor(A.win, () => { const s = window.FSAI.ai().camSuivi; return s && s.lignes && s.lignes.acceptes >= 2; }, 120000), "le suivi se recale sur les lignes tout seul");
  must(await A.win.evaluate(() => !document.getElementById("ai-reuse").checked), "la case « réutiliser » est décochée (rien à cocher)");
  await A.win.evaluate(() => window.FSAI.runAnalysis({ noConfirm: true }));
  must(await waitFor(A.win, () => !!(window.FSAI.ai().frames && window.FSAI.ai().frames.length), 120000), "l'analyse se termine");
  const notes = await A.win.evaluate(() => (window.FSAI.ai().notes || []).join(" | "));
  must(/Position de la caméra reprise du suivi/.test(notes), "note de l'analyse : position reprise du suivi recalé");
  const H4 = await ecartAnalyse(A.win, 4.0), e0 = gap(fausseH(0), truthH(0)), e1 = H4 ? gap(H4, truthH(4.0)) : NaN;
  must(e1 < e0 * 0.6 && e1 < 0.45, "projection des images analysées à 4 s : écart à la vérité " + e1.toFixed(2) + " m (calibrage décalé : " + e0.toFixed(2) + " m)");
  must(await A.win.evaluate(() => (window.FSAI.ai().lost || []).length === 0), "aucune image perdue");

  // ---- 2. passage « recalage incertain » (q = 0 dès 3 s) : repli sur la chaîne de l'analyse ----
  await A.win.evaluate(() => { const a = window.FSAI.ai(); a.camSuivi.frames = a.camSuivi.frames.map((c) => (c[0] >= 3 ? [c[0], c[1], 0] : c)); window.FSApp.ai.syncFromProject(); });
  await A.win.evaluate(() => window.FSAI.runAnalysis({ noConfirm: true }));
  must(await waitFor(A.win, () => /Recalage incertain sur \d+ image/.test((window.FSAI.ai().notes || []).join(" | ")), 120000), "l'analyse dit qu'elle a utilisé sa propre chaîne sur le passage incertain");
  must(await A.win.evaluate(() => !!(window.FSAI.ai().frames && window.FSAI.ai().frames.length > 5)), "l'analyse se termine avec des images avant et après");
  must(await A.win.evaluate(() => (window.FSAI.ai().lost || []).length === 0), "aucune image perdue dans le repli");
  must(A.errors.length === 0, "aucune erreur (suivi recalé)" + (A.errors.length ? " : " + A.errors.join(" | ") : ""));
  await A.app.close();

  // ---- 3. projet existant : suivi ancien (sans qualité), case décochée : comportement inchangé ----
  const B = await lance(dir, video, "ancien", baseAi({}));
  must(await waitFor(B.win, () => !!window.FSAI.ai().camSuivi, 120000), "suivi classique (sans couleur donnée)");
  await B.win.evaluate(() => window.FSAI.runAnalysis({ noConfirm: true }));
  must(await waitFor(B.win, () => !!(window.FSAI.ai().frames && window.FSAI.ai().frames.length), 120000), "l'analyse se termine");
  must(!/reprise du suivi/.test(await B.win.evaluate(() => (window.FSAI.ai().notes || []).join(" | "))), "suivi non recalé + case décochée : l'analyse suit la caméra elle-même (comme avant)");
  must(B.errors.length === 0, "aucune erreur (projet existant)" + (B.errors.length ? " : " + B.errors.join(" | ") : ""));
  await B.app.close();
  if (!process.env.FSAL_VIDEO_LIGNES) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
