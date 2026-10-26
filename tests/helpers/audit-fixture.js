/* Projet d'essai pour l'audit « zéro défaut » : vidéo synthétique + analyse complète (joueurs, ballon, tenues). */
"use strict";
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const CF = require("../../src/ai/court-fit");
const HG = require("../../src/ai/homography");
const P = require("../../src/ai/pipeline");
const { POSE } = require("./make-video");

const L = 40, W = 20, VW = 960, VH = 540;
const project3d = (x, y) => { const B = CF.cameraBasis(POSE), f = CF.focalPx(VW, POSE[5]), q = CF.project(B, f, VW, VH, x, y, 0); return q ? [q.u, q.v] : null; };
const box = (x, y) => { const p = project3d(x, y); if (!p) return [0, 0, 20, 40]; const u = p[0] / VW, v = p[1] / VH; return [Math.round((u - 0.025) * 1000), Math.round((v - 0.16) * 1000), Math.round((u + 0.025) * 1000), Math.round(v * 1000)]; };

function makeFrames() {
  const court = [[8, 6], [12, 13], [17, 8], [20, 15], [6, 10], [14, 4], [22, 9], [25, 13], [9, 16], [26, 5]];
  const pix = court.map(([x, y]) => { const p = project3d(x, y); return [p[0] / VW, p[1] / VH]; });
  const h = HG.solve(pix, court).map((v) => Number(v.toPrecision(7))), frames = [];
  for (let i = 0; i <= 60; i++) {
    const t = Math.round(i * 0.2 * 100) / 100;
    const xs = t < 6 ? [8, 10, 18, 20] : [8, 10, 12, 24];
    const ys = [6, 13, 9, 15];
    const players = xs.map((x, k) => ({ id: k + 1, team: "A", x, y: ys[k], b: box(x, ys[k]) }))
      .concat([[26, 8], [26.5, 12], [24, 5], [25, 15]].map(([x, y], k) => ({ id: k + 5, team: "B", x, y, b: box(x, y) })));
    frames.push({ t, players, ball: { x: 26.4, y: 8.1 }, h });
  }
  return frames;
}

/* Écrit la vidéo et le projet dans `dir`; retourne { ud, video, proj }. `kind` : "complet" | "vide" | "ancien" | "court". */
function build(dir, kind, video) {
  video = video || process.env.FSAL_E2E_VIDEO || path.join(dir, "essai.mp4");
  if (!fs.existsSync(video)) execFileSync(process.execPath, [path.join(__dirname, "make-video.js"), video], { stdio: "ignore" });
  const ud = path.join(dir, "ud-" + kind + "-" + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(ud);
  let proj;
  if (kind === "vide") proj = null;
  else if (kind === "ancien") {   // projet d'une ancienne version : aucun champ « ai » récent, pas de qualité, pas de suivi
    proj = { version: 1, name: "ancien", teamName: "Les Lions", opponentName: "", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [{ id: 1, t: 2, type: "but", note: "" }] };
  } else {
    proj = {
      version: 1, name: "essai audit", teamName: "Mon équipe", opponentName: "Adversaires", defaultSystem: "3-1", videoPath: video, videoName: path.basename(video), secondHalfStart: null, duration: 6, events: [],
      ai: { L, W, dir: 1, flip: true, camera: "fixed", calibrations: [{ t: 0, points: [], H: [1, 0, 0, 0, 1, 0, 0, 0, 1], err: 0 }], kits: {}, frames: P.compactFrames(makeFrames()), lost: [], stats: null, suggestedEvents: [], settings: { fps: 5, tiles: 1, t0: 0, t1: 12, tol: 42 } }
    };
  }
  if (proj) fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  return { ud, video, proj };
}
module.exports = { build, makeFrames, L, W };
