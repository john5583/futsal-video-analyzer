/* Test de bout en bout : « ＋ Autre exemple » depuis la liste des équipes (étape 2. Joueurs) : consigne visible, navigation, message si la vidéo n'est pas prête, annulation.
   Usage : xvfb-run -a node tests/e2e/autre-exemple-equipes.js   (nécessite ffmpeg, npm i --no-save playwright-core ; FSAL_E2E_VIDEO = vidéo de remplacement) */
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

  const autre = (cat) => win.evaluate((k) => { const c = [...document.querySelectorAll("#ai-kits .ex-cat")].find((x) => x.querySelector(".ex-head b").textContent === k); const b = c && [...c.querySelectorAll("button")].find((x) => x.textContent.includes("Autre exemple")); if (!b) return false; b.click(); return true; }, cat);
  const consigne = () => win.evaluate(() => { const c = document.querySelector("#ai-kits .ex-consigne"); return c ? c.textContent : null; });
  const toast = () => win.evaluate(() => { const t = document.getElementById("toast"); return t && !t.hidden ? t.textContent : ""; });
  must(await waitFor(win, () => document.querySelectorAll("#ai-kits .ex-panel .ex-cat").length === 5, 5000), "liste des équipes : panneau « Mes exemples »");
  must(await win.evaluate(() => !!document.querySelector("#ai-kits .ex-nav")), "la navigation (−10 s, −1 s, +1 s, +10 s, aller à mm:ss) est dans la liste des équipes");

  // 1. vidéo pas prête : un message le dit, aucun mode caché
  await win.evaluate(() => { window.__ready = window.FSApp.isVideoReady; window.FSApp.isVideoReady = () => false; });
  must(await autre("Gardien adverse"), "bouton « Autre exemple » trouvé");
  must(await waitFor(win, () => /pas encore prête/.test(document.getElementById("toast").textContent), 3000), "vidéo pas prête : message affiché (" + (await toast()) + ")");
  must(await consigne() === null, "vidéo pas prête : pas de consigne ni d'attente de clic");
  await win.evaluate(() => { window.FSApp.isVideoReady = window.__ready; });

  // 2. vidéo prête : consigne visible, navigation, retour à l'instant de départ
  await seekTo(3);
  must(await autre("Gardien adverse"), "clic sur « Autre exemple » (Gardien adverse)");
  must(await waitFor(win, () => /Cliquez sur la silhouette de : Gardien adverse/.test((document.querySelector("#ai-kits .ex-consigne") || {}).textContent || ""), 3000), "consigne visible dans la liste : « Cliquez sur la silhouette de : Gardien adverse » (" + (await consigne()) + ")");
  must(/3:00|0:03/.test(await consigne()), "la consigne annonce le retour à l'instant de départ");
  must(await win.evaluate(() => document.getElementById("overlay").classList.contains("pick") && document.querySelector("video").paused), "attente d'un clic sur la vidéo, vidéo en pause");
  must(/Cliquez sur la silhouette de : Gardien adverse/.test(await toast()), "message visible (" + (await toast()) + ")");
  await clickIn("#ai-kits .ex-nav button", "+1 s", "#ai-kits");
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 4) < 0.15, 5000), "navigation « +1 s » : la vidéo avance à 4 s");
  await clickIn("#ai-kits .ex-nav button", "−1 s", "#ai-kits");
  await clickIn("#ai-kits .ex-nav button", "−1 s", "#ai-kits");
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 2) < 0.15, 5000), "navigation « −1 s » : la vidéo recule à 2 s");
  must(await consigne() !== null, "la consigne reste affichée après la navigation");
  await win.evaluate(() => { const i = document.querySelector("#ai-kits .ex-nav input"); i.value = "0:05"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); });
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 5) < 0.15, 5000), "« aller à » 0:05 : la vidéo se place à 5 s");

  // 3. annuler : retour là où on était, plus d'attente de clic
  await clickIn("#ai-kits .ex-consigne button", "Annuler", "#ai-kits");
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 3) < 0.15 && !document.getElementById("overlay").classList.contains("pick"), 5000), "annulation : retour à 3 s, plus d'attente de clic");
  must(await consigne() === null, "annulation : la consigne disparaît");

  // 4. Échap annule aussi
  await seekTo(2);
  await autre("Mon équipe");
  must(await waitFor(win, () => !!document.querySelector("#ai-kits .ex-consigne"), 3000), "« Autre exemple » (Mon équipe) : consigne affichée");
  await win.keyboard.press("Escape");
  must(await waitFor(win, () => !document.querySelector("#ai-kits .ex-consigne") && Math.abs(document.querySelector("video").currentTime - 2) < 0.15, 5000), "Échap : consigne retirée, retour à 2 s");

  // 5. « Aller à un instant … » : deux clics = deux instants différents, jamais le même d'affilée, avec la raison affichée
  const instant = async () => {
    await win.evaluate(() => { const c = [...document.querySelectorAll("#ai-kits .ex-cat")].find((x) => x.querySelector(".ex-head b").textContent === "Mon équipe"); const b = [...c.querySelectorAll("button")].find((x) => /Aller à un instant/.test(x.textContent)); b.click(); });
    await sleep(900);
    return win.evaluate(() => ({ t: document.querySelector("video").currentTime, msg: document.querySelector("#ai-kits .ex-msg").textContent }));
  };
  must(await win.evaluate(() => [...document.querySelectorAll("#ai-kits .ex-cat")].some((x) => x.querySelector(".ex-head b").textContent === "Mon équipe" && [...x.querySelectorAll("button")].some((b) => /Aller à un instant/.test(b.textContent)))), "bouton « Aller à un instant … » présent pour « Mon équipe »");
  const vus = [];
  for (let i = 0; i < 4; i++) vus.push(await instant());
  must(vus.every((v, i) => i === 0 || Math.abs(v.t - vus[i - 1].t) > 0.3), "jamais deux fois le même instant d'affilée (" + vus.map((v) => v.t.toFixed(1)).join(", ") + ")");
  must(new Set(vus.map((v) => Math.round(v.t))).size >= 2, "les clics successifs proposent des instants différents");
  must(vus.every((v) => /Mon équipe : [0-9]+:[0-9][0-9] — /.test(v.msg)), "l'instant choisi et la raison sont affichés (" + vus.map((v) => v.msg.slice(0, 40)).join(" / ") + ")");

  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_E2E_VIDEO) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
