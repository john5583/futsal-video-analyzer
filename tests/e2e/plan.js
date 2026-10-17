/* Test de bout en bout : page « Mon plan tactique » (questions, comparaison au match, moments à éviter sur la vraie vidéo).
   Projet synthétique : mon équipe joue en 2-2 pendant 6 s puis en 3-1 pendant 6 s ; l'adversaire a le ballon.
   Usage : xvfb-run -a node tests/e2e/plan.js   (nécessite ffmpeg, npm i --no-save playwright-core) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { _electron: electron } = require("playwright-core");
const CF = require("../../src/ai/court-fit");
const HG = require("../../src/ai/homography");
const P = require("../../src/ai/pipeline");
const { POSE } = require("../helpers/make-video");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg)) return true; await sleep(250); } return false; }

const L = 40, W = 20, VW = 960, VH = 540;
const project = (x, y) => { const B = CF.cameraBasis(POSE), f = CF.focalPx(VW, POSE[5]), q = CF.project(B, f, VW, VH, x, y, 0); return q ? [q.u, q.v] : null; };
const box = (x, y) => { const p = project(x, y); if (!p) return [0, 0, 20, 40]; const u = p[0] / VW, v = p[1] / VH; return [Math.round((u - 0.025) * 1000), Math.round((v - 0.16) * 1000), Math.round((u + 0.025) * 1000), Math.round(v * 1000)]; };

function makeFrames() {
  const court = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13], [9, 16], [26, 5]];
  const pix = court.map(([x, y]) => { const p = project(x, y); return [p[0] / VW, p[1] / VH]; });
  const h = HG.solve(pix, court).map((v) => Number(v.toPrecision(7))), frames = [];
  for (let i = 0; i <= 60; i++) {
    const t = Math.round(i * 0.2 * 100) / 100;
    const xs = t < 6 ? [8, 10, 18, 20] : [8, 10, 12, 24];      // 2-2 puis 3-1
    const ys = [6, 13, 9, 15];
    const players = xs.map((x, k) => ({ id: k + 1, team: "A", x, y: ys[k], b: box(x, ys[k]) }))
      .concat([[26, 8], [26.5, 12], [24, 5], [25, 15]].map(([x, y], k) => ({ id: k + 5, team: "B", x, y, b: box(x, y) })));
    frames.push({ t, players, ball: { x: 26.4, y: 8.1 }, h });
  }
  return frames;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-plan-"));
  const video = path.join(dir, "essai.mp4");
  execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const proj = {
    version: 1, name: "essai plan", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: "essai.mp4", secondHalfStart: null, duration: 6, events: [],
    ai: { L, W, dir: 1, flip: true, camera: "fixed", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(makeFrames()), lost: [], stats: null, suggestedEvents: [], settings: { fps: 5, tiles: 1, t0: 0, t1: 12, tol: 42 } }
  };
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai().frames && window.FSAI.ai().frames.length > 40 && window.FSApp.getVideoUrl() && document.querySelector("video").readyState >= 1, 30000), "projet chargé");
  const click = (sel, text) => win.evaluate(([s, t]) => { const b = [...document.querySelectorAll(s)].find((x) => !t || x.textContent.includes(t)); if (!b) return false; b.click(); return true; }, [sel, text]);
  const radio = (name, value) => win.evaluate(([n, v]) => { const r = document.querySelector("input[name=\"plan-" + n + "\"][value=\"" + v + "\"]"); if (!r) return false; r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); return true; }, [name, value]);

  // 1. l'onglet existe et pose les questions
  must(await win.evaluate(() => !!document.querySelector("#tabs button[data-tab=plan]")), "onglet « Mon plan tactique » présent");
  await win.evaluate(() => window.FSApp.showTab("plan"));
  must(await waitFor(win, () => document.querySelectorAll("#plan-questions fieldset.plan-q").length === 6, 8000), "6 questions affichées");
  must(await win.evaluate(() => document.querySelector("input[name=\"plan-system\"][value=\"3-1\"]").checked), "le système du projet (3-1) est déjà choisi");
  const qtxt = await win.evaluate(() => document.getElementById("plan-questions").textContent);
  must(/quel système de jeu/i.test(qtxt) && /pressing/i.test(qtxt) && /gardien-joueur/i.test(qtxt), "les questions portent sur le système, le pressing et le gardien-joueur");

  // 2. comparaison au match : 3-1 voulu, 2-2 joué la moitié du temps
  must(await waitFor(win, () => document.querySelectorAll("#plan-result .plan-rule").length >= 2, 15000), "le résultat est calculé (règles affichées)");
  const rtxt = await win.evaluate(() => document.getElementById("plan-result").textContent);
  must(/Respect du système de jeu/.test(rtxt), "la règle « système de jeu » est évaluée");
  const share = await win.evaluate(() => { const r = [...document.querySelectorAll("#plan-result .plan-rule")].find((x) => /Respect du système/.test(x.textContent)); const m = r && /(\d+) % respecté/.exec(r.textContent); return m ? Number(m[1]) : -1; });
  must(share >= 30 && share <= 70, "environ la moitié du temps respectée (" + share + " %)");
  must(/Forme 2-2 pendant/.test(rtxt) && /au lieu du 3-1 voulu/.test(rtxt), "le moment à éviter dit « forme 2-2 au lieu du 3-1 »");
  must(/Ce que le programme ne peut pas vérifier/.test(rtxt) && /Coups de pied arrêtés/.test(rtxt) && /Ce qu'il faudrait faire/.test(rtxt), "« à faire » et « non vérifiable » affichés");

  // 3. voir un écart sur la vraie vidéo
  must(await click("#plan-result .plan-dev button[data-dev]", "Voir sur la vidéo"), "bouton « Voir sur la vidéo »");
  must(await waitFor(win, () => !document.getElementById("plan-real").hidden && /reveal|correct|done/.test(document.getElementById("plan-real").dataset.phase || ""), 15000), "la vraie vidéo s'affiche avec les dessins");
  await sleep(2500);
  const drawn = await win.evaluate(() => { const c = document.getElementById("pl-overlay"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  must(drawn > 500, "cercles et correction dessinés sur l'image (" + drawn + " pixels)");
  must(/À éviter/.test(await win.evaluate(() => document.getElementById("plan-view-text").textContent)), "le texte « à éviter / à faire » accompagne la vidéo");

  // 4. changer de système : enregistré dans le projet, comparaison refaite (maintenant 3-1 est l'écart)
  must(await radio("system", "2-2"), "choix du système 2-2");
  must(await waitFor(win, () => window.FSApp.state.project.plan && window.FSApp.state.project.plan.answers.system === "2-2" && window.FSApp.state.project.defaultSystem === "2-2", 5000), "plan enregistré dans le projet, système du projet aligné");
  must(await waitFor(win, () => /Forme 3-1 pendant/.test(document.getElementById("plan-result").textContent), 8000), "comparaison refaite : le 3-1 est maintenant l'écart");

  // 5. bloc haut voulu alors que le bloc est médian/bas -> nouvelle règle et nouvel écart
  must(await radio("defense", "haut"), "choix d'un bloc haut");
  must(await waitFor(win, () => /Hauteur du bloc/.test(document.getElementById("plan-result").textContent) && /trop bas/.test(document.getElementById("plan-result").textContent), 8000), "bloc trop bas signalé");

  // 6. gardien-joueur « seulement quand on est menés » : dit clairement que le score n'est pas lu
  must(await radio("flyingGK", "derriere"), "choix gardien-joueur « seulement quand on est menés »");
  must(await waitFor(win, () => /ne lit pas le score/.test(document.getElementById("plan-result").textContent), 8000), "le programme dit qu'il ne lit pas le score");

  // 7. mes consignes
  await win.evaluate(() => { const t = document.getElementById("plan-notes"); t.value = "sortie courte depuis le gardien"; t.dispatchEvent(new Event("input", { bubbles: true })); });
  must(await waitFor(win, () => window.FSApp.state.project.plan.notes === "sortie courte depuis le gardien" && /Mes autres consignes/.test(document.getElementById("plan-result").textContent), 8000), "mes consignes sont notées (et dites non vérifiées)");

  must(errors.length === 0, "aucune erreur dans l'interface " + JSON.stringify(errors));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + (e.stack || e.message)); process.exit(1); });
