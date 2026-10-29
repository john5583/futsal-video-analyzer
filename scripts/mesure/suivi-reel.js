/* Fait tourner le VRAI suivi de caméra de l'application (Electron) sur une vidéo entière avec le projet de John, puis enregistre le résultat (camSuivi) dans un fichier JSON.
   Rien n'est modifié dans le projet de John : on travaille sur une copie dans un dossier temporaire.
   Usage : node scripts/mesure/suivi-reel.js <projet.fsal> <sortie.json> [couleur de lignes : black | yellow | ...]
   Une exécution sur 13 min dure plusieurs dizaines de minutes ; elle ne doit jamais tourner en même temps qu'un autre test Electron. */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { _electron: electron } = require("playwright-core");
const APP = path.join(__dirname, "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const [fsal, sortie, couleur] = process.argv.slice(2);
  if (!fsal || !sortie) { console.error("Usage : node scripts/mesure/suivi-reel.js <projet.fsal> <sortie.json> [couleur]"); process.exit(2); }
  const proj = JSON.parse(fs.readFileSync(fsal, "utf8"));
  if (!proj.videoPath || !fs.existsSync(proj.videoPath)) { console.error("Vidéo introuvable : " + proj.videoPath); process.exit(2); }
  proj.ai = proj.ai || {};
  proj.ai.camSuivi = null;                       // on repart d'un suivi vide
  if (couleur) proj.ai.lineColor = couleur;
  if (process.env.FSAL_MEDIANE) proj.ai.couleursMediane = process.env.FSAL_MEDIANE.split(",");   // ex. yellow,red : autres couleurs de la ligne médiane
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-suivi-reel-"));
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  try {
    const win = await app.firstWindow();
    await win.setViewportSize({ width: 1500, height: 950 });
    win.on("dialog", (d) => d.dismiss().catch(() => {}));
    await win.waitForLoadState("load");
    const t0 = Date.now();
    while (!(await win.evaluate(() => !!(window.FSAI && document.querySelector("video") && document.querySelector("video").readyState >= 1)))) {
      if (Date.now() - t0 > 120000) throw new Error("L'application n'a pas chargé le projet en 120 s");
      await sleep(500);
    }
    let dernier = "";
    for (;;) {
      const s = await win.evaluate(() => ({ txt: document.getElementById("ai-suivi").textContent, fini: !!(window.FSAI.ai() && window.FSAI.ai().camSuivi) }));
      if (s.txt !== dernier) { dernier = s.txt; console.log("[" + Math.round((Date.now() - t0) / 1000) + " s] " + s.txt.slice(0, 160)); }
      if (s.fini) break;
      if (Date.now() - t0 > 3 * 3600 * 1000) throw new Error("Suivi non terminé après 3 h");
      await sleep(5000);
    }
    const cs = await win.evaluate(() => window.FSAI.ai().camSuivi);
    fs.writeFileSync(sortie, JSON.stringify({ couleur: couleur || proj.ai.lineColor || null, duree_s: Math.round((Date.now() - t0) / 1000), r: { frames: cs.frames.map((f) => ({ t: f[0], h: f[1], q: f[2] })), lost: cs.lost, lignes: cs.lignes, t0: cs.t0, t1: cs.t1 } }));
    console.log("OK : " + cs.frames.length + " positions, enregistrées dans " + sortie);
  } finally { await app.close().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error("ÉCHEC : " + e.message); process.exit(1); });
