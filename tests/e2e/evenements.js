/* Test de bout en bout : événements du match proposés d'après le ballon (sortie de touche, phase arrêtée, but), validation « Oui / Non », réponses gardées dans le projet,
   rien proposé quand le ballon n'est pas vu. Usage : xvfb-run -a node tests/e2e/evenements.js   (nécessite ffmpeg, npm i --no-save playwright-core ; FSAL_E2E_VIDEO = vidéo de remplacement) */
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

function ballAt(t) {
  if (t < 10) return { x: 20, y: 10 - t * 0.9 };
  if (t < 14) return { x: 20, y: -2 };                       // sortie par la ligne de touche
  if (t < 30) return { x: 20 + (t - 14), y: 10 };            // en jeu
  if (t < 34) return { x: 15, y: 8 };                        // ballon immobile 4 s
  if (t < 48) return { x: 22 + (t - 34), y: 10 };            // en jeu (1 m/s)
  if (t < 51) return { x: 41.6, y: 10.4 };                   // entré dans le but de droite
  return null;                                               // plus de ballon vu
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-evm-"));
  let video = path.join(dir, "essai.mp4");
  if (process.env.FSAL_E2E_VIDEO) video = process.env.FSAL_E2E_VIDEO;
  else execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const frames = [];
  for (let t = 0; t <= 60; t += 0.33) { const tt = Math.round(t * 100) / 100; frames.push({ t: tt, players: [{ id: 1, team: "A", x: 10, y: 5, b: [100, 100, 130, 180] }], ball: ballAt(tt), bn: [] }); }
  const ai = {
    L: 40, W: 20, dir: 1, flip: true, camera: "mobile", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(frames), lost: [], recalage: [],
    stats: { duration: 6 }, suggestedEvents: [], settings: { fps: 3, tiles: 1, t0: 0, t1: 60, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai evenements", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  const txt = () => win.evaluate(() => document.getElementById("ai-evm").textContent);
  must(await waitFor(win, () => /Sortie de touche/.test(document.getElementById("ai-evm").textContent), 15000), "une sortie de touche est proposée sans clic");
  const t = await txt();
  must(/Phase arrêtée/.test(t), "une phase arrêtée est proposée (ballon immobile 4 s)");
  must(/But — pour mon équipe/.test(t), "un but est proposé, pour mon équipe (elle attaque à droite)");
  must(!/Corner|Penalty/.test(t), "aucun corner ni penalty inventé");
  must((t.match(/Sortie de touche/g) || []).length === 1, "une seule sortie de touche (pas une par image)");
  must(/\(3 à valider, 0 validé\(s\)\)/.test(await win.evaluate(() => document.getElementById("ai-evm-count").textContent)), "compteur : 3 à valider");
  const bil = await win.evaluate(() => document.getElementById("ai-bilan").textContent);
  must(/Ballon vu sur \d+(,\d)? %/.test(bil) && /PAS une justesse/.test(bil), "bilan de fiabilité : ballon vu, avec la mise en garde « pas une justesse » : " + bil);
  must(/Personnes identifiées : non évalué/.test(bil), "bilan : ce qui n'est pas calculé est dit « non évalué »");
  // validation Oui / Non
  await win.evaluate(() => { document.querySelectorAll("#ai-evm .ev")[0].querySelector("[data-a=ok]").click(); });
  await win.evaluate(() => { document.querySelectorAll("#ai-evm .ev")[1].querySelector("[data-a=no]").click(); });
  must(await waitFor(win, () => /✔ validé/.test(document.getElementById("ai-evm").textContent) && /✖ écarté/.test(document.getElementById("ai-evm").textContent), 5000), "« Oui » et « Non » s'affichent");
  const st = await win.evaluate(() => window.FSAI.ai().evenementsMatch.map((e) => e.type + ":" + (e.statut || "")));
  must(st.join(",") === "sortie_touche:ok,phase_arretee:non,but:", "les réponses sont gardées dans le projet : " + st.join(","));
  must(/\(1 à valider, 1 validé\(s\)\)/.test(await win.evaluate(() => document.getElementById("ai-evm-count").textContent)), "compteur mis à jour : 1 à valider, 1 validé");
  // les réponses ne sont jamais reposées : l'interface redessinée garde les statuts
  await win.evaluate(() => window.FSApp.showTab("rapport"));
  await win.evaluate(() => window.FSApp.showTab("analyse"));
  must(/✔ validé/.test(await txt()) && /✖ écarté/.test(await txt()), "après un changement d'onglet, les réponses sont toujours là");
  must(/1 validé\(s\), 1 écarté\(s\), 1 à valider/.test(await win.evaluate(() => document.getElementById("ai-bilan").textContent)), "le bilan reprend les réponses données aux événements : " + (await win.evaluate(() => document.getElementById("ai-bilan").textContent)));
  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_E2E_VIDEO) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
