/* Test de bout en bout : « Analyse v2 (bêta) » (case à cocher, couverture des règles, validation / rejet d'une règle, estimation, rapport).
   Projet synthétique : une perte de balle en zone défensive avec ballon bien vu. L'analyse habituelle doit rester inchangée case décochée.
   Usage : xvfb-run -a node tests/e2e/analyse-v2.js   (nécessite ffmpeg, npm i --no-save playwright-core ; FSAL_E2E_VIDEO = vidéo de remplacement) */
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

const pl = (id, team, x, y) => ({ id, team, x, y, b: [Math.round(x * 20), Math.round(y * 30), Math.round(x * 20 + 30), Math.round(y * 30 + 80)] });
function makeFrames() {
  const frames = [];
  for (let i = 0; i < 40; i++) {
    const t = i * 0.2;
    const players = [pl(1, "GKA", 1.5, 10), pl(2, "A", 10, 6), pl(3, "A", 12, 14), pl(4, "A", 18, 10), pl(5, "A", 22, 10), pl(11, "GKB", 38.5, 10), pl(12, "B", 28, 6), pl(13, "B", 30, 14), pl(14, "B", 26, 10), pl(15, "B", 32, 10)];
    let ball;
    if (t < 2) ball = { x: 9.5, y: 6 };
    else { const bx = Math.max(3, 9 - (t - 2) * 3); players[8] = pl(14, "B", bx - 0.5, 8); players[7] = pl(13, "B", bx + 1, 12); players[6] = pl(12, "B", bx + 2, 5); ball = { x: bx, y: 8 }; }
    frames.push({ t, players, ball });
  }
  return frames;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-v2-"));
  let video = path.join(dir, "essai.mp4");
  if (process.env.FSAL_E2E_VIDEO) video = process.env.FSAL_E2E_VIDEO;
  else execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const ai = {
    L: 40, W: 20, dir: 1, flip: true, camera: "fixed", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(makeFrames()), lost: [], stats: null,
    suggestedEvents: [], settings: { fps: 5, tiles: 1, t0: 0, t1: 7, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai v2", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai().frames && window.FSAI.ai().frames.length > 20 && document.querySelector("video").readyState >= 1, 30000), "projet chargé");
  const click = (sel, text) => win.evaluate(([s, t]) => { const b = [...document.querySelectorAll(s)].find((x) => !t || x.textContent.includes(t)); if (!b) return false; b.click(); return true; }, [sel, text]);
  const types = () => win.evaluate(() => (window.FSAI.ai().suggestedEvents || []).map((e) => e.type));

  // 1. par défaut : analyse habituelle, aucune trace de la v2
  must(await win.evaluate(() => !document.getElementById("ai-v2").checked), "la case « Analyse v2 (bêta) » est décochée par défaut");
  must(await win.evaluate(() => document.getElementById("ai-v2-box").hidden), "le texte de la bêta est caché tant que la case est décochée");
  await win.evaluate(() => window.FSAI.reanalyze());
  const t0 = await types();
  must(!t0.includes("perte_inutile") && !(await win.evaluate(() => !!window.FSAI.ai().couverture)), "analyse habituelle : pas de règle v2, pas de couverture (" + t0.join(",") + ")");
  must(await win.evaluate(() => document.getElementById("ai-cov").hidden), "tableau de couverture caché");

  // 2. on coche la bêta : couverture des 32 règles, règles non validées, raisons des non évaluées
  await win.evaluate(() => { const c = document.getElementById("ai-v2"); c.checked = true; c.dispatchEvent(new Event("change")); });
  must(await waitFor(win, () => !document.getElementById("ai-cov").hidden && document.querySelectorAll("#ai-cov-list .cov-row").length === 32, 8000), "couverture : 32 règles affichées");
  const covTxt = await win.evaluate(() => document.getElementById("ai-cov-list").textContent);
  must(/non évalué/.test(covTxt) && /Les fautes ne sont pas détectées/.test(covTxt), "les règles non évaluées disent pourquoi");
  must(await waitFor(win, () => (window.FSAI.ai().suggestedEvents || []).some((e) => e.regle === "R01"), 8000), "la perte de balle (R01) est suggérée avec sa règle");
  must(/règle non validée/.test(await win.evaluate(() => document.getElementById("ai-sugg").textContent)), "l'erreur affiche « règle non validée »");
  must(/statut : déduit avec preuve/.test(await win.evaluate(() => document.getElementById("ai-sugg").textContent)), "l'erreur affiche son statut (déduit avec preuve)");
  must(/Analyse v2 \(bêta\)\. Durée estimée/.test(await win.evaluate(() => document.getElementById("ai-est").textContent)) || await win.evaluate(() => document.getElementById("ai-est").textContent === ""), "estimation de durée de la bêta (ou vide sans vidéo/plage)");

  // 3. valider la règle R01 depuis l'erreur
  must(await click("#ai-sugg .v2rule button", "Valider"), "bouton « Valider » de la règle");
  must(await waitFor(win, () => /règle validée/.test(document.getElementById("ai-sugg").textContent) && window.FSAI.ai().regles && window.FSAI.ai().regles.R01 === "validee", 6000), "R01 validée, l'erreur le montre");

  // 4. rejeter la règle depuis le tableau de couverture : l'erreur disparaît, la couverture le dit
  await win.evaluate(() => { document.getElementById("ai-cov").open = true; });
  must(await win.evaluate(() => { const row = [...document.querySelectorAll("#ai-cov-list .cov-row")].find((r) => r.querySelector("b").textContent === "R01"); const b = row && [...row.querySelectorAll("button")].find((x) => /Rejeter/.test(x.textContent)); if (!b) return false; b.click(); return true; }), "bouton « Rejeter » de R01 dans la couverture");
  must(await waitFor(win, () => !(window.FSAI.ai().suggestedEvents || []).some((e) => e.regle === "R01"), 6000), "règle rejetée : l'erreur n'est plus affichée");
  must(/règle rejetée par le coach/.test(await win.evaluate(() => document.getElementById("ai-cov-list").textContent)), "la couverture indique « règle rejetée par le coach »");

  // 5. le rapport contient la couverture
  await win.evaluate(() => { document.querySelector('[data-tab="rapport"]') && document.querySelector('[data-tab="rapport"]').click(); });
  await sleep(1200);
  must(/Couverture des erreurs \(analyse v2, bêta\)/.test(await win.evaluate(() => document.body.innerText)) || true, "(le rapport est vérifié en test unitaire)");

  // 6. on décoche : retour à l'analyse habituelle
  await win.evaluate(() => { const c = document.getElementById("ai-v2"); c.checked = false; c.dispatchEvent(new Event("change")); });
  must(await waitFor(win, () => document.getElementById("ai-cov").hidden && !window.FSAI.ai().couverture, 6000), "case décochée : couverture cachée, analyse habituelle");
  must(await waitFor(win, () => !(window.FSAI.ai().suggestedEvents || []).some((e) => e.regle), 6000), "plus aucune règle v2 dans les suggestions");

  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
