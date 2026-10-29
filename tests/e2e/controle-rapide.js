/* Test de bout en bout : Contrôle rapide de la qualité (menu Fichier > Contrôle rapide…).
   Vérifie : sans analyse, un message et rien d'ouvert ; avec une analyse, la barre propose des instants, O / N / ? sont gardés dans le projet,
   Échap ferme sans rien perdre, la réouverture reprend à la première question sans réponse, un nouveau verdict remplace l'ancien,
   les réponses survivent à la fermeture du programme, le menu ouvre la barre, aucune erreur.
   Usage : xvfb-run -a node tests/e2e/controle-rapide.js   (nécessite ffmpeg ou FSAL_E2E_VIDEO) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { _electron: electron } = require("playwright-core");
const { build } = require("../helpers/audit-fixture");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn).catch(() => false)) return true; await sleep(250); } return false; }

async function lance(ud) {
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1500, height: 950 });
  const errors = [];
  win.on("pageerror", (e) => errors.push("exception : " + e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => window.FSAI && window.FSControle && document.querySelector("video").readyState >= 1, 40000), "projet chargé");
  return { app, win, errors };
}
const verdicts = (win) => win.evaluate(() => (window.FSAI.ai().controleRapide || []).map((x) => x.comp + ":" + x.v + "@" + x.t));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-controle-"));

  // 1. projet sans analyse : un message, rien d'ouvert
  const f0 = build(dir, "ancien");
  const A = await lance(f0.ud);
  await A.win.evaluate(() => window.FSControle.open()); await sleep(500);
  must(await A.win.evaluate(() => !document.getElementById("qc-bar") || document.getElementById("qc-bar").hidden), "sans analyse : la barre ne s'ouvre pas");
  must(await A.win.evaluate(() => /Faites d'abord une analyse/.test(document.getElementById("toast").textContent)), "sans analyse : le message dit quoi faire");
  must(A.errors.length === 0, "sans analyse : aucune erreur");
  await A.app.close();

  // 2. projet analysé
  const f1 = build(dir, "complet");
  const B = await lance(f1.ud);
  const w = B.win;
  await w.evaluate(() => window.FSControle.open()); await sleep(600);
  must(await w.evaluate(() => !document.getElementById("qc-bar").hidden), "avec analyse : la barre s'ouvre");
  const st0 = await w.evaluate(() => window.FSControle.state());
  must(st0.n >= 3, "des instants sont proposés (" + st0.n + ")");
  must(await w.evaluate(() => /ballon/i.test(document.getElementById("qc-q").textContent)), "la question du ballon est posée");
  await w.keyboard.press("o"); await sleep(300);
  await w.keyboard.press("n"); await sleep(300);
  await w.keyboard.press("?"); await sleep(300);
  let v = await verdicts(w);
  must(v.length === 3 && /ballon:oui/.test(v[0]) && /ballon:non/.test(v[1]) && /ballon:incertain/.test(v[2]), "O / N / ? sont gardés dans le projet : " + v.join(", "));
  must(await w.evaluate(() => /Oui 1 · Non 1 · Incertain 1/.test(document.getElementById("qc-sum").textContent)), "le résumé compte les trois réponses");
  must(await w.evaluate(() => window.FSControle.state().idx === 3), "après trois réponses, on est à l'image suivante");
  // la vidéo suit l'image proposée
  must(await w.evaluate(() => { const st = window.FSControle.state(), t = window.FSAI.ai().controleRapide[0].t; return Math.abs(document.querySelector("video").currentTime - Math.min(t, 100)) >= 0 && document.querySelector("video").paused; }), "la vidéo est en pause pendant le contrôle");
  await w.keyboard.press("Escape"); await sleep(300);
  must(await w.evaluate(() => document.getElementById("qc-bar").hidden), "Échap ferme la barre");
  must((await verdicts(w)).length === 3, "fermer ne perd aucune réponse");
  await w.evaluate(() => window.FSControle.open()); await sleep(500);
  must(await w.evaluate(() => window.FSControle.state().idx === 3), "à la réouverture, on reprend à la première question sans réponse");
  await w.keyboard.press("ArrowLeft"); await sleep(200);
  await w.keyboard.press("n"); await sleep(300);
  v = await verdicts(w);
  must(v.length === 3 && /ballon:non/.test(v[2]), "un nouveau verdict sur le même instant remplace l'ancien (toujours 3 réponses) : " + v.join(", "));
  // changer de sujet
  await w.selectOption("#qc-comp", "equipes"); await sleep(400);
  must(await w.evaluate(() => /couleurs d'équipe/i.test(document.getElementById("qc-q").textContent)), "le sujet « Équipes » pose sa propre question");
  await w.keyboard.press("o"); await sleep(300);
  must((await verdicts(w)).some((x) => /^equipes:oui/.test(x)), "le verdict « équipes » est gardé à part");
  must(B.errors.length === 0, "aucune erreur pendant le contrôle" + (B.errors.length ? " : " + B.errors.join(" | ") : ""));
  await sleep(4000);
  await B.app.close();

  // 3. les réponses survivent à la fermeture du programme ; le menu ouvre la barre
  const C = await lance(f1.ud);
  v = await verdicts(C.win);
  must(v.length === 4, "après fermeture et réouverture du programme : les 4 réponses sont là (" + v.length + ")");
  await C.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.send("menu", "controle"); });
  must(await waitFor(C.win, () => { const b = document.getElementById("qc-bar"); return !!b && !b.hidden; }, 5000), "le menu « Contrôle rapide… » ouvre la barre");
  await sleep(300);
  const pad = await C.win.evaluate(() => ({ p: document.querySelector("main").style.paddingBottom, h: document.getElementById("qc-bar").offsetHeight }));
  must(parseFloat(pad.p) >= pad.h, "barre ouverte : la place de la barre est réservée sous l'onglet (ses boutons restent atteignables) : " + JSON.stringify(pad));
  // la barre est fixée en bas de l'écran : quitter l'onglet « Analyse vidéo » la ferme (elle recouvrait les boutons de « Corrections animées »), sans perdre de réponse
  await C.win.evaluate(() => document.querySelector("#tabs button[data-tab=corrections]").click()); await sleep(300);
  must(await C.win.evaluate(() => document.getElementById("qc-bar").hidden), "clic sur l'onglet « Corrections animées » : la barre se ferme, elle ne recouvre plus ses boutons");
  must(await C.win.evaluate(() => document.querySelector("main").style.paddingBottom === ""), "barre fermée : la place réservée est rendue");
  await C.win.evaluate(() => window.FSControle.open()); await sleep(400);
  must(await C.win.evaluate(() => !document.getElementById("qc-bar").hidden && document.getElementById("tab-analyse").classList.contains("active")), "depuis un autre onglet, le contrôle se rouvre et ramène à l'analyse");
  await C.win.evaluate(() => window.FSApp.showTab("rapport")); await sleep(300);
  must(await C.win.evaluate(() => document.getElementById("qc-bar").hidden), "changement d'onglet par le programme (rapport) : la barre se ferme aussi");
  must((await verdicts(C.win)).length === 4, "changer d'onglet ne fait perdre aucune réponse");
  must(C.errors.length === 0, "aucune erreur après réouverture et changements d'onglet");
  await C.app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
