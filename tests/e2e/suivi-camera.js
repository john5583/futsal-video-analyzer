/* Test de bout en bout : suivi de la caméra seul. Vidéo d'essai où la caméra tourne (cap 188° -> 196° en 6 s, sol texturé) puis, à 2,5 s, une coupure grise et un saut
   de 60° (la caméra ne voit plus le terrain), deux calibrages exacts avant la coupure, AUCUNE analyse :
   - le suivi démarre tout seul, une barre de progression s'affiche, l'interface reste utilisable ;
   - à 4 s, le terrain est tracé (lignes cyan sur la vidéo) et la projection suivie s'écarte de la vérité de moins de 0,6 m ;
   - supprimer un calibrage refait le suivi ; la raison « caméra perdue » et le bouton « Ajouter un calibrage » mènent à la bonne image ;
   - aucune erreur dans la console.
   Usage : xvfb-run -a node tests/e2e/suivi-camera.js   (nécessite ffmpeg ; FSAL_VIDEO_PAN = vidéo de remplacement déjà générée) */
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

const PAN = { yaw1: 196, secondes: 6, fps: 10, saut: [2.5, 3.5, 60] };
const L = 40, W = 20, VW = 960, VH = 540;
/* Projection exacte (pixels -> terrain) de la scène à l'instant t, ajustée sur une grille de points du terrain. */
function truthH(t) {
  const pose = poseAt(POSE, PAN, t), B = CF.cameraBasis(pose), f = CF.focalPx(VW, pose[5]), src = [], dst = [];
  for (let x = 4; x <= 36; x += 4) for (let y = 3; y <= 17; y += 3.5) { const q = CF.project(B, f, VW, VH, x, y, 0); if (q && q.u > 0 && q.u < VW && q.v > 0 && q.v < VH) { src.push([q.u, q.v]); dst.push([x, y]); } }
  return HG.solve(src, dst);
}
const calibAt = (t) => ({ t, points: [], H: truthH(t), err: 0 });
/* Écart moyen (m) entre deux projections pixels -> terrain, sur les points de l'image qui tombent sur le terrain. */
function gap(Ha, Hb) {
  const e = [];
  for (let gx = 0.15; gx < 0.9; gx += 0.1) for (let gy = 0.3; gy < 0.9; gy += 0.1) {
    const a = HG.apply(Ha, gx * VW, gy * VH), b = HG.apply(Hb, gx * VW, gy * VH);
    if (a[0] > 0 && a[0] < L && a[1] > 0 && a[1] < W) e.push(Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return e.length ? e.reduce((s, v) => s + v, 0) / e.length : NaN;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-suivi-"));
  let video = process.env.FSAL_VIDEO_PAN || path.join(dir, "pan.mp4");
  if (!process.env.FSAL_VIDEO_PAN) execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video, JSON.stringify(POSE), JSON.stringify({ lineHalf: 0.04, texture: true }), JSON.stringify(PAN)], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const ai = {
    L, W, dir: 1, flip: true, camera: "mobile", calibrations: [calibAt(0), calibAt(1.5)], kits: {}, frames: null, lost: [], recalage: [], stats: null, suggestedEvents: [],
    settings: { fps: 3, tiles: 1, t0: 0, t1: 6, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai suivi", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  must(await waitFor(win, () => window.FSAI && document.querySelector("video").readyState >= 1, 30000), "projet chargé");

  // 1. le suivi démarre tout seul (aucun clic) et se termine
  const seen = [];
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const s = await win.evaluate(() => ({ txt: document.getElementById("ai-suivi").textContent, bar: !document.getElementById("ai-suivi-bar").hidden, cs: !!window.FSAI.ai().camSuivi }));
    seen.push(s);
    if (s.cs) break;
    await sleep(150);
  }
  must(seen.some((s) => /Suivi de la caméra/.test(s.txt)), "un message « Suivi de la caméra… » s'affiche");
  const fin = await win.evaluate(() => { const a = window.FSAI.ai(); return a.camSuivi ? { lost: a.camSuivi.lost, n: a.camSuivi.frames.length, t0: a.camSuivi.t0, t1: a.camSuivi.t1, txt: document.getElementById("ai-suivi").textContent, ana: !!(a.frames && a.frames.length) } : null; });
  must(fin && fin.n > 5, "le suivi est terminé et gardé dans le projet (" + (fin && fin.n) + " positions)");
  must(fin && !fin.ana, "sans lancer l'analyse complète");
  must(fin && /terminé : caméra suivie sur \d+(,\d)? % de la vidéo/.test(fin.txt), "bilan affiché : " + (fin && fin.txt));
  must(fin && fin.lost.length >= 1 && fin.lost[0][0] >= 2.3 && fin.lost[0][0] <= 2.8, "la caméra est déclarée perdue à la coupure, pas avant (passages perdus : " + JSON.stringify(fin && fin.lost) + ")");
  // 2. le terrain est tracé à 4 s et proche de la vérité
  await win.evaluate(() => { document.getElementById("ov-court").checked = true; window.FSApp.seek(2.2); });
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 2.2) < 0.15 && !document.querySelector("video").seeking, 8000), "vidéo à 2,2 s");
  await sleep(600);
  const cyan = () => win.evaluate(() => { const c = document.getElementById("overlay"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 40 && d[i + 1] > 180 && d[i + 2] > 200 && d[i + 3] > 200) n++; return n; });
  must((await cyan()) > 300, "lignes du terrain tracées sur la vidéo (pixels cyan : " + await cyan() + ")");
  const est = await win.evaluate(() => { const a = window.FSAI.ai(), v = document.querySelector("video"), fr = a.camSuivi.frames.map((c) => ({ t: c[0], h: c[1] })); return window.FutsalPipeline.courtH([], a.calibrations, "mobile", 2.2, v.videoWidth, v.videoHeight, fr); });
  must(est && est.H && /suivi/.test(est.source), "projection issue du suivi (source : " + (est && est.source) + ")");
  const g = est && est.H ? gap(est.H, truthH(2.2)) : NaN;
  must(g < 0.6, "écart moyen à la vérité à 2,2 s : " + g.toFixed(2) + " m (seuil 0,6 m)");
  // 3. supprimer un calibrage refait le suivi
  const cle0 = await win.evaluate(() => window.FSAI.ai().camSuivi.cle);
  await win.evaluate(() => { document.querySelectorAll("#ai-calibs button[data-a=del]")[1].click(); });
  must(await waitFor(win, () => /en cours|%/.test(document.getElementById("ai-suivi").textContent) || window.FSAI.ai().camSuivi === null, 8000), "suppression d'un calibrage : le suivi repart");
  must(await waitFor(win, (c) => window.FSAI.ai().camSuivi && window.FSAI.ai().camSuivi.cle !== c, 120000, cle0), "suivi refait avec l'empreinte des nouveaux calibrages");
  // 4. caméra perdue (vraie coupure de la vidéo) : bouton qui mène à l'image juste après le décrochage
  await win.evaluate(() => window.FSApp.seek(3.5));
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 3.5) < 0.15 && !document.querySelector("video").seeking, 8000), "vidéo à 3,5 s (passage perdu)");
  await sleep(500);
  const bt = await win.evaluate(() => { const b = document.getElementById("ai-calib-go"); return { hid: b.hidden, txt: b.textContent }; });
  must(!bt.hid && /Ajouter un calibrage à 00:0[2-4] \(juste après le décrochage\)/.test(bt.txt), "bouton « Ajouter un calibrage à 00:0x (juste après le décrochage) » affiché (" + bt.txt + ")");
  await win.evaluate(() => document.getElementById("ai-calib-go").click());
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - (Number(document.getElementById("ai-calib-go").dataset.t))) < 0.2 && !document.querySelector("video").seeking, 8000), "clic : la vidéo se place à l'image proposée");
  must(await win.evaluate(() => document.getElementById("ai-d1").open), "l'étape « 1. Terrain » est ouverte pour placer les repères");
  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_VIDEO_PAN) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
