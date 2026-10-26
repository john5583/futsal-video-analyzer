/* Test de bout en bout : jamais « Qui est-ce ? » pour une personne dont la tenue est nette.
   Cas réel (20261019_212111, 00:32) : un joueur au haut blanc / short noir, de la même tenue que le n° 17 déjà classé « Mon équipe », recevait la question « qui est-ce ? » parce que cinq pistes
   de l'équipe étaient présentes en même temps (remplaçant qui entre, identifiants coupés). Ici la même situation est rejouée avec la vraie fin d'analyse (finalizeFrames) :
   - à 32 s, cinq pistes de « Mon équipe » (lectures d'équipe 100 % A) + le gardien + quatre adversaires : AUCUNE question, la personne de 00:32 reste « Mon équipe » ;
   - la liste des questions du projet est vide et aucune bulle « Qui est-ce ? » n'est affichée ;
   - une personne vraiment douteuse (équipe lue 60 % / 40 %) est, elle, toujours questionnée (une seule fois) ;
   - aucune erreur dans la console.
   Usage : xvfb-run -a node tests/e2e/qui-est-ce.js   (nécessite ffmpeg ; FSAL_VIDEO_PAN = vidéo de remplacement déjà générée) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { _electron: electron } = require("playwright-core");
const { POSE } = require("../helpers/make-video");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg)) return true; await sleep(250); } return false; }

/* Pistes brutes d'une analyse : [id, équipe lue, de (s), à (s), x, y]. Les positions bougent un peu ; chaque piste est lue 100 % dans son équipe. */
const PISTES = [
  [17, "A", 23.3, 75, 6, 15], [6, "A", 17, 75, 6, 13], [1, "A", 17, 40, 8, 6], [4, "A", 17, 39, 8, 3], [24, "A", 32, 44, 5, 9], [21, "A", 27.7, 38.7, 8, 3],
  [2, "B", 17, 75, 14, 12], [3, "B", 17, 75, 8, 12], [14, "B", 17, 75, 5, 2], [23, "B", 30, 75, 13, 8]
];
function brutes(extra) {
  const frames = [];
  for (let t = 17; t <= 75; t += 1 / 3) {
    const f = { t: Math.round(t * 1000) / 1000, players: [], ball: null };
    PISTES.concat(extra || []).forEach(([id, team, t0, t1, x, y, mix]) => {
      if (t < t0 || t > t1) return;
      const k = Math.round((t - 17) * 3), gk = team === "a";
      f.players.push({ id, team: mix ? mix[k % mix.length] : team, x: gk ? x + 0.4 * Math.sin(t) : x + 2.5 * Math.sin(0.4 * t + id), y: gk ? y + 0.4 * Math.cos(t) : Math.max(1.5, Math.min(18.5, y + 2 * Math.cos(0.3 * t + id))), b: [(id * 19) % 900, 300, ((id * 19) % 900) + 40, 440] });
    });
    frames.push(f);
  }
  return frames;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-quiestce-"));
  let video = process.env.FSAL_VIDEO_PAN || path.join(dir, "pan.mp4");
  if (!process.env.FSAL_VIDEO_PAN) execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video, JSON.stringify(POSE), JSON.stringify({ lineHalf: 0.04, texture: true }), JSON.stringify({ yaw1: 196, secondes: 6, fps: 10 })], { stdio: "ignore" });
  const ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const ai = {
    L: 40, W: 20, dir: 1, flip: true, camera: "fixed", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: null, lost: [], recalage: [], stats: { duration: 80 }, suggestedEvents: [],
    settings: { fps: 3, tiles: 1, t0: 17, t1: 75, tol: 42 }, doubts: [], uncertain: [], subs: []
  };
  const proj = { version: 1, name: "essai qui est-ce", teamName: "", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [], ai };
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
  must(await waitFor(win, () => window.FSAI && document.querySelector("video").readyState >= 1, 30000), "projet chargé");

  // fin d'analyse réelle (finalizeFrames) sur la situation de 00:32
  const r = await win.evaluate((raw) => {
    const P = window.FutsalPipeline, D = window.FutsalDoubt, doubts = [];
    const fin = P.finalizeFrames(raw, { doubts, L: 40, W: 20 });
    const a = window.FSAI.ai(); a.frames = P.compactFrames(fin); a.doubts = doubts;
    window.FSApp.ai.syncFromProject();
    const at = fin.find((f) => Math.abs(f.t - 32) < 0.2), cinq = at.players.filter((p) => p.team === "A");
    const ouvertes = D.openQuestions({ doubts: a.doubts, subs: [], uncertain: [], memory: window.FSAI.memory() });
    return { doubts: doubts.map((d) => ({ id: d.id, why: d.why })), cinqA: cinq.length, equipes: at.players.map((p) => p.id + p.team).join(" "), ouvertes: ouvertes.length };
  }, brutes());
  must(r.cinqA >= 5, "à 32 s, cinq personnes de « Mon équipe » sont présentes en même temps (" + r.equipes + ")");
  must(r.doubts.length === 0, "AUCUNE question « qui est-ce ? » : " + JSON.stringify(r.doubts));
  must(r.ouvertes === 0, "la liste des questions du projet est vide");
  await win.evaluate(() => window.FSApp.seek(32));
  await sleep(600);
  must(!/Qui est-ce|qui est cette personne/i.test(await win.evaluate(() => document.body.innerText)), "aucune bulle « Qui est-ce ? » à 00:32");
  must(await win.evaluate(() => { const f = window.FSApp.ai.getFrames().find((q) => Math.abs(q.t - 32) < 0.2); const p = f && f.players.find((q) => q.id === 6 || q.id === 17); return !!p && f.players.filter((q) => q.team === "A").length >= 5 && f.players.every((q) => q.team); }), "la personne de 00:32 reste « Mon équipe » (A)");

  // une personne vraiment douteuse est toujours questionnée, une seule fois
  const r2 = await win.evaluate((raw) => { const doubts = []; window.FutsalPipeline.finalizeFrames(raw, { doubts, L: 40, W: 20 }); return doubts.map((d) => d.id); }, brutes([[40, "A", 17, 75, 9, 9, ["A", "A", "A", "B", "B"]]]));
  must(r2.length === 1, "une personne dont l'équipe est lue 60 % / 40 % est questionnée une seule fois (ids : " + JSON.stringify(r2) + ")");
  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  if (!process.env.FSAL_VIDEO_PAN) fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
