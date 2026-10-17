/* Test de bout en bout : questions du programme, mémoire du projet, « Mes réponses » (annuler), cadre orange sur la vidéo.
   Projet synthétique avec un doute d'équipe, une erreur incertaine et un passage par la zone de remplacement.
   Usage : xvfb-run -a node tests/e2e/questions.js   (nécessite ffmpeg, npm i --no-save playwright-core) */
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

function makeFrames() {
  const court = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13], [9, 16], [26, 5]];
  const pix = court.map(([x, y]) => { const p = project(x, y); return [p[0] / VW, p[1] / VH]; });
  const h = HG.solve(pix, court), frames = [];
  for (let i = 0; i <= 44; i++) {
    const t = Math.round(i * 0.2 * 100) / 100;
    const pos = [[10 + i * 0.1, 8], [12, 12 + i * 0.05], [15, 6], [18 - i * 0.05, 11], [11 + i * 0.12, 9], [14, 14], [20, 7], [22, 12]];
    if (i >= 6) pos.push([20, 0.5]);                       // personne n° 9 : arrive à 1,2 s dans la zone de remplacement, reste 7,6 s
    const players = pos.map(([x, y], k) => {
      const p = project(x, y), u = p[0] / VW, v = p[1] / VH;
      return { id: k + 1, team: k < 4 ? "A" : "B", x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, b: [Math.round((u - 0.025) * 1000), Math.round((v - 0.16) * 1000), Math.round((u + 0.025) * 1000), Math.round(v * 1000)] };
    });
    frames.push({ t, players, ball: { x: pos[0][0] + 0.6, y: pos[0][1] }, h: h.map((v) => Number(v.toPrecision(7))) });
  }
  return frames;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-q-"));
  const video = path.join(dir, "essai.mp4");
  execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const frames = makeFrames(), f10 = frames[10], p1 = f10.players[0];
  const ai = {
    L, W, dir: 1, flip: true, camera: "fixed", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(frames), lost: [], stats: null,
    suggestedEvents: [], settings: { fps: 5, tiles: 1, t0: 0, t1: 9, tol: 42, bench: "left" },
    doubts: [{ kind: "team", id: 1, t: f10.t, x: p1.x, y: p1.y, b: p1.b, n: 25, cur: "A", why: "équipe lue 40 % du temps seulement", t0: 0, t1: 6, p0: [10, 8], p1: [13, 8] }],
    uncertain: [{ t: 3.3, type: "perte_zone_mediane", ballConf: 0.2, reason: "ballon non visible", event: { t: 3.3, type: "perte_zone_mediane", zone: "MED", side: "C", outcome: "PERTE", note: "perte d'essai" } }],
    subs: [{ id: 9, t: 1.2, x: 20, y: 0.5, b: frames[6].players[8].b, answered: false }]
  };
  const proj = { version: 1, name: "essai questions", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: "essai.mp4", secondHalfStart: null, duration: 6, events: [], ai };
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
  const nq = () => win.evaluate(() => document.querySelectorAll("#ai-q .q").length);
  const click = (sel, text) => win.evaluate(([s, t]) => { const b = [...document.querySelectorAll(s)].find((x) => !t || x.textContent.includes(t)); if (!b) return false; b.click(); return true; }, [sel, text]);

  // 1. les trois questions sont posées, avec le bon vocabulaire
  must(await waitFor(win, () => document.querySelectorAll("#ai-q .q").length === 3, 10000), "3 questions affichées (équipe, remplaçant, erreur incertaine)");
  const txt = await win.evaluate(() => document.getElementById("ai-q").textContent);
  must(/Qui est la personne dans le cadre orange/.test(txt) && /zone de remplacement/.test(txt) && /a-t-elle eu lieu/.test(txt), "textes des trois sortes de questions");
  must(/\(3\)/.test(await win.evaluate(() => document.getElementById("ai-q-count").textContent)), "compteur de questions");

  // 2. erreur incertaine : « Non » l'écarte pour de bon, « Annuler » la rétablit (même si le recalcul ne la retrouve pas)
  must(await click("#ai-q .q button", "Non"), "réponse « Non » à l'erreur incertaine");
  must(await waitFor(win, () => window.FSAI.memory().rejected.length === 1, 5000), "l'erreur écartée est retenue");
  must((await nq()) === 2, "plus que 2 questions");
  must(/écartée/.test(await win.evaluate(() => document.getElementById("ai-ans").textContent)), "« Mes réponses » montre l'erreur écartée");
  must(await click("#ai-ans button", "Annuler"), "annuler l'écartement");
  must(await waitFor(win, () => window.FSAI.memory().rejected.length === 0 && document.querySelectorAll("#ai-q .q").length === 3, 8000), "l'erreur n'est plus écartée, la question revient");

  // 3. erreur incertaine « Oui » : ajoutée aux événements, annulable
  must(await click("#ai-q .q button", "Oui, c'est arrivé"), "réponse « Oui » à l'erreur incertaine");
  must(await waitFor(win, () => window.FSApp.state.project.events.length === 1 && /confirmé par vous/.test(window.FSApp.state.project.events[0].note), 10000), "l'erreur confirmée est ajoutée aux événements (« confirmé par vous »)");
  must(await click("#ai-ans button", "Annuler"), "annuler la confirmation");
  must(await waitFor(win, () => window.FSApp.state.project.events.length === 0 && document.querySelectorAll("#ai-q .q").length === 3, 8000), "l'événement ajouté est retiré, la question revient");

  // 4. « Voir dans la vidéo » : image exacte en pause, cadre orange sur la personne
  must(await click("#ai-q .q button", "Voir dans la vidéo"), "bouton « Voir dans la vidéo »");
  must(await waitFor(win, () => { const v = document.querySelector("video"); return v.paused && Math.abs(v.currentTime - window.FSAI.ai().doubts[0].t) < 0.15; }, 8000), "vidéo en pause sur l'image exacte de la question");
  await sleep(500);
  const orange = await win.evaluate(() => { const c = document.getElementById("overlay"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 100 && d[i + 1] < 135 && d[i + 2] < 60 && d[i + 3] > 200) n++; return n; });
  must(orange > 60, "cadre orange dessiné sur la personne (" + orange + " pixels)");

  // 5. réponse « équipe » : appliquée, mémorisée, visible dans « Mes réponses »
  must(await click("#ai-q .q button", "Adversaire"), "réponse « Adversaire »");
  must(await waitFor(win, () => window.FSAI.memory().answers.length === 1, 5000), "réponse retenue dans la mémoire du projet");
  const teamOf = (id) => win.evaluate((i) => { const c = window.FSAI.ai().frames; return [...new Set(c.map((f) => (f[1].find((p) => p[0] === i) || [])[1]))].join(","); }, id);
  must((await teamOf(1)) === "B", "la personne désignée est devenue « adversaire » sur toutes ses images (" + (await teamOf(1)) + ")");
  must((await teamOf(2)) === "A", "les autres joueurs ne changent pas");
  must(!/cadre orange/.test(await win.evaluate(() => document.getElementById("ai-q").textContent)), "la question répondue disparaît");
  must(/(1)/.test(await win.evaluate(() => document.getElementById("ai-ans-count").textContent)), "« Mes réponses » liste la réponse");

  // 6. annuler : l'équipe d'avant revient et la question réapparaît
  must(await click("#ai-ans button", "Annuler"), "bouton « Annuler »");
  must(await waitFor(win, () => window.FSAI.memory().answers.length === 0, 5000), "réponse retirée de la mémoire");
  must((await teamOf(1)) === "A", "l'équipe d'avant est rétablie (" + (await teamOf(1)) + ")");
  must(await waitFor(win, () => /cadre orange/.test(document.getElementById("ai-q").textContent), 5000), "la question réapparaît");

  // 7. remplaçant : question posée par l'analyse elle-même (personne 9, près de la ligne de touche des bancs pendant plus de 6 s)
  must(/zone de remplacement/.test(await win.evaluate(() => document.getElementById("ai-q").textContent)), "question « remplaçant ou joueur ? » posée");
  must(await click("#ai-q .q button", "Joueur sur le terrain"), "réponse « Joueur sur le terrain »");
  must(await waitFor(win, () => window.FSAI.memory().answers.some((a) => a.kind === "sub" && a.verdict === "joueur"), 5000), "réponse « joueur » retenue pour le passage par la zone de remplacement");
  must(!/zone de remplacement/.test(await win.evaluate(() => document.getElementById("ai-q").textContent)), "la question du remplaçant disparaît");

  must(errors.length === 0, "aucune erreur dans l'interface " + JSON.stringify(errors));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + (e.stack || e.message)); process.exit(1); });
