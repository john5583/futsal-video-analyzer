/* Test de bout en bout : « Qualité de l'analyse » -> bouton « ▶ Aller à … (point de reprise) » : la vidéo se place à l'instant, un message le dit,
   le bandeau « Caméra perdue » s'affiche sur le passage perdu. Usage : xvfb-run -a node tests/e2e/camera-reprise.js (nécessite ffmpeg, playwright-core ;
   FSAL_E2E_VIDEO = vidéo de remplacement) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { _electron: electron } = require("playwright-core");
const P = require("../../src/ai/pipeline");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg)) return true; await sleep(250); } return false; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-rep-"));
  let video = path.join(dir, "essai.mp4");
  if (process.env.FSAL_E2E_VIDEO) video = process.env.FSAL_E2E_VIDEO;
  else execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const frames = [];
  for (let i = 0; i < 10; i++) frames.push({ t: i * 0.2, players: [{ id: 1, team: "A", x: 10, y: 8, b: [100, 100, 130, 180] }, { id: 2, team: "B", x: 20, y: 10, b: [300, 100, 330, 180] }], ball: null });
  const item = { id: "inutilisable", level: "attention", blocking: true, title: "⛔ Analyse inutilisable", detail: "Seulement 1 % du temps a pu être analysé de façon fiable.", fix: "Ajoute un calibrage au moment où la caméra redevient stable." };
  const ai = {
    L: 40, W: 20, dir: 1, flip: true, camera: "mobile", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(frames), lost: [[3, 5.5]], recalage: [{ de: 3, a: 5.5, reprise: 3 }],
    stats: { duration: 6 }, suggestedEvents: [], settings: { fps: 5, tiles: 1, t0: 0, t1: 5.5, tol: 42 }, doubts: [], uncertain: [], subs: [],
    quality: { level: "attention", items: [item], good: [], measures: {} }
  };
  const proj = { version: 1, name: "essai reprise", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai().frames && document.querySelector("video").readyState >= 1, 30000), "projet chargé");
  must(await waitFor(win, () => [...document.querySelectorAll("#ai-quality button")].some((b) => /Aller à 00:03/.test(b.textContent)), 8000), "bouton « Aller à 00:03 » affiché dans la qualité de l'analyse");
  must(await win.evaluate(() => /là où la caméra décroche/.test([...document.querySelectorAll("#ai-quality button")].map((b) => b.textContent).join(" "))), "le bouton dit que c'est là que la caméra décroche (reprise = début du passage perdu)");
  const t0 = await win.evaluate(() => document.querySelector("video").currentTime);
  must(Math.abs(t0 - 3) > 1, "la vidéo n'est pas déjà à 3 s (" + t0 + ")");
  await win.evaluate(() => { const b = [...document.querySelectorAll("#ai-quality button")].find((x) => /Aller à/.test(x.textContent)); b.click(); });
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 3) < 0.15 && !document.querySelector("video").seeking, 8000), "clic : la vidéo se place à 3 s");
  must(await win.evaluate(() => document.querySelector("video").paused), "la vidéo est en pause à cet instant");
  must(await win.evaluate(() => { const t = document.getElementById("toast"); return !t.hidden && /Vidéo placée à 00:03/.test(t.textContent) && /décroche/.test(t.textContent); }), "un message dit où la vidéo a été placée et pourquoi");
  must(await win.evaluate(() => { const r = document.querySelector("video").getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }), "la vidéo est visible à l'écran");
  must(await win.evaluate(() => window.FSApp.ai.getFrames().length > 0), "(les images analysées sont chargées)");
  // bandeau : dessiné sur le passage perdu, absent ailleurs (pixels rouges en haut à gauche de la couche de dessin)
  const banner = () => win.evaluate(() => { const c = document.getElementById("overlay"), g = c.getContext("2d"), d = g.getImageData(12 * (window.devicePixelRatio || 1), 12 * (window.devicePixelRatio || 1), 4, 4).data; return d[0] > 150 && d[1] < 60 && d[3] > 150; });
  must(await banner(), "bandeau « Caméra perdue » affiché sur le passage perdu");
  await win.evaluate(() => { window.FSApp.seek(1); });
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 1) < 0.15, 6000), "retour à 1 s (caméra suivie)");
  await sleep(500);
  must(!(await banner()), "pas de bandeau là où la caméra est suivie");
  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_E2E_VIDEO) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
