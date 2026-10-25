/* Test de bout en bout : bancs reconnus tout seuls, fiches des personnes au banc, entrée d'un remplaçant reconnue, questions non bloquantes.
   Les images de l'analyse (synthétiques) portent des lectures hors terrain (bn) : trois personnes assises à un banc, un joueur qui entre à 150 s avec l'apparence de la 2e.
   Vérifie : le banc et les 3 fiches s'affichent, le changement dit « remplaçant B (reconnu) » et « sortie non vue » ; nommer une fiche est gardé ; « Ce n'est pas un banc » retire le banc
   et ses changements ; aucune erreur. Usage : xvfb-run -a node tests/e2e/bancs-auto.js (nécessite ffmpeg ; FSAL_E2E_VIDEO = vidéo de remplacement) */
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

const SIG = { rouge: [55, 60, 40, 20, 0, 0, 55, 60, 40], vert: [60, -50, 40, 20, 0, 0, 60, -50, 40], bleu: [35, 20, -60, 20, 0, 0, 35, 20, -60] };
const jit = (s, k) => s.map((v) => (v == null ? v : v + ((k % 3) - 1)));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-bancs-"));
  let video = path.join(dir, "essai.mp4");
  if (process.env.FSAL_E2E_VIDEO) video = process.env.FSAL_E2E_VIDEO;
  else execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const frames = [];
  for (let i = 0; i <= 1000; i++) {
    const t = Math.round(i * 0.3 * 10) / 10, f = { t, players: [], ball: null, bn: [] };
    [[18, SIG.rouge], [19.3, SIG.vert], [20.6, SIG.bleu]].forEach(([x, s], k) => f.bn.push([0, x, -2.5 + 0.1 * ((i + k) % 3), 1, jit(s, i + k)]));
    const edge = (x, y, id, s) => { f.players.push({ id, team: "A", x, y, b: [100, 100, 130, 180] }); f.bn.push([1, x, y, 0, jit(s, i)]); };
    if (t < 147) edge(30, 5, 5, SIG.rouge);
    if (t >= 150) edge(t < 153 ? 19.5 : 25, t < 153 ? 0.6 : 5, 99, SIG.vert);
    frames.push(f);
  }
  const ai = {
    L: 40, W: 20, dir: 1, flip: true, camera: "mobile", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(frames), lost: [], recalage: [],
    stats: { duration: 6 }, suggestedEvents: [], settings: { fps: 3, tiles: 1, t0: 0, t1: 300, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai bancs", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  const txt = () => win.evaluate(() => document.getElementById("ai-bancs").textContent);
  must(await waitFor(win, () => /Banc 1/.test(document.getElementById("ai-bancs").textContent), 15000), "un banc est reconnu et affiché sans clic");
  let t = await txt();
  must(/✔ reconnu/.test(t), "le banc est dit « reconnu » : " + t.split("\n").find((l) => /Banc 1/.test(l)));
  must((t.match(/remplaçant [A-C](?=vue)/g) || []).length === 3, "trois fiches (remplaçant A, B, C)");
  must(/Entre : remplaçant [A-C] \(reconnu\)/.test(t), "le changement dit qui entre : " + (t.split("\n").find((l) => /Entre :/.test(l)) || ""));
  must(/sortie non vue/.test(t), "la sortie non vue est dite telle quelle");
  // nommer une fiche
  await win.evaluate(() => { const i = document.querySelectorAll("#ai-bancs input[type=text]")[1]; i.value = "Léo"; i.dispatchEvent(new Event("change")); });
  must(await waitFor(win, () => /Léo/.test(document.getElementById("ai-bancs").textContent), 5000), "la fiche nommée « Léo » s'affiche");
  must(await win.evaluate(() => window.FSAI.ai().bancs.fiches.some((f) => f.nom === "Léo")), "le nom est gardé dans le projet");
  must(/Entre : Léo \(reconnu\)/.test(await txt()), "le changement porte le nom donné");
  // refuser le banc
  await win.evaluate(() => { [...document.querySelectorAll("#ai-bancs button")].find((b) => /Ce n'est pas un banc/.test(b.textContent)).click(); });
  must(await waitFor(win, () => !/Banc 1/.test(document.getElementById("ai-bancs").textContent), 5000), "« Ce n'est pas un banc » retire le banc");
  must(!/Entre :/.test(await txt()), "et ses changements");
  must(await win.evaluate(() => (window.FSAI.ai().bancsDecisions || []).length === 1), "la décision est gardée dans le projet");
  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_E2E_VIDEO) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
