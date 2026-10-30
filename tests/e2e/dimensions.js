/* Test de bout en bout : modifier « Longueur (m) » ou « Largeur (m) » a un effet visible (message + terrain re-tracé), est gardé dans le projet,
   et une valeur hors limites est refusée avec un message (jamais acceptée en silence).
   Usage : xvfb-run -a node tests/e2e/dimensions.js   (nécessite ffmpeg, npm i --no-save playwright-core) */
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-dim-"));
  const video = path.join(dir, "essai.mp4");
  execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const frames = [{ t: 0, players: [{ id: 1, team: "A", x: 10, y: 5, b: [100, 100, 130, 180] }], ball: null, bn: [] }, { t: 0.5, players: [{ id: 1, team: "A", x: 11, y: 5, b: [100, 100, 130, 180] }], ball: null, bn: [] }];
  const ai = {
    L: 40, W: 20, dir: 1, flip: true, camera: "mobile", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(frames), lost: [], recalage: [],
    stats: { duration: 1 }, suggestedEvents: [], settings: { fps: 3, tiles: 1, t0: 0, t1: 1, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai dimensions", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 1, events: [], ai };
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
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai() && document.querySelector("video").readyState >= 1, 30000), "projet chargé");
  const toast = () => win.evaluate(() => document.getElementById("toast").textContent);
  const saisir = (id, v) => win.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]);
  await saisir("ai-L", 38);
  must(/Longueur mise à 38 m : terrain re-tracé/.test(await toast()), "longueur : message « Longueur mise à 38 m : terrain re-tracé » (texte : " + await toast() + ")");
  must(await win.evaluate(() => window.FSAI.ai().L) === 38, "la longueur est gardée dans le projet");
  await saisir("ai-W", 18.5);
  must(/Largeur mise à 18,5 m : terrain re-tracé/.test(await toast()), "largeur : message avec la valeur (texte : " + await toast() + ")");
  await saisir("ai-L", 60);
  must(/Longueur entre 25 et 42 m/.test(await toast()), "valeur hors limites : refus expliqué");
  must(await win.evaluate(() => window.FSAI.ai().L === 38 && document.getElementById("ai-L").value === "38"), "la valeur hors limites n'est pas retenue, le champ revient à 38");
  must(errors.length === 0, "aucune erreur de page" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
