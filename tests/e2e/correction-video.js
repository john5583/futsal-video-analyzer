/* Test de bout en bout : correction animée sur la vraie vidéo.
   Vidéo d'essai + projet synthétique cohérent (joueurs, boîtes, projection de chaque image, passage où la caméra est perdue).
   Vérifie : dessins sur l'image, écran de repli sans dessin (caméra perdue), mode Séquencé, petite carte déplaçable,
   comportement inchangé sans erreur confirmée / sans analyse, aucune erreur dans l'interface.
   Usage : xvfb-run -a node tests/e2e/correction-video.js   (nécessite ffmpeg, npm i --no-save playwright-core) */
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

function project(x, y) {
  const B = CF.cameraBasis(POSE), f = CF.focalPx(VW, POSE[5]);
  const q = CF.project(B, f, VW, VH, x, y, 0);
  return q ? [q.u, q.v] : null;
}

/* Images analysées synthétiques : 4 joueurs A, 4 joueurs B, ballon ; boîtes et projection (image -> terrain) cohérentes. */
function makeFrames() {
  const court = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13], [9, 16], [26, 5]];
  const corners = court.map(([x, y]) => [x, y]), pix = corners.map(([x, y]) => { const p = project(x, y); return [p[0] / VW, p[1] / VH]; });
  const hImgToCourt = HG.solve(pix, corners);   // image normalisée -> terrain
  const frames = [];
  for (let i = 0; i <= 29; i++) {
    const t = Math.round(i * 0.2 * 100) / 100;
    if (t >= 3.0 && t <= 3.6) continue;          // caméra perdue : pas d'image analysée
    const pos = [[10 + i * 0.1, 8], [12, 12 + i * 0.05], [15, 6], [18 - i * 0.05, 11], [11 + i * 0.12, 9], [14, 14], [20, 7], [22, 12]];
    const players = pos.map(([x, y], k) => {
      const p = project(x, y), u = p[0] / VW, v = p[1] / VH, hh = 0.16, ww = 0.05;
      return { id: k + 1, team: k < 4 ? "A" : "B", x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, b: [Math.round((u - ww / 2) * 1000), Math.round((v - hh) * 1000), Math.round((u + ww / 2) * 1000), Math.round(v * 1000)] };
    });
    frames.push({ t, players, ball: { x: pos[0][0] + 0.6, y: pos[0][1] }, h: hImgToCourt.map((v) => Number(v.toPrecision(7))) });
  }
  return frames;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-corr-"));
  const video = path.join(dir, "essai.mp4");
  execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const ev = (id, t, note) => ({ id, t, type: "perte_zone_mediane", zone: "MED", side: "C", outcome: "PERTE", note, auto: true });
  const project = {
    version: 1, name: "essai correction", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: "essai.mp4", secondHalfStart: null, duration: 6,
    events: [ev("e1", 2.0, "perte d'essai"), ev("e2", 3.3, "perte d'essai pendant la caméra perdue")],
    ai: { L, W, dir: 1, flip: true, camera: "fixed", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(makeFrames()), lost: [[3.0, 3.6]], stats: null, suggestedEvents: [], settings: { fps: 5, tiles: 1, t0: 0, t1: 6, tol: 42 } }
  };
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(project));
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai().frames && window.FSAI.ai().frames.length > 20 && window.FSApp.getVideoUrl(), 30000), "projet chargé avec son analyse et sa vidéo");

  // 1. erreur confirmée avec analyse : vraie vidéo + dessins sur l'image
  await win.evaluate(() => window.FSApp.openAnimation("error", "perte_zone_mediane"));
  must(await waitFor(win, () => !document.getElementById("corr-real").hidden && document.getElementById("corr-canvas").hidden, 10000), "la vraie vidéo remplace l'animation vue de dessus");
  must(await waitFor(win, () => document.getElementById("corr-real").dataset.phase === "reveal", 30000), "mode Figé : les dessins apparaissent un par un");
  await sleep(2500);
  const drawn = await win.evaluate(() => { const c = document.getElementById("cr-overlay"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  must(drawn > 800, "dessins collés au sol présents sur l'image (" + drawn + " pixels)");
  must(await waitFor(win, () => document.getElementById("corr-real").dataset.phase === "done", 40000), "correction animée jouée jusqu'au bout");
  const ghost = await win.evaluate(() => document.getElementById("corr-real").dataset.ghost);
  must(/^(ok|repli|trop-petit|trop-proche|coupé|incomplète|floue|vide)$/.test(ghost), "fantôme : découpe ou ellipse de repli (" + ghost + ")");
  const text = await win.evaluate(() => document.getElementById("cr-text").textContent);
  must(/Conseil tiré du catalogue/.test(text), "le texte précise que la correction est un conseil du catalogue");

  // 1b. export de la correction sur la vraie vidéo : GIF puis vidéo (la boîte « Enregistrer sous » est remplacée par un chemin d'essai)
  const outGif = path.join(dir, "sortie.gif"), outVid = path.join(dir, "sortie.bin");
  await app.evaluate(({ shell }) => { shell.showItemInFolder = () => {}; });
  for (const [btn, out, label] of [["#cr-exp-gif", outGif, "GIF"], ["#cr-exp-video", outVid, "vidéo"]]) {
    await app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, out);
    await win.evaluate(() => { document.getElementById("cp-msg").textContent = ""; });
    await win.click(btn);
    must(await waitFor(win, () => /enregistré/.test(document.getElementById("cp-msg").textContent), 120000), "export " + label + " : enregistré");
  }
  const gif = fs.readFileSync(outGif), vid = fs.readFileSync(outVid);
  must(gif.slice(0, 6).toString() === "GIF89a" && gif[gif.length - 1] === 0x3b && gif.length > 5000, "le GIF est un vrai GIF animé (" + gif.length + " octets)");
  let nImg = 0; for (let i = 0; i < gif.length; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4) nImg++;
  must(nImg > 20, "le GIF contient plusieurs images (" + nImg + ")");
  const isMp4 = vid.slice(4, 8).toString() === "ftyp", isWebm = vid[0] === 0x1a && vid[1] === 0x45 && vid[2] === 0xdf && vid[3] === 0xa3;
  must((isMp4 || isWebm) && vid.length > 10000, "la vidéo est un vrai fichier " + (isMp4 ? "MP4" : "WebM") + " (" + vid.length + " octets)");
  if (process.env.E2E_KEEP) { fs.copyFileSync(outGif, path.join(process.env.E2E_KEEP, "sortie.gif")); fs.copyFileSync(outVid, path.join(process.env.E2E_KEEP, "sortie." + (isMp4 ? "mp4" : "webm"))); }
  must(await waitFor(win, () => document.getElementById("corr-real").dataset.phase === "done" || document.getElementById("corr-real").dataset.phase === "correct" || document.getElementById("corr-real").dataset.phase === "reveal", 20000), "la correction reprend après l'export");

  // 2. occurrence dans le passage où la caméra est perdue : image figée SANS dessin, message, plan agrandi
  await win.click("#cr-next");
  must(await waitFor(win, () => /caméra a été perdue/.test(document.getElementById("cr-msg").textContent) && document.getElementById("corr-real").classList.contains("map-big"), 15000), "caméra perdue : message clair et plan agrandi");
  await sleep(2000);
  const drawn2 = await win.evaluate(() => { const c = document.getElementById("cr-overlay"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  must(drawn2 === 0, "aucun dessin sur l'image quand la caméra est perdue");
  must(await win.evaluate(() => getComputedStyle(document.getElementById("cr-video")).visibility !== "hidden"), "l'image réelle reste affichée (figée)");

  // 3. mode Séquencé et petite carte déplaçable
  await win.click("#cr-prev");
  await sleep(800);
  await win.click("#cr-seq");
  must(await waitFor(win, () => document.getElementById("corr-real").dataset.phase === "play", 20000), "mode Séquencé : lecture des secondes réelles autour de l'erreur");
  must(await win.evaluate(() => /automatique/.test(document.getElementById("cr-map-pos").textContent) && document.getElementById("corr-real").dataset.mapMode === "auto"), "petite carte : mode automatique par défaut");
  await win.click("#cr-map-pos"); await win.click("#cr-map-pos");
  must(await win.evaluate(() => document.getElementById("corr-real").classList.contains("map-bl") && /bas gauche/.test(document.getElementById("cr-map-pos").textContent) && document.getElementById("corr-real").dataset.mapMode === "fixed"), "petite carte déplacée en bas à gauche (coin fixe)");
  // déplacement à la main : on saisit la carte et on la dépose en haut à gauche
  const mb = await win.evaluate(() => { const r = document.getElementById("cr-map").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await win.mouse.move(mb.x, mb.y); await win.mouse.down(); await win.mouse.move(mb.x + 60, mb.y - 120, { steps: 8 }); await win.mouse.up();
  must(await win.evaluate(() => /libre/.test(document.getElementById("cr-map-pos").textContent) && document.getElementById("cr-map").style.left !== ""), "petite carte déplacée à la main (position libre)");
  for (let i = 0; i < 1; i++) await win.click("#cr-map-pos");   // libre -> automatique

  // 4. erreur du catalogue sans occurrence confirmée : comportement d'avant (animation vue de dessus)
  await win.evaluate(() => window.FSApp.openAnimation("error", "repli_tardif"));
  must(await waitFor(win, () => document.getElementById("corr-real").hidden && !document.getElementById("corr-canvas").hidden, 10000), "sans erreur confirmée : animation vue de dessus, comme avant");

  // 5. projet sans analyse (ancien projet) : comportement d'avant
  await win.evaluate(() => { window.FSApp.state.project.ai.frames = null; window.FSApp.openAnimation("error", "perte_zone_mediane"); });
  must(await waitFor(win, () => document.getElementById("corr-real").hidden && !document.getElementById("corr-canvas").hidden, 10000), "projet sans analyse : animation vue de dessus, comme avant");

  must(errors.length === 0, "aucune erreur dans l'interface " + JSON.stringify(errors));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + (e.stack || e.message)); process.exit(1); });
