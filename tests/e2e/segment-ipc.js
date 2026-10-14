/* Test de bout en bout (CI Linux, xvfb) : l'application démarre et le vrai modèle de découpe répond via main.js -> fil de calcul -> interface.
   Usage : xvfb-run -a node tests/e2e/segment-ipc.js   (nécessite : npm ci, node scripts/get-assets.js, npm i --no-save playwright-core) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { _electron: electron } = require("playwright-core");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };

(async () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-e2e-"));
  const app = await electron.launch({ executablePath: path.join(APP, "node_modules", "electron", "dist", "electron"), args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  await win.waitForLoadState("load");
  await win.waitForFunction(() => window.FSAI && window.FSWiz, null, { timeout: 15000 });
  must(await win.isVisible(".wiz-start"), "le bouton « Analyser une vidéo » est affiché");
  const st = await win.evaluate(() => window.fsal.aiStatus());
  must(st.modelPresent && st.samPresent && !st.engineError, "modèles présents et moteur démarré " + JSON.stringify(st));
  // image synthétique : fond gris, « joueur » = ellipse blanche + tête
  const res = await win.evaluate(async () => {
    const w = 1024, h = 768, c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    x.fillStyle = "#6b7a55"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#c33"; x.beginPath(); x.ellipse(500, 420, 70, 170, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#e9c9a6"; x.beginPath(); x.arc(500, 220, 38, 0, Math.PI * 2); x.fill();
    const img = x.getImageData(0, 0, w, h);
    const box = [420, 180, 580, 600];
    const t0 = performance.now();
    const r = await window.fsal.aiSegment({ imgId: "e2e1", width: w, height: h, buffer: img.data.buffer.slice(0), boxes: [box] });
    const t1 = performance.now();
    // 2e appel sans renvoyer l'image (embedding mis en cache dans le fil de calcul)
    const r2 = await window.fsal.aiSegment({ imgId: "e2e1", width: w, height: h, boxes: [box, [430, 190, 570, 590]] });
    return { r: r.error || { n: r.masks.length, area: r.masks[0].area, w: r.masks[0].w, h: r.masks[0].h, isU8: r.masks[0].data instanceof Uint8Array || Array.isArray(r.masks[0].data) || (r.masks[0].data && r.masks[0].data.length > 0) }, r2: r2.error || r2.masks.map((m) => m.area), ms: Math.round(t1 - t0) };
  });
  console.log(JSON.stringify(res));
  must(typeof res.r === "object" && res.r.n === 1, "découpe d'une personne via l'IPC");
  const expected = Math.PI * 70 * 170 + Math.PI * 38 * 38;
  must(res.r.area > expected * 0.6 && res.r.area < expected * 1.4, "aire de la silhouette plausible (" + res.r.area + " pour ≈" + Math.round(expected) + ")");
  must(res.r.isU8, "les données du masque arrivent dans l'interface");
  must(Array.isArray(res.r2) && res.r2.length === 2 && res.r2.every((a) => a > 1000), "2e appel sans renvoyer l'image (cache) : " + JSON.stringify(res.r2));
  // erreur propre si l'image n'a jamais été encodée
  const bad = await win.evaluate(async () => (await window.fsal.aiSegment({ imgId: "inconnue", width: 1024, height: 768, boxes: [[10, 10, 100, 100]] })).error || "");
  must(/encod/i.test(bad), "erreur claire si l'image n'est pas encodée : " + bad);
  // réglage avancé « tirets jaunes » : coché par défaut, décoché = enregistré dans le projet (ballon jaune)
  const marks = await win.evaluate(() => {
    document.querySelectorAll("#pane-ai details").forEach((d) => { d.open = true; });
    const cb = document.getElementById("ai-marks"), before = cb.checked;
    cb.click();
    const s = window.FSAI.ai().settings || {};
    return { before, after: cb.checked, saved: s.floorMarks };
  });
  must(marks.before === true && marks.after === false && marks.saved === false, "filtre des tirets jaunes désactivable et enregistré " + JSON.stringify(marks));
  must(errors.length === 0, "aucune erreur dans l'interface " + JSON.stringify(errors));
  await app.close();
})().catch((e) => { console.error("ÉCHEC : " + (e.stack || e.message)); process.exit(1); });
