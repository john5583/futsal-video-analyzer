/* Test de bout en bout : exemples d'identification accumulés par projet (liste datée, suppression, indicateurs, demande d'un autre exemple
   à un autre instant, retour au déroulé, contradiction, marques du banc à plusieurs instants, ancien projet relu sans erreur).
   Usage : xvfb-run -a node tests/e2e/exemples.js   (nécessite ffmpeg, npm i --no-save playwright-core ; FSAL_E2E_VIDEO = vidéo de remplacement) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { _electron: electron } = require("playwright-core");
const CF = require("../../src/ai/court-fit");
const HG = require("../../src/ai/homography");
const P = require("../../src/ai/pipeline");
const K = require("../../src/ai/kit");
const { POSE } = require("../helpers/make-video");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg)) return true; await sleep(250); } return false; }

const L = 40, W = 20, VW = 960, VH = 540;
const project = (x, y) => { const B = CF.cameraBasis(POSE), f = CF.focalPx(VW, POSE[5]), q = CF.project(B, f, VW, VH, x, y, 0); return q ? [q.u / VW, q.v / VH] : null; };
const box = (x, y) => { const p = project(x, y); return [Math.round((p[0] - 0.025) * 1000), Math.round((p[1] - 0.16) * 1000), Math.round((p[0] + 0.025) * 1000), Math.round(p[1] * 1000)]; };
const feat = (rgb) => K.fromParts(K.rgbToLab(...rgb), null, null, null);

function makeFrames() {
  const court = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13], [9, 16], [26, 5]];
  const h = HG.solve(court.map(([x, y]) => project(x, y)), court).map((v) => Number(v.toPrecision(7))), frames = [];
  const pos = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13]];
  for (let i = 0; i <= 40; i++) {
    const t = Math.round(i * 0.2 * 100) / 100;
    const players = pos.map(([x, y], k) => ({ id: k + 1, team: k < 4 ? "A" : "B", x, y, b: box(x, y) }));
    if (Math.abs(t - 1) < 0.01 || Math.abs(t - 4) < 0.01) players.push({ id: 20, team: "GKB", x: 15, y: 18, b: box(15, 18) });      // le gardien adverse est vu à 1 s et à 4 s
    frames.push({ t, players, ball: { x: 14, y: 9 }, h });
  }
  return frames;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-ex-"));
  let video = path.join(dir, "essai.mp4");
  if (process.env.FSAL_E2E_VIDEO) video = process.env.FSAL_E2E_VIDEO;
  else execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  // ancien projet : échantillons sans instant ni numéro
  const ai = {
    L, W, dir: 1, flip: true, camera: "mobile", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }],
    kits: { A: [feat([30, 70, 200]), feat([35, 75, 205])], B: [feat([200, 40, 40])] }, frames: P.compactFrames(makeFrames()), lost: [], stats: null,
    suggestedEvents: [], settings: { fps: 5, tiles: 1, t0: 0, t1: 8, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai exemples", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai().frames && window.FSAI.ai().frames.length > 20 && document.querySelector("video").readyState >= 1, 30000), "projet chargé");
  const seekTo = async (t) => { await win.evaluate((x) => { const v = document.querySelector("video"); v.pause(); window.FSApp.seek(x); }, t); await waitFor(win, (x) => Math.abs(document.querySelector("video").currentTime - x) < 0.1 && !document.querySelector("video").seeking, 8000, t); await sleep(300); };
  const catText = (key) => win.evaluate((k) => { const c = [...document.querySelectorAll("#wiz-ex .ex-cat, #ai-kits .ex-cat")].find((x) => x.querySelector(".ex-head b") && x.querySelector(".ex-head b").textContent === k); return c ? c.textContent : null; }, key);
  const clickIn = (sel, txt, scope) => win.evaluate(([s, t, sc]) => { const root = document.querySelector(sc) || document; const b = [...root.querySelectorAll(s)].find((x) => !t || x.textContent.includes(t)); if (!b) return false; b.click(); return true; }, [sel, txt, scope || "body"]);

  // 1. ancien projet relu sans erreur : tenues utilisables, instants « inconnus », indicateurs
  must(await win.evaluate(() => { const r = window.FSAI.refs(); return !!(r.A && r.B); }), "ancien projet (échantillons sans instant) : tenues relues");
  must(await waitFor(win, () => document.querySelectorAll("#ai-kits .ex-panel .ex-cat").length === 5, 5000), "panneau « Mes exemples » : les 5 catégories");
  const tA = await catText("Mon équipe");
  must(/instant inconnu/.test(tA) && /il en faut plus/.test(tA), "Mon équipe : instants inconnus, « il en faut plus » (" + (tA || "").slice(0, 120) + ")");
  must(/facultatif/.test(await catText("Gardien adverse")), "Arbitre : facultatif tant qu'aucun exemple");

  // 2. supprimer un exemple
  must(await clickIn("#ai-kits .ex-cat button", "✕", "#ai-kits") && await waitFor(win, () => window.FSAI.ai().kits.A.length === 1, 4000), "suppression d'un exemple : il en reste un");
  await win.evaluate(() => { const a = window.FSAI.ai(); a.kits.A.push(JSON.parse(JSON.stringify(a.kits.A[0]))); a.kits.A[1].id = undefined; window.FSAI.renderKits(); });

  // 3. l'assistant, étape Analyse : le panneau est là, l'analyse n'est jamais bloquée
  await win.evaluate(() => window.FSWiz.actions.moreExamples());
  must(await waitFor(win, () => window.FSWiz.state.step === "run" && !!document.querySelector("#wiz-ex .ex-panel"), 6000), "étape Analyse : panneau « Mes exemples »");
  must(await win.evaluate(() => !!document.querySelector(".wiz-exd[open]")), "panneau ouvert car des catégories sont à compléter");
  must(await win.evaluate(() => { const b = document.querySelector("[data-act=run]"); return !!b && !b.disabled; }), "le bouton « Lancer l'analyse » n'est jamais bloqué par le manque d'exemples");

  // 4. « ＋ Autre exemple » pour l'arbitre, à un autre instant, puis retour à l'étape Analyse
  await seekTo(2.0);
  must(await win.evaluate(() => { const c = [...document.querySelectorAll("#wiz-ex .ex-cat")].find((x) => x.querySelector(".ex-head b").textContent === "Gardien adverse"); const b = [...c.querySelectorAll("button")].find((x) => x.textContent.includes("Autre exemple")); b.click(); return true; }), "bouton « ＋ Autre exemple » de l'arbitre");
  must(await waitFor(win, () => window.FSWiz.state.step === "players" && window.FSWiz.state.catIdx === 3 && !!window.FSWiz.state.ret, 4000), "retour mémorisé, étape Joueurs sur l'arbitre");
  await win.evaluate(() => {
    window.FSAI.detectPersons = async () => [{ x1: 300, y1: 150, x2: 400, y2: 440, score: 0.9, cls: 0 }, { x1: 600, y1: 140, x2: 700, y2: 430, score: 0.9, cls: 0 }];
    window.FSAI.segmentImpl = async (req) => ({ masks: req.boxes.map((b) => { const x0 = Math.floor(b[0]), y0 = Math.floor(b[1]), w = Math.max(1, Math.ceil(b[2] - b[0])), h = Math.max(1, Math.ceil(b[3] - b[1])); const data = new Uint8Array(w * h); let area = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2); if (dx * dx + dy * dy <= 1) { data[y * w + x] = 1; area++; } } return { x0, y0, w, h, area, data, iou: 0.95, stab: 0.95 }; }) });
  });
  await win.click("[data-act=detect]");
  must(await waitFor(win, () => window.FSWiz.state.det && window.FSWiz.state.det.players.length === 2, 15000), "silhouettes découpées à 2,0 s");
  const at = (i) => win.evaluate((k) => { const d = window.FSWiz.state.det, p = d.players[k], f = d.frame.k, c = document.getElementById("overlay"), r = c.getBoundingClientRect(), v = document.querySelector("video"), s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight), ox = (r.width - v.videoWidth * s) / 2, oy = (r.height - v.videoHeight * s) / 2; return { x: r.left + ox + (((p.box[0] + p.box[2]) / 2) / f) * s, y: r.top + oy + (((p.box[1] + p.box[3]) / 2) / f) * s }; }, i);
  let q = await at(0); await win.mouse.click(q.x, q.y); await sleep(200);
  must(await win.evaluate(() => window.FSWiz.state.det.players[0].cat === "GKB"), "clic sur la silhouette : choisie pour le gardien adverse");
  await win.click("[data-act=validateCat]"); await sleep(300);
  must(await win.evaluate(() => window.FSWiz.state.step === "run" && !window.FSWiz.state.ret), "après la validation : retour à l'étape Analyse (déroulé inchangé)");
  const ex = await win.evaluate(() => window.FSAI.ai().kits.GKB);
  must(ex && ex.length === 1 && Math.abs(ex[0].t - 2) < 0.2 && ex[0].src === "silhouette" && !!ex[0].id && !!ex[0].v, "l'exemple garde son instant (2,0 s), sa source, sa vidéo et un numéro");
  const tR = await catText("Gardien adverse");
  must(/0:02/.test(tR) && /il en faut plus/.test(tR) && /Je n'ai vu le gardien adverse qu'une fois/.test(tR), "Arbitre : exemple daté, « il en faut plus », demande d'un autre moment");

  // 5. le bouton mène à un instant où l'arbitre est probablement visible (l'analyse l'a vu à 1 s et à 4 s)
  must(await win.evaluate(() => { const c = [...document.querySelectorAll("#wiz-ex .ex-cat")].find((x) => x.querySelector(".ex-head b").textContent === "Gardien adverse"); const b = [...c.querySelectorAll("button")].find((x) => /Aller à un instant (probable|éloigné)/.test(x.textContent)); if (!b) return false; b.click(); return true; }), "bouton « Aller à un instant … » de l'arbitre");
  const court = await win.evaluate(() => document.querySelector("video").duration) <= 7;     // vidéo d'essai de 6 s : l'analyse a vu l'arbitre à 1 s et à 4 s, on attend 4 s
  must(await waitFor(win, (c) => (c ? Math.abs(document.querySelector("video").currentTime - 4) < 0.3 : Math.abs(document.querySelector("video").currentTime - 2) > 1), 8000, court), "la vidéo est placée à un autre instant que l'exemple déjà donné");

  // 6. navigation dans la vidéo depuis le panneau
  const t0 = await win.evaluate(() => document.querySelector("video").currentTime);
  await clickIn("#wiz-ex .ex-nav button", "−1 s", "#wiz-ex");
  must(await waitFor(win, (a) => Math.abs(document.querySelector("video").currentTime - (a - 1)) < 0.2, 6000, t0), "bouton « −1 s » : la vidéo recule");

  // 7. contradiction : la même tenue donnée à deux équipes
  await win.evaluate(() => { const a = window.FSAI.ai(); a.kits.B.push(JSON.parse(JSON.stringify(a.kits.A[0]))); a.kits.B[a.kits.B.length - 1].t = 70; a.kits.B[a.kits.B.length - 1].id = "x1"; window.FSAI.renderKits(); window.FSWiz.render(); });
  must(await waitFor(win, () => /presque identique/.test(document.getElementById("wiz-ex").textContent), 4000), "alerte : même tenue donnée à deux équipes");

  // 8. banc marqué à plusieurs instants, avec contrôle de cohérence
  const clickCourt = async (x, y) => { const p = project(x, y); const pos = await win.evaluate(([u, v]) => { const c = document.getElementById("overlay"), r = c.getBoundingClientRect(), vid = document.querySelector("video"), s = Math.min(r.width / vid.videoWidth, r.height / vid.videoHeight), ox = (r.width - vid.videoWidth * s) / 2, oy = (r.height - vid.videoHeight * s) / 2; return { x: r.left + ox + u * vid.videoWidth * s, y: r.top + oy + v * vid.videoHeight * s }; }, p); await win.mouse.click(pos.x, pos.y); await sleep(200); };
  const markBench = async (t, x1, y1, x2, y2) => {
    await seekTo(t);
    await clickIn("#wiz-ex button", "Marquer le banc", "#wiz-ex");
    await clickCourt(x1, y1); await clickCourt(x2, y2);
  };
  await markBench(1.0, 10, 2, 14, 4);
  must(await waitFor(win, () => (window.FSAI.ai().benchZones || []).length === 1, 4000), "banc : première marque");
  must(await win.evaluate(() => { const z = window.FSAI.ai().benchZones[0]; return Math.abs(z.t - 1) < 0.3 && !!z.id && !!z.v; }), "la marque garde son instant, sa vidéo et un numéro");
  must(await waitFor(win, () => /Le banc n'est marqué qu'à un instant/.test(document.getElementById("wiz-ex").textContent), 4000), "banc marqué une seule fois avec une caméra mobile : demande d'une autre marque");
  await markBench(3.0, 10, 2, 14, 4);
  must(await waitFor(win, () => (window.FSAI.ai().benchZones || []).length === 2, 4000), "banc : deuxième marque à un autre instant");
  must(!/ne s'accordent pas/.test(await win.evaluate(() => document.getElementById("wiz-ex").textContent)), "deux marques qui s'accordent : aucune alerte");
  await markBench(4.0, 8, 2, 12, 4);
  must(await waitFor(win, () => /ne s'accordent pas/.test(document.getElementById("wiz-ex").textContent), 4000), "marque décalée de 2 m : alerte de cohérence");

  // 9. la mémoire reste dans le projet : enregistrer, recharger, tout est relu sans erreur
  const saved = await win.evaluate(() => JSON.parse(JSON.stringify(window.FSApp.state.project)));
  must(saved.ai.kits.GKB[0].t != null && saved.ai.benchZones.length === 3, "les exemples et les marques sont dans le fichier du projet");
  await win.evaluate(async (p) => { await window.FSApp.loadProject(p, null); }, saved);
  must(await waitFor(win, () => !!window.FSAI.refs().GKB && window.FSAI.ai().benchZones.length === 3, 8000), "projet rechargé : exemples et marques relus");
  await win.evaluate(() => window.FSWiz.actions.moreExamples());
  must(await waitFor(win, () => !!document.querySelector("#ai-kits .ex-panel"), 4000), "panneau toujours affiché après rechargement");

  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_E2E_VIDEO) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
