/* Test de bout en bout : « Personnes reconnues » (registre des personnes) dans les résultats de l'analyse.
   Projet d'essai : 8 joueurs suivis 12 s sans coupure -> 8 fiches « sûre » ; aucune fausse identité inventée ; rien affiché sans analyse.
   Usage : xvfb-run -a node tests/e2e/registre-personnes.js   (nécessite ffmpeg ou FSAL_E2E_VIDEO) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { _electron: electron } = require("playwright-core");
const { build } = require("../helpers/audit-fixture");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function lance(ud) {
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow(); await win.setViewportSize({ width: 1500, height: 950 });
  const errors = []; win.on("pageerror", (e) => errors.push(e.message)); win.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await win.waitForLoadState("load");
  const end = Date.now() + 40000; while (Date.now() < end) { if (await win.evaluate(() => window.FSAI && document.querySelector("video").readyState >= 1).catch(() => false)) break; await sleep(250); }
  await sleep(1200);
  return { app, win, errors };
}
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-registre-"));
  const A = await lance(build(dir, "ancien").ud);
  must(await A.win.evaluate(() => document.getElementById("ai-pers-box").hidden), "sans analyse : le panneau « Personnes reconnues » est caché");
  must(A.errors.length === 0, "sans analyse : aucune erreur");
  await A.app.close();

  const B = await lance(build(dir, "complet").ud), w = B.win;
  must(await w.evaluate(() => !document.getElementById("ai-pers-box").hidden), "avec une analyse : le panneau est affiché");
  const sum = await w.evaluate(() => document.getElementById("ai-pers-sum").textContent);
  must(/8 personne\(s\) : 8 sûre\(s\), 0 probable\(s\), 0 non identifiée\(s\)/.test(sum), "8 personnes sûres : " + sum);
  const rows = await w.evaluate(() => [...document.querySelectorAll("#ai-pers .ev")].map((e) => e.textContent));
  must(rows.length === 8 && rows.filter((r) => /Mon équipe/.test(r)).length === 4 && rows.filter((r) => /Adversaire/.test(r)).length === 4, "une ligne par personne, avec son équipe");
  must(rows.every((r) => /^P\d+ — /.test(r)), "chaque personne a sa fiche P1, P2…");
  must(await w.evaluate(() => (window.FSAI.ai().personnes || []).length === 8 && window.FSAI.ai().personnes.every((p) => p.statut === "sûre")), "les fiches sont gardées dans le projet");
  must(B.errors.length === 0, "aucune erreur" + (B.errors.length ? " : " + B.errors.join(" | ") : ""));
  await B.app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
