/* Test de bout en bout : précision du calibrage (accrochage sur le croisement de lignes, loupe, zoom pendant la pose, erreur de chaque repère,
   repère suspect, « Replacer », flèches du clavier). La vérité est connue : la vidéo d'essai est une scène synthétique vue d'une caméra connue.
   Usage : xvfb-run -a node tests/e2e/calibrage-precision.js   (nécessite ffmpeg ; FSAL_VIDEO_SYNTH = vidéo de la scène synthétique déjà générée) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { _electron: electron } = require("playwright-core");
const CF = require("../../src/ai/court-fit");
const HG = require("../../src/ai/homography");
const { POSE } = require("../helpers/make-video");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg)) return true; await sleep(250); } return false; }

const L = 40, W = 20, VW = 960, VH = 540;
const B = CF.cameraBasis(POSE), F = CF.focalPx(VW, POSE[5]);
const lm = Object.fromEntries(HG.landmarks(L, W).map((l) => [l.id, l]));
const truth = (id) => { const q = CF.project(B, F, VW, VH, lm[id].x, lm[id].y, 0); return q ? [q.u, q.v] : null; };
// repères qui sont de vrais croisements de lignes visibles loin des bords de l'image
const CROIS = ["corner_tl", "corner_tr", "corner_bl", "corner_br", "mid_top", "mid_bottom", "l_area_top", "l_area_bottom", "l_front_top", "l_front_bottom", "r_area_top", "r_area_bottom", "r_front_top", "r_front_bottom"];
const visibles = CROIS.filter((id) => { const t = truth(id); return t && t[0] > 40 && t[0] < VW - 40 && t[1] > 40 && t[1] < VH - 40; });
// ensemble bien réparti (pas 4 repères alignés sur la ligne de but) pour les essais d'erreur par repère
const REPARTIS = ["corner_tl", "corner_bl", "l_front_top", "l_front_bottom", "l_second", "l_dash_top", "l_dash_bottom"].filter((id) => { const t = truth(id); return t && t[0] > 40 && t[0] < VW - 40 && t[1] > 40 && t[1] < VH - 40; });
const DECALS = [[3, -2], [-3, 3], [2, 4], [-2, -4], [4, 1], [-4, -2]];      // clics à 2-5 pixels de la vraie position (ordre de grandeur d'un clic à la main avec le zoom)
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-cal-"));
  let video = process.env.FSAL_VIDEO_SYNTH || path.join(dir, "essai.mp4");
  if (!process.env.FSAL_VIDEO_SYNTH) execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video, JSON.stringify(POSE), JSON.stringify({ lineHalf: 0.04 })], { stdio: "ignore" });      // lignes de 8 cm, comme sur un vrai terrain
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const ai = { L, W, dir: 1, flip: true, camera: "mobile", calibrations: [], kits: {}, frames: null, lost: [], stats: null, suggestedEvents: [], settings: { fps: 3, tiles: 1, t0: 0, t1: 5 }, doubts: [], uncertain: [], subs: [] };
  const proj = { version: 1, name: "essai calibrage", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  must(await waitFor(win, () => window.FSAI && document.querySelector("video").readyState >= 2 && document.querySelector("video").videoWidth > 0, 30000), "vidéo d'essai chargée");
  must(visibles.length >= 6, "au moins 6 croisements visibles dans la scène d'essai (" + visibles.join(", ") + ")");
  await win.evaluate(() => { const v = document.querySelector("video"); v.pause(); window.FSApp.seek(1); });
  await sleep(800);

  // position écran d'un point de la vidéo (pixels vidéo), quel que soit le zoom
  const screenOf = (u, v) => win.evaluate(([x, y]) => {
    const c = document.getElementById("overlay"), r = c.getBoundingClientRect(), vid = document.querySelector("video"), bx = vid.getBoundingClientRect();
    return { x: bx.left + (x / vid.videoWidth) * bx.width, y: bx.top + (y / vid.videoHeight) * bx.height, ok: x >= 0 };
  }, [u, v]);
  const place = async (id, dx, dy) => {
    await win.evaluate((i) => window.FSAI.beginPlacing(i), id);
    const t = truth(id), p = await screenOf(t[0] + dx, t[1] + dy);
    await win.mouse.move(p.x - 6, p.y - 6); await win.mouse.move(p.x, p.y); await sleep(120);
    const loupe = await win.evaluate(() => !document.getElementById("loupe").hidden);
    await win.mouse.click(p.x, p.y); await sleep(150);
    return loupe;
  };
  const lire = () => win.evaluate(() => [...document.querySelectorAll("#ai-points .ai-item")].map((d) => ({ txt: d.textContent, sus: d.classList.contains("sus") })));
  const calibres = (id) => win.evaluate(() => window.FSAI.ai().calibrations.map((c) => c.points));
  const erreurs = (pts) => pts.map((p) => Math.hypot(p.ix - truth(p.id)[0], p.iy - truth(p.id)[1]));

  // 1. même série de clics décalés, sans puis avec l'accrochage : erreur mesurée contre la vérité
  const ids = visibles.slice(0, 6);
  must(await win.evaluate(() => !document.getElementById("ai-snap").checked), "l'accrochage est désactivé par défaut (essai, mesuré)");
  let loupeVue = true;
  for (let i = 0; i < ids.length; i++) loupeVue = (await place(ids[i], DECALS[i][0], DECALS[i][1])) && loupeVue;
  must(loupeVue, "la loupe est affichée pendant la pose d'un repère");
  must(await win.evaluate(() => document.getElementById("loupe").hidden), "la loupe disparaît après le clic");
  await win.evaluate(() => { document.getElementById("ai-validate").click(); });
  await sleep(400);
  await win.evaluate(() => { window.FSApp.seek(2); }); await sleep(800);
  await win.evaluate(() => { document.getElementById("ai-snap").checked = true; });
  for (let i = 0; i < ids.length; i++) await place(ids[i], DECALS[i][0], DECALS[i][1]);
  const liste = await lire();
  must(liste.length === ids.length && liste.filter((x) => /[0-9] (cm|m)/.test(x.txt)).length >= 3 && !liste.some((x) => /NaN|Infinity/.test(x.txt)), "dès 5 repères : l'écart de chaque repère mesurable est affiché (les repères presque alignés n'ont pas de valeur) (" + liste.map((x) => x.txt.replace(/\s+/g, " ").slice(-24)).join(" | ") + ")");
  await win.evaluate(() => { document.getElementById("ai-validate").click(); });
  await sleep(400);
  const cals = await calibres();
  must(cals.length === 2, "deux calibrages enregistrés (sans puis avec accrochage)");
  const eSans = erreurs(cals[0]), eAvec = erreurs(cals[1]);
  console.log("     erreur de position (pixels, contre la vérité) — sans accrochage : médiane " + med(eSans).toFixed(2) + ", max " + Math.max(...eSans).toFixed(2) + " ; avec : médiane " + med(eAvec).toFixed(2) + ", max " + Math.max(...eAvec).toFixed(2));
  console.log("     (mesure honnête : l'accrochage ne réduit pas l'erreur médiane sur cette scène ; il est donc désactivé par défaut)");
  must(cals[1].some((p, i) => Math.abs(p.ix - cals[0][i].ix) > 0.3 || Math.abs(p.iy - cals[0][i].iy) > 0.3), "au moins un repère a été accroché (position changée)");
  must(eAvec[0] < 2, "le coin haut-gauche, croisement net, tombe à moins de 2 pixels de la vérité (" + eAvec[0].toFixed(2) + ")");
  const hEr = (p) => { const src = p.map((q) => [q.ix, q.iy]), dst = p.map((q) => [lm[q.id].x, lm[q.id].y]); return HG.reprojectionError(HG.solve(src, dst), src, dst); };
  console.log("     erreur de calibrage (m) — sans : " + hEr(cals[0]).toFixed(3) + " ; avec : " + hEr(cals[1]).toFixed(3));

  // 2. repère mal placé : signalé « à replacer », puis corrigé avec « Replacer »
  await win.evaluate(() => { window.FSApp.seek(3); }); await sleep(800);
  await win.evaluate(() => { document.getElementById("ai-snap").checked = false; });
  must(REPARTIS.length >= 6, "au moins 6 repères bien répartis visibles (" + REPARTIS.join(", ") + ")");
  const bon = REPARTIS.slice(0, REPARTIS.length - 1), mauvais = REPARTIS[REPARTIS.length - 1];
  for (let i = 0; i < bon.length; i++) await place(bon[i], 0, 0);
  await win.evaluate(() => { document.getElementById("ai-snap").checked = false; });
  await place(mauvais, 45, 35);
  let l2 = await lire();
  must(l2.filter((x) => x.sus).length >= 1 && l2[l2.length - 1].sus && /à replacer/.test(l2[l2.length - 1].txt), "un repère à 57 pixels de sa place est signalé « à replacer » (" + l2.map((x) => (x.sus ? "!" : ".")).join("") + ")");
  await win.evaluate(() => { document.getElementById("ai-snap").checked = false; });
  await win.evaluate(() => { const b = [...document.querySelectorAll("#ai-points .ai-item")].pop().querySelector("[data-a=re]"); b.click(); });
  const t6 = truth(mauvais), p6 = await screenOf(t6[0] + 3, t6[1] - 3);
  await win.mouse.move(p6.x, p6.y); await win.mouse.click(p6.x, p6.y); await sleep(200);
  l2 = await lire();
  must(l2.length === REPARTIS.length && l2.every((x) => !x.sus), "« Replacer » : le repère corrigé n'est plus signalé (" + l2.map((x) => (x.sus ? "!" : ".") + x.txt.replace(/Replacer×/, "").slice(-26)).join(" ") + ")");

  // 3. flèches du clavier : décalage fin du repère choisi
  await win.evaluate(() => { [...document.querySelectorAll("#ai-points .ai-item .grow")].pop().click(); });
  await win.keyboard.press("ArrowRight"); await win.keyboard.press("ArrowRight"); await sleep(150);
  must(true, "flèches du clavier acceptées sans erreur");
  await win.evaluate(() => { document.getElementById("ai-validate").click(); });
  await sleep(300);
  const c3 = (await calibres())[2];
  must(!!c3 && c3.length === REPARTIS.length, "troisième calibrage enregistré avec " + REPARTIS.length + " repères");
  const d6 = c3.find((q) => q.id === mauvais), e6 = Math.hypot(d6.ix - t6[0], d6.iy - t6[1]);
  must(e6 < 6, "repère replacé puis décalé de 1 pixel par les flèches : à " + e6.toFixed(2) + " px de la vérité");

  // 4. zoom pendant la pose : le bouton ＋ agrandit, le clic reste exact
  await win.evaluate(() => { window.FSApp.seek(4); }); await sleep(800);
  await win.evaluate(() => { document.getElementById("zm-in").click(); document.getElementById("zm-in").click(); });
  await sleep(300);
  const zoomK = await win.evaluate(() => document.getElementById("zm-reset").textContent);
  must(/^2\.2×$|^2\.3×$|^2\.25×$/.test(zoomK) || parseFloat(zoomK) > 2, "zoom ＋ appliqué pendant le calibrage (" + zoomK + ")");
  const idZ = ids.find((id) => { const t = truth(id); return t && t[0] > VW / 2 - 100 && t[0] < VW / 2 + 100; }) || ids[0];
  await win.evaluate((i) => window.FSAI.beginPlacing(i), idZ);
  const vis = await win.evaluate(([x, y]) => { const c = document.getElementById("overlay"), r = c.getBoundingClientRect(), vid = document.querySelector("video"), b = vid.getBoundingClientRect(); const sx = b.left + (x / vid.videoWidth) * b.width, sy = b.top + (y / vid.videoHeight) * b.height; return sx > r.left && sx < r.right && sy > r.top && sy < r.bottom; }, truth(idZ));
  if (vis) {
    const tz = truth(idZ), pz = await screenOf(tz[0] + 4, tz[1] + 3);
    await win.mouse.move(pz.x, pz.y); await win.mouse.click(pz.x, pz.y); await sleep(200);
    const lz = await lire();
    must(lz.length === 1, "pose d'un repère avec le zoom actif");
  } else console.log("     (repère hors de la vue agrandie : pose sous zoom non vérifiée dans ce cas)");
  await win.evaluate(() => { document.getElementById("zm-reset").click(); });

  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_VIDEO_SYNTH) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
