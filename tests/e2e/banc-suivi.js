/* Test de bout en bout : « Marquer le banc » à un instant ni calibré ni analysé, mais suivi par la caméra.
   Vidéo d'essai : la caméra tourne, une coupure grise à 2,5 s (la caméra perd le terrain jusqu'à 3,5 s), un seul calibrage à 0 s, AUCUNE analyse. Vérifie :
   - à 2,0 s (suivi seul) le marquage du banc démarre sans message d'erreur ; deux clics créent une zone gardée dans le projet (et dans le fichier enregistré) ;
   - cette zone est transmise à la prochaine analyse (options de l'analyse espionnées) ;
   - à 3,0 s (terrain inconnu) : aucun message d'erreur, un seul bouton « Aller à l'instant le plus proche où le terrain est connu », qui amène la vidéo sur un instant connu et démarre le marquage ;
   - aucune erreur dans la console.
   Usage : xvfb-run -a node tests/e2e/banc-suivi.js   (nécessite ffmpeg ; FSAL_VIDEO_PAN = vidéo de remplacement déjà générée) */
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
function truthH(t) {
  const pose = poseAt(POSE, PAN, t), B = CF.cameraBasis(pose), f = CF.focalPx(VW, pose[5]), src = [], dst = [];
  for (let x = 4; x <= 36; x += 4) for (let y = 3; y <= 17; y += 3.5) { const q = CF.project(B, f, VW, VH, x, y, 0); if (q && q.u > 0 && q.u < VW && q.v > 0 && q.v < VH) { src.push([q.u, q.v]); dst.push([x, y]); } }
  return HG.solve(src, dst);
}
async function seek(win, t) {
  await win.evaluate((t) => window.FSApp.seek(t), t);
  await waitFor(win, (t) => Math.abs(document.querySelector("video").currentTime - t) < 0.15 && !document.querySelector("video").seeking, 8000, t);
  await sleep(500);
}
async function deuxClics(win) {
  const r = await win.evaluate(() => { const b = document.getElementById("overlay").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  await win.mouse.click(r.x + r.w * 0.45, r.y + r.h * 0.55);
  await sleep(150);
  await win.mouse.click(r.x + r.w * 0.6, r.y + r.h * 0.75);
  await sleep(300);
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-banc-"));
  let video = process.env.FSAL_VIDEO_PAN || path.join(dir, "pan.mp4");
  if (!process.env.FSAL_VIDEO_PAN) execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video, JSON.stringify(POSE), JSON.stringify({ lineHalf: 0.04, texture: true }), JSON.stringify(PAN)], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const ai = {
    L, W, dir: 1, flip: true, camera: "mobile", calibrations: [{ t: 0, points: [], H: truthH(0), err: 0 }], kits: { A: [{ shirt: [70, 5, 15], shorts: [10, 0, 0], socks: [35, 1, 2], trim: null, id: "ka1", t: 0, v: "x", src: "silhouette" }], B: [{ shirt: [30, 30, -40], shorts: [10, 0, 0], socks: [35, 1, 2], trim: null, id: "kb1", t: 0, v: "x", src: "silhouette" }] }, frames: null, lost: [], recalage: [], stats: null, suggestedEvents: [],
    settings: { fps: 3, tiles: 1, t0: 0, t1: 6, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai banc", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  must(await waitFor(win, () => !!window.FSAI.ai().camSuivi, 120000), "le suivi de la caméra est fait (aucune analyse lancée)");
  must(await win.evaluate(() => !window.FSAI.ai().frames), "aucune image analysée");
  await win.evaluate(() => { document.getElementById("ai-d1") && (document.getElementById("ai-d1").open = true); });

  // ---- 1. instant suivi (2,0 s) : ni calibré (0 s), ni analysé ----
  await seek(win, 2.0);
  await win.evaluate(() => document.getElementById("ai-bench-mark").click());
  await sleep(300);
  const txt1 = await win.evaluate(() => document.body.innerText);
  must(!/déjà analysé ou calibré|instant déjà/.test(txt1), "aucun message « instant déjà analysé ou calibré »");
  must(await win.evaluate(() => document.getElementById("ai-bench-go").hidden), "aucun bouton de secours : le marquage démarre directement");
  await deuxClics(win);
  const z = await win.evaluate(() => window.FSAI.ai().benchZones || []);
  must(z.length === 1 && [z[0].x1, z[0].y1, z[0].x2, z[0].y2].every(Number.isFinite) && z[0].x2 > z[0].x1 && z[0].y2 > z[0].y1, "la zone de banc est créée à 2,0 s : " + JSON.stringify(z[0]));
  must(z[0] && Math.abs(z[0].t - 2.0) < 0.3, "elle retient l'instant du marquage (" + (z[0] && z[0].t) + " s)");
  // la zone est dans le terrain tel que le calcule la vérité de la scène (même point image -> terrain), à 2 m près
  await sleep(1500);
  const saved = JSON.parse(fs.readFileSync(path.join(ud, "autosave.json"), "utf8"));
  must(saved.ai.benchZones && saved.ai.benchZones.length === 1, "la zone est dans le fichier du projet");

  // ---- 2. la prochaine analyse reçoit la zone ----
  await win.evaluate(() => {
    window.__opts = null;
    ["analyseVideo", "analyseVideoContinuous"].forEach((n) => {
      const o = window.FutsalPipeline[n];
      window.FutsalPipeline[n] = function (opts) { window.__opts = { benchZones: opts.benchZones }; return o.apply(this, arguments); };
    });
  });
  await win.evaluate(() => document.getElementById("ai-run").click());
  must(await waitFor(win, () => !!window.__opts, 20000), "l'analyse démarre");
  must(await win.evaluate((z) => JSON.stringify(window.__opts.benchZones.map((b) => [b.x1, b.y1, b.x2, b.y2])) === JSON.stringify(z.map((b) => [b.x1, b.y1, b.x2, b.y2])), z), "la zone marquée est transmise à l'analyse");
  await win.evaluate(() => { const b = document.getElementById("ai-stop") || document.getElementById("ai-cancel"); if (b) b.click(); });
  await sleep(1500);

  // ---- 3. terrain inconnu (3,0 s, coupure) : un seul geste utile, aucune erreur ----
  await seek(win, 3.0);
  await win.evaluate(() => document.getElementById("ai-bench-mark").click());
  await sleep(300);
  const go = await win.evaluate(() => { const h = document.getElementById("ai-bench-go"); return { hid: h.hidden, btns: [...h.querySelectorAll("button")].map((b) => b.textContent) }; });
  must(!go.hid && go.btns.length === 1 && /Aller à l'instant le plus proche où le terrain est connu \(\d\d:\d\d\)/.test(go.btns[0]), "un seul bouton proposé : « " + go.btns[0] + " »");
  must(!/déjà analysé ou calibré/.test(await win.evaluate(() => document.body.innerText)), "aucun message d'erreur");
  await win.evaluate(() => document.querySelector("#ai-bench-go button").click());
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 3.0) > 0.3, 8000), "la vidéo est allée à un autre instant");
  const t2 = await win.evaluate(() => document.querySelector("video").currentTime);
  must(t2 < 2.6 || t2 > 3.4, "cet instant est hors de la coupure (" + t2.toFixed(2) + " s)");
  await sleep(800);
  await deuxClics(win);
  must(await win.evaluate(() => (window.FSAI.ai().benchZones || []).length === 2), "le marquage a démarré tout seul : une deuxième zone est créée");
  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_VIDEO_PAN) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
