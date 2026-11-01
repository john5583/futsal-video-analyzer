/* Fil de calcul du suivi global du sol (voir sol-global.js) : lit les images 480×270 RGBA dans un fichier temporaire, renvoie G et les verdicts. */
"use strict";
const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const SG = require("./sol-global");
const TA = require("./terrain-auto");

const FS = 480 * 270 * 4;
const fd = fs.openSync(workerData.file, "r");
try {
  const r = SG.construire({
    n: workerData.n,
    pasCle: workerData.pasCle || 20,
    image: (k) => { const b = Buffer.alloc(FS); fs.readSync(fd, b, 0, FS, k * FS); return new Uint8ClampedArray(b.buffer, b.byteOffset, FS); },
    progression: (etape, f) => parentPort.postMessage({ type: "progress", etape, f })
  });
  /* Identification du terrain par le rond central, contrôlée image par image ; un échec ne doit jamais empêcher le suivi global de servir. */
  let terrain = null;
  try {
    const image = (k) => { const b = Buffer.alloc(FS); fs.readSync(fd, b, 0, FS, k * FS); return new Uint8ClampedArray(b.buffer, b.byteOffset, FS); };
    terrain = TA.analyser({ n: workerData.n, G: r.G, verdict: r.verdict, Nm: SG.Nm, pas: 4, image, progression: (etape, f) => parentPort.postMessage({ type: "progress", etape, f }) });
    const ex = workerData.extra;
    if (terrain.ok && ex && Array.isArray(ex.points) && ex.vw > 0) terrain.orientation = TA.orienterCalibrage(ex.points, ex.vw, ex.L || 40, ex.W || 20, terrain);
  } catch (e2) { terrain = { ok: false, raison: String((e2 && e2.message) || e2) }; }
  parentPort.postMessage({ type: "result", G: r.G, verdict: r.verdict, score: r.score, stats: r.stats, Nm: SG.Nm, terrain });
} catch (e) {
  parentPort.postMessage({ type: "error", error: String((e && e.message) || e) });
} finally {
  fs.closeSync(fd);
}
