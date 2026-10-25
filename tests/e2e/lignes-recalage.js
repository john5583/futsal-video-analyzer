/* Test de bout en bout : le tracé du terrain est recalé sur les vraies lignes (de la couleur donnée), sans aucune action de l'utilisateur.
   Vidéo d'essai : la caméra tourne (cap 188° -> 196° en 6 s), sol texturé, lignes noires avec cercle central. Le calibrage posé au départ est volontairement décalé d'environ 3° de cap
   (comme un suivi qui a dérivé). Vérifie :
   - la couleur des lignes donnée est gardée dans le projet et utilisée (le suivi dit « lignes noires », « tracé vérifié sur les lignes ») ;
   - le tracé de la dernière image est plus près de la vérité que le calibrage décalé de départ (écart mesuré sur le terrain, en mètres) ;
   - sans couleur donnée : une question « couleur des lignes » s'affiche (sans bloquer), la réponse est gardée dans le projet et relance le suivi recalé ;
   - aucune erreur dans la console.
   Usage : xvfb-run -a node tests/e2e/lignes-recalage.js   (nécessite ffmpeg ; FSAL_VIDEO_LIGNES = vidéo de remplacement déjà générée) */
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
  for (let x = 4; x <= 36; x += 4) for (let y = 3; y <= 17; y += 3.5) { const q = CF.project(B, f, VW, VH, x, y, 0); if (q && q.u > 0 && q.u < VW && q.v > 0 && q.v < VH) { src.push([q.u, q.v]); dst.push([x, W - y]); } }      // comme les calibrages de l application : y vers le bas
  return HG.solve(src, dst);
}
const truthH = (t) => projH(poseAt(POSE, PAN, t));
const fausseH = (t) => { const p = poseAt(POSE, PAN, t).slice(); p[3] += 3.0; return projH(p); };      // cap décalé de trois degrés
function gap(Ha, Hb) {
  const e = [];
  for (let gx = 0.15; gx < 0.9; gx += 0.1) for (let gy = 0.3; gy < 0.9; gy += 0.1) {
    const a = HG.apply(Ha, gx * VW, gy * VH), b = HG.apply(Hb, gx * VW, gy * VH);
    if (a[0] > 0 && a[0] < L && a[1] > 0 && a[1] < W) e.push(Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return e.length ? e.reduce((s, v) => s + v, 0) / e.length : NaN;
}

async function lance(dir, video, name, lineColor) {
  const ud = path.join(dir, "ud-" + name); fs.mkdirSync(ud);
  const ai = {
    L, W, dir: 1, flip: true, camera: "mobile", calibrations: [{ t: 0, points: [], H: fausseH(0), err: 0 }], kits: {}, frames: null, lost: [], recalage: [], stats: null, suggestedEvents: [],
    settings: { fps: 3, tiles: 1, t0: 0, t1: 6, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  if (lineColor) ai.lineColor = lineColor;
  const proj = { version: 1, name: "essai lignes", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  return { app, win, errors, ud };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-lignes-"));
  let video = process.env.FSAL_VIDEO_LIGNES || path.join(dir, "lignes.mp4");
  if (!process.env.FSAL_VIDEO_LIGNES) execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video, JSON.stringify(POSE), JSON.stringify(SCENE), JSON.stringify(PAN)], { stdio: "ignore" });

  // ---- 1. couleur donnée : le suivi se recale sur les lignes tout seul ----
  const A = await lance(dir, video, "couleur", "black");
  must(await waitFor(A.win, () => !!window.FSAI.ai().camSuivi, 120000), "le suivi se termine tout seul");
  const r = await A.win.evaluate(() => { const a = window.FSAI.ai(); return { lg: a.camSuivi.lignes, q: a.camSuivi.frames.map((c) => c[2]), n: a.camSuivi.frames.length, color: a.lineColor, txt: document.getElementById("ai-suivi").textContent }; });
  must(r.color === "black", "la couleur des lignes est gardée dans le projet (" + r.color + ")");
  must(r.lg && r.lg.couleur === "black" && r.lg.acceptes >= 2, "le suivi a utilisé les lignes noires : " + JSON.stringify(r.lg));
  must(/Tracé vérifié sur les lignes noires/.test(r.txt), "le bilan le dit : " + r.txt);
  must(r.q.length === r.n && r.q.some((q) => q === 2), "chaque position porte sa qualité (2 = lignes retrouvées sur cette image)");
  const fin = await A.win.evaluate(() => { const a = window.FSAI.ai(), v = document.querySelector("video"), fr = a.camSuivi.frames.map((c) => ({ t: c[0], h: c[1] })); const e = window.FutsalPipeline.courtH([], a.calibrations, "mobile", 5.4, v.videoWidth, v.videoHeight, fr); return { H: e && e.H, src: e && e.source }; });
  const e0 = gap(fausseH(0), truthH(0)), e1 = fin.H ? gap(fin.H, truthH(5.4)) : NaN;
  must(e0 > 0.4, "le calibrage de départ est bien décalé (" + e0.toFixed(2) + " m)");
  must(e1 < e0 * 0.5 && e1 < 0.45, "tracé à 5,4 s : écart à la vérité " + e1.toFixed(2) + " m (calibrage décalé : " + e0.toFixed(2) + " m)");
  await sleep(1500);
  const saved = JSON.parse(fs.readFileSync(path.join(A.ud, "autosave.json"), "utf8"));
  must(saved.ai && saved.ai.lineColor === "black", "la couleur est dans le fichier du projet");
  must(A.errors.length === 0, "aucune erreur (couleur donnée)" + (A.errors.length ? " : " + A.errors.join(" | ") : ""));
  await A.app.close();

  // ---- 2. couleur non donnée : une question, jamais bloquante ; la réponse relance le suivi recalé ----
  const B = await lance(dir, video, "sans", null);
  must(await waitFor(B.win, () => !!window.FSAI.ai().camSuivi, 120000), "sans couleur : le suivi classique se fait quand même");
  must(await B.win.evaluate(() => !document.getElementById("ai-suivi-q").hidden && /couleur des lignes/.test(document.getElementById("ai-suivi-q").textContent)), "la question « couleur des lignes » s'affiche");
  must(await B.win.evaluate(() => /non vérifié sur les lignes/.test(document.getElementById("ai-suivi").textContent)), "le suivi dit qu'il n'est pas vérifié sur les lignes");
  const cle0 = await B.win.evaluate(() => window.FSAI.ai().camSuivi.cle);
  await B.win.evaluate(() => { [...document.querySelectorAll("#ai-suivi-q button")].find((b) => b.dataset.couleur === "black").click(); });
  must(await waitFor(B.win, () => window.FSAI.ai().lineColor === "black", 5000), "la réponse « Noir » est gardée dans le projet");
  must(await waitFor(B.win, (c) => { const s = window.FSAI.ai().camSuivi; return s && s.cle !== c && s.lignes && s.lignes.acceptes >= 2; }, 120000, cle0), "le suivi est refait, recalé sur les lignes noires");
  must(await B.win.evaluate(() => document.getElementById("ai-suivi-q").hidden), "la question disparaît une fois répondue");
  must(B.errors.length === 0, "aucune erreur (question de couleur)" + (B.errors.length ? " : " + B.errors.join(" | ") : ""));
  await B.app.close();
  if (!process.env.FSAL_VIDEO_LIGNES) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
