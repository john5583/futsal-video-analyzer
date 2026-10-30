/* Test de bout en bout : contrôle rapide « Terrain » -> chaque réponse (oui / non) est gardée dans le journal de décisions (fichier commun à tous les projets,
   chiffres seulement), et les seuils du terrain sont réglés d'après ces réponses quand il y a assez d'exemples des deux sortes. « Incertain » n'écrit rien.
   Usage : xvfb-run -a node tests/e2e/journal.js   (nécessite ffmpeg, npm i --no-save playwright-core) */
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

// 8 instants mesurés par le suivi : [t, rondSur, rondVis, toucheSur, toucheVis, medSur, medVis, vérifié] ; « oui » du coach = rond bien collé, « non » = rond à 40-60 % (le défaut 50 % l'aurait laissé passer)
const LIGNES = [[2, 60, 64, 30, 40, 50, 60, 1], [4, 36, 64, 30, 40, 50, 60, 1], [6, 62, 64, 30, 40, 50, 60, 1], [8, 38, 64, 30, 40, 50, 60, 0], [10, 59, 64, 30, 40, 50, 60, 1], [12, 34, 64, 30, 40, 50, 60, 1], [14, 61, 64, 30, 40, 50, 60, 1], [16, 40, 64, 30, 40, 50, 60, 1]];
const VERDICT = { 2: "oui", 4: "non", 6: "oui", 8: "non", 10: "oui", 12: "non", 14: "oui", 16: "incertain" };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-jr-"));
  const video = path.join(dir, "essai.mp4");
  execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const jdir = path.join(dir, "journal"); fs.mkdirSync(jdir);
  const frames = [{ t: 0, players: [{ id: 1, team: "A", x: 10, y: 5, b: [100, 100, 130, 180] }], ball: null, bn: [] }];
  const ai = {
    L: 40, W: 20, dir: 1, flip: true, camera: "fixed", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(frames), lost: [], recalage: [],
    stats: { duration: 1 }, suggestedEvents: [], settings: { fps: 3, tiles: 1, t0: 0, t1: 1, tol: 42 }, doubts: [], uncertain: [], subs: [],
    camSuivi: { cle: "essai", t0: 0, t1: 17, seconds: 1, lost: [], frames: LIGNES.map((l) => [l[0], [1, 0, 0, 0, 1, 0, 0, 0, 1], 1]), mesures: LIGNES }
  };
  const proj = { version: 1, name: "essai journal", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 20, events: [], ai };
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud], env: Object.assign({}, process.env, { FSAL_JOURNAL_DIR: jdir }) });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1500, height: 950 });
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai() && window.FSAI.ai().camSuivi && document.querySelector("video").readyState >= 1, 30000), "projet chargé avec les mesures du suivi");
  await win.evaluate(() => { window.FSControle.open(); const s = document.getElementById("qc-comp"); s.value = "terrain"; s.dispatchEvent(new Event("change")); });
  must(await waitFor(win, () => window.FSControle.state().comp === "terrain" && window.FSControle.state().n === 8, 8000), "contrôle rapide « Terrain » : 8 instants à juger");
  must(await win.evaluate(() => document.getElementById("ov-court").checked), "le tracé du terrain est affiché pour être jugé");
  const lire = () => (fs.existsSync(path.join(jdir, "journal-decisions.jsonl")) ? fs.readFileSync(path.join(jdir, "journal-decisions.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  for (let i = 0; i < 8; i++) {
    const t = await win.evaluate(() => Math.round(window.FSControle.state().t));
    const v = VERDICT[t];
    await win.evaluate((v) => document.getElementById(v === "oui" ? "qc-oui" : v === "non" ? "qc-non" : "qc-inc").click(), v);
    await sleep(350);
  }
  const j = lire();
  must(j.length === 7, "7 réponses « oui / non » écrites dans le journal, « incertain » n'écrit rien (" + j.length + ")");
  must(j.every((x) => x.type === "terrain" && x.mesures && x.mesures.rond && (x.verdict === "oui" || x.verdict === "non")), "chaque entrée : mesures + verdict, que des chiffres");
  must(j.every((x) => JSON.stringify(x).length < 500 && !/essai\.mp4.*joueur/.test(JSON.stringify(x))), "rien d'autre que des chiffres (pas de contenu de match)");
  const txt = await win.evaluate(() => document.getElementById("qc-sum").textContent);
  must(/réglés d'après 7 réponse/.test(txt) && /rond 0\.\d+/.test(txt), "l'écran dit que les seuils sont réglés d'après 7 réponses : " + txt.slice(-140));
  const seuil = Number((txt.match(/rond (0\.\d+)/) || [])[1]);
  must(seuil > 0.62 && seuil < 0.9, "le seuil du rond est relevé au-dessus de 62 % (le défaut 50 % laissait passer les « non ») : " + seuil);
  must(await win.evaluate(() => window.FSAI.ai().camSuivi.mesures.length) === 8, "les mesures du suivi sont toujours dans le projet");
  must(errors.length === 0, "aucune erreur" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
