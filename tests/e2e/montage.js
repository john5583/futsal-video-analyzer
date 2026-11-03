/* Test de bout en bout : montage vidéo d'une correction (joueur effacé de la vraie vidéo puis replacé), repli honnête quand il est impossible, export image par image.
   Vidéo et projection synthétiques ; la découpe du joueur est simulée par un rectangle (les vrais masques viennent du modèle MobileSAM, mesurés sur la vraie vidéo à part).
   Usage : xvfb-run -a node tests/e2e/montage.js   (nécessite ffmpeg, npm i --no-save playwright-core) */
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
const box = (x, y) => { const p = project(x, y); if (!p) return [0, 0, 20, 40]; const u = p[0] / VW, v = p[1] / VH; return [Math.round((u - 0.03) * 1000), Math.round((v - 0.22) * 1000), Math.round((u + 0.03) * 1000), Math.round((v + 0.01) * 1000)]; };

/* Les joueurs bougent (sinon le sol derrière eux ne serait jamais vu) : l'équipe A avance, l'adversaire tourne autour du ballon. */
function makeFrames() {
  const court = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13], [9, 16], [26, 5]];
  const pix = court.map(([x, y]) => { const p = project(x, y); return [p[0] / VW, p[1] / VH]; });
  const h = HG.solve(pix, court).map((v) => Number(v.toPrecision(7))), frames = [];
  for (let i = 0; i <= 60; i++) {
    const t = Math.round(i * 0.2 * 100) / 100, k = t;
    const A = [[8 + 0.9 * k, 6 + 0.3 * k], [10 + 0.7 * k, 13 - 0.2 * k], [18 - 0.4 * k, 9 + 0.5 * k], [20 + 0.3 * k, 15 - 0.4 * k]];
    const B = [[26 - 0.5 * k, 8], [26.5 - 0.3 * k, 12 + 0.2 * k], [24 + 0.4 * k, 5 + 0.3 * k], [25 - 0.2 * k, 15 - 0.2 * k]];
    const players = A.map(([x, y], j) => ({ id: j + 1, team: "A", x, y, b: box(x, y) })).concat(B.map(([x, y], j) => ({ id: j + 5, team: "B", x, y, b: box(x, y) })));
    frames.push({ t, players, ball: { x: 26.4 - 0.5 * k, y: 8.1 }, h });
  }
  return frames;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-mont-"));
  const video = path.join(dir, "essai.mp4");
  execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const proj = {
    version: 1, name: "essai montage", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: "essai.mp4", secondHalfStart: null, duration: 6, events: [],
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
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai().frames && window.FSAI.ai().frames.length > 40 && window.FSApp.getVideoUrl() && document.querySelector("video").readyState >= 1 && !!window.FutsalMontageRun, 30000), "projet chargé, montage disponible");
  await win.evaluate(() => window.FSApp.showTab("plan"));

  // une correction qui déplace un joueur : on cherche un type d'erreur qui en donne une sur ces images
  const type = await win.evaluate(() => {
    const A = window.FSAI.ai(), frames = window.FutsalPipeline.expandFrames(A.frames);
    for (const ty of ["plan_pressing", "repli_tardif", "perte_zone_def", "marquage_perdu", "largeur_mal_occupee", "equipe_etiree"]) {
      const ov = window.FutsalOverlay.buildOverlay({ t: 2.2, type: ty, expected: [3, 1], observed: [2, 2] }, frames, { L: 40, W: 20 });
      const g = ov.correction && ov.correction.ghost;
      if (g) { const q = new window.FutsalOverlay.Projector(frames, { lost: [] }).at(3.6).project(g.to[0], g.to[1]); if (q && q[0] > 0.05 && q[0] < 0.95 && q[1] > 0.15 && q[1] < 0.97) return ty; }   // place voulue visible à l'écran
    }
    return null;
  });
  must(!!type, "une correction avec un joueur à déplacer existe sur les images d'essai (" + type + ")");

  const open = (segmentJs, mode) => win.evaluate(async ([TYPE, SEG, MODE]) => {
    const root = document.getElementById("plan-real"); root.hidden = false; root.dataset.mapMode = "auto"; root.classList.add("map-br");
    if (!window.__rv) window.__rv = new window.FutsalRealView.RealView({ root, video: document.getElementById("pl-video"), overlay: document.getElementById("pl-overlay"), map: document.getElementById("pl-map"), msg: document.getElementById("pl-msg") });
    const A = window.FSAI.ai(), frames = window.FutsalPipeline.expandFrames(A.frames);
    const seg = SEG === "rect"
      ? async (r) => ({ masks: r.boxes.map((b) => { const x0 = Math.round(b[0]), y0 = Math.round(b[1]), w = Math.round(b[2] - b[0]), h = Math.round(b[3] - b[1]); return { x0, y0, w, h, data: new Uint8Array(w * h).fill(1) }; }) })
      : async () => ({ error: "modèle absent" });
    await window.__rv.open({ url: window.FSApp.getVideoUrl(), frames, lost: [], L: 40, W: 20, dirAt: null, event: { t: 2.2, type: TYPE, expected: [3, 1], observed: [2, 2] }, mode: MODE, catalogSeq: null, segment: seg });
    return { montage: root.dataset.montage, phase: root.dataset.phase, ghost: root.dataset.ghost, msg: document.getElementById("pl-msg").textContent };
  }, [type, segmentJs, mode]);

  // 1. montage possible : phases révélation puis montage puis arrêt sur l'image corrigée
  const r1 = await open("rect", "fixed");
  must(r1.phase === "reveal" && r1.montage !== "ok", "la vidéo et les dessins s'affichent tout de suite, le montage se prépare en arrière-plan (" + JSON.stringify(r1) + ")");
  const phases = []; const t0 = Date.now();
  while (Date.now() - t0 < 60000) { const p = await win.evaluate(() => document.getElementById("plan-real").dataset.phase); if (!phases.length || phases[phases.length - 1] !== p) phases.push(p); if (p === "done") break; await sleep(120); }
  must(await win.evaluate(() => document.getElementById("plan-real").dataset.montage === "ok"), "le montage est prêt et joué");
  must(phases.indexOf("montage") >= 0 && phases.indexOf("mdone") > phases.indexOf("montage") && phases[phases.length - 1] === "done", "phases : " + phases.join(" > "));
  must(await win.evaluate(() => { const c = document.getElementById("pl-overlay"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 61) if (d[i + 3] > 200) n++; return n > 500; }), "l'image du montage est dessinée sur la vidéo");

  // 2. l'export image par image prend le montage (la vidéo rejouée, pas une image figée)
  const exp = await win.evaluate(async () => {
    const v = window.__rv, info = v.exportInfo(480, 270, 8); if (!info) return { error: "pas d'export" };
    const hashes = new Set(), c = document.createElement("canvas"); let n = 0;
    await v.exportFrames(info, async (canvas, i) => { n++; if (i % 4 === 0) { const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data; let h = 0; for (let k = 0; k < d.length; k += 211) h = (h * 31 + d[k]) % 1000003; hashes.add(h); } });
    return { n, distinct: hashes.size, total: info.total };
  });
  must(!exp.error && exp.n === exp.total && exp.distinct >= 4, "export : " + JSON.stringify(exp));

  // 3. montage impossible (découpe en échec) : la raison est dite et la correction garde le joueur fantôme
  await win.evaluate(() => { window.__rv.monts = new Map(); });
  const r2 = await open("echec", "fixed");
  must(await waitFor(win, () => document.getElementById("plan-real").dataset.montage === "non" && /Montage vidéo indisponible/.test(document.getElementById("pl-msg").textContent), 30000), "repli annoncé après la préparation : " + (await win.evaluate(() => document.getElementById("pl-msg").textContent)).slice(0, 120));
  await sleep(1500);
  must(await win.evaluate(() => /Montage vidéo indisponible/.test(document.getElementById("pl-msg").textContent)), "la raison reste affichée pendant la lecture");

  must(errors.length === 0, "aucune erreur dans l'interface " + JSON.stringify(errors));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + (e.stack || e.message)); process.exit(1); });
