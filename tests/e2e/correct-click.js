/* Test de bout en bout : corriger une personne ou le ballon en un clic sur la vidéo (menu, réponse retenue, annulation dans « Mes réponses »),
   et proposition du même gardien (jambes sans peau). Usage : xvfb-run -a node tests/e2e/correct-click.js (nécessite ffmpeg, playwright-core) */
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
const box = (x, y) => { const p = project(x, y), u = p[0] / VW, v = p[1] / VH; return [Math.round((u - 0.025) * 1000), Math.round((v - 0.16) * 1000), Math.round((u + 0.025) * 1000), Math.round(v * 1000)]; };

function makeFrames() {
  const court = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13], [9, 16], [26, 5]];
  const pix = court.map(([x, y]) => { const p = project(x, y); return [p[0] / VW, p[1] / VH]; });
  const h = HG.solve(pix, court).map((v) => Number(v.toPrecision(7))), frames = [];
  const pos = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13]];       // 4 « A » puis 4 « B » (points visibles de la scène d'essai)
  for (let i = 0; i <= 40; i++) {
    const t = Math.round(i * 0.2 * 100) / 100;
    const players = pos.map(([x, y], k) => ({ id: k + 1, team: k < 4 ? "A" : "B", x, y, b: box(x, y) }));
    frames.push({ t, players, ball: { x: 14, y: 9 }, h });
  }
  return frames;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-click-"));
  const video = path.join(dir, "essai.mp4");
  execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const frames = makeFrames();
  const dbt = (id, t, x, y) => ({ kind: "team", id, t, x, y, b: box(x, y), n: 40, cur: "B", why: "porte un pantalon ou un survêtement (0 % de peau visible aux jambes) alors que les autres adversaires portent un short : gardien, arbitre ou joueur ?", leg: 0, t0: 0, t1: 8, p0: [x, y], p1: [x, y] });
  const ai = {
    L, W, dir: 1, flip: true, camera: "fixed", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(frames), lost: [], stats: null,
    suggestedEvents: [], settings: { fps: 5, tiles: 1, t0: 0, t1: 8, tol: 42 },
    doubts: [dbt(5, 2, 6, 10), dbt(6, 2, 14, 4)], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai clic", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: "essai.mp4", secondHalfStart: null, duration: 6, events: [], ai };
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => window.FSAI && window.FSAI.ai().frames && window.FSAI.ai().frames.length > 20 && window.FSApp.getVideoUrl() && document.querySelector("video").readyState >= 1, 30000), "projet chargé");
  // image à 2,0 s en pause
  await win.evaluate(() => { const v = document.querySelector("video"); v.pause(); v.currentTime = 2.0; });
  must(await waitFor(win, () => Math.abs(document.querySelector("video").currentTime - 2.0) < 0.05 && !document.querySelector("video").seeking, 8000), "vidéo placée à 2,0 s");
  await sleep(600);
  // coordonnées d'écran du centre du cadre d'une personne (id donné) et d'un point libre
  const where = (id, free) => win.evaluate(([i, fr]) => {
    const c = document.getElementById("overlay"), r = c.getBoundingClientRect(), v = document.querySelector("video"), vw = v.videoWidth, vh = v.videoHeight;
    const s = Math.min(r.width / vw, r.height / vh), ox = (r.width - vw * s) / 2, oy = (r.height - vh * s) / 2;
    if (fr) return { x: r.left + ox + 0.5 * vw * s, y: r.top + oy + 0.95 * vh * s };
    const f = window.FSAI.ai().frames.find((q) => Math.abs(q[0] - 2.0) < 0.02), p = f[1].find((q) => q[0] === i), b = p.slice(4, 8);
    return { x: r.left + ox + ((b[0] + b[2]) / 2000) * vw * s, y: r.top + oy + ((b[1] + b[3]) / 2000) * vh * s };
  }, [id, !!free]);
  const teamOf = (id) => win.evaluate((i) => [...new Set(window.FSAI.ai().frames.map((f) => (f[1].find((p) => p[0] === i) || [])[1]))].join(","), id);
  const menuText = () => win.evaluate(() => (document.querySelector(".person-menu") || {}).textContent || "");
  const menuClick = (t) => win.evaluate((txt) => { const b = [...document.querySelectorAll(".person-menu button")].find((x) => x.textContent.includes(txt)); if (!b) return false; b.click(); return true; }, t);

  // 1. clic sur le cadre d'un « adversaire » : le menu propose six réponses ; « Mon gardien » est retenu et appliqué
  const p5 = await where(5);
  await win.mouse.click(p5.x, p5.y);
  must(await waitFor(win, () => !!document.querySelector(".person-menu"), 4000), "un menu s'ouvre sur le cadre cliqué");
  const mt = await menuText();
  must(/Qui est cette personne/.test(mt) && /lue : adversaire/.test(mt) && /Mon équipe/.test(mt) && /Adversaire/.test(mt) && /Mon gardien/.test(mt) && /Gardien adverse/.test(mt) && /Arbitre, public ou remplaçant/.test(mt), "le menu pose la question et donne les cinq réponses");
  must((await teamOf(5)) === "B", "rien n'est changé tant qu'on n'a pas répondu");
  must(await menuClick("Mon gardien"), "réponse « Mon gardien »");
  must(await waitFor(win, () => window.FSAI.memory().answers.some((a) => a.kind === "team" && a.team === "GKA"), 5000), "la réponse est retenue dans la mémoire du projet");
  must((await teamOf(5)) === "a", "la personne cliquée est devenue « mon gardien » (code a) sur toutes ses images (" + (await teamOf(5)) + ")");
  must((await teamOf(6)) === "B", "les autres adversaires ne changent pas");
  // 2. la même allure (pantalon) est PROPOSÉE, jamais appliquée d'office
  must(await waitFor(win, () => /même allure|même personne/.test(document.getElementById("ai-q").textContent) || /porte la même allure/.test(document.getElementById("ai-q").textContent), 6000), "une proposition « même gardien ? » apparaît pour l'autre personne en pantalon");
  must(/vérifie avant d'accepter/.test(await win.evaluate(() => document.getElementById("ai-q").textContent)), "avec la mise en garde : la tenue seule ne suffit pas");
  must((await teamOf(6)) === "B", "l'autre personne n'est pas modifiée sans accord");
  // 3. annuler
  must(await win.evaluate(() => { const b = [...document.querySelectorAll("#ai-ans button")].find((x) => /Annuler/.test(x.textContent)); if (!b) return false; b.click(); return true; }), "« Mes réponses » : Annuler");
  must(await waitFor(win, () => window.FSAI.memory().answers.length === 0, 5000), "réponse retirée");
  must((await teamOf(5)) === "B", "l'équipe d'avant est rétablie (" + (await teamOf(5)) + ")");

  // 4. clic ailleurs : « le ballon est ici ? »
  const free = await where(0, true);
  await win.mouse.click(free.x, free.y);
  must(await waitFor(win, () => !!document.querySelector(".person-menu"), 4000), "un clic hors des cadres propose de placer le ballon");
  must(/Le ballon est ici/.test(await menuText()), "le menu demande « le ballon est ici ? »");
  const before = await win.evaluate(() => { const f = window.FSAI.ai().frames.find((q) => Math.abs(q[0] - 2.0) < 0.02); return JSON.stringify(f[2]); });
  must(await menuClick("Oui, le ballon est ici"), "réponse « Oui »");
  must(await waitFor(win, () => window.FSAI.memory().answers.some((a) => a.kind === "ball"), 5000), "la position du ballon est retenue");
  const after = await win.evaluate(() => { const f = window.FSAI.ai().frames.find((q) => Math.abs(q[0] - 2.0) < 0.02); return JSON.stringify(f[2]); });
  must(before !== after, "le ballon de cette image a changé (" + before + " -> " + after + ")");
  must(await win.evaluate(() => { const b = [...document.querySelectorAll("#ai-ans button")].find((x) => /Annuler/.test(x.textContent)); if (!b) return false; b.click(); return true; }), "Annuler la position du ballon");
  must(await waitFor(win, () => window.FSAI.memory().answers.length === 0, 5000), "réponse retirée");
  must((await win.evaluate(() => { const f = window.FSAI.ai().frames.find((q) => Math.abs(q[0] - 2.0) < 0.02); return JSON.stringify(f[2]); })) === before, "l'ancienne position du ballon est rétablie");

    // 5. étiquette exacte du ballon (pour l'entraînement) : posée par le « Oui », remplaçable par « aucun ballon visible »
  const lab = await win.evaluate(() => window.FSAI.memory().ballLabels || []);
  must(lab.length === 1 && !lab[0].none && lab[0].u > 0 && lab[0].v > 0 && lab[0].u <= lab[0].vw && lab[0].est === true, "l'étiquette du ballon (pixel cliqué) est retenue : " + JSON.stringify(lab));
  await win.mouse.click(free.x, free.y);
  must(await waitFor(win, () => !!document.querySelector(".person-menu"), 4000), "menu au deuxième clic");
  must(await menuClick("Aucun ballon visible"), "réponse « aucun ballon visible »");
  must(await waitFor(win, () => { const l = window.FSAI.memory().ballLabels || []; return l.length === 1 && l[0].none === true; }, 4000), "l'image sans ballon remplace l'étiquette de la même image");
  must(await win.evaluate(() => /sans ballon/.test(document.getElementById("ai-bl-count").textContent) && !document.getElementById("ai-bl-export").disabled), "le compteur et le bouton d'export sont à jour");

  must(errors.length === 0, "aucune erreur dans l'interface " + JSON.stringify(errors));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + (e.stack || e.message)); process.exit(1); });
