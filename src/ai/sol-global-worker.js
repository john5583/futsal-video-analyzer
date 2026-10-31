/* Fil de calcul du suivi global du sol (voir sol-global.js) : lit les images 480×270 RGBA dans un fichier temporaire, renvoie G et les verdicts. */
"use strict";
const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const SG = require("./sol-global");

const FS = 480 * 270 * 4;
const fd = fs.openSync(workerData.file, "r");
try {
  const r = SG.construire({
    n: workerData.n,
    pasCle: workerData.pasCle || 20,
    image: (k) => { const b = Buffer.alloc(FS); fs.readSync(fd, b, 0, FS, k * FS); return new Uint8ClampedArray(b.buffer, b.byteOffset, FS); },
    progression: (etape, f) => parentPort.postMessage({ type: "progress", etape, f })
  });
  parentPort.postMessage({ type: "result", G: r.G, verdict: r.verdict, score: r.score, stats: r.stats, Nm: SG.Nm });
} catch (e) {
  parentPort.postMessage({ type: "error", error: String((e && e.message) || e) });
} finally {
  fs.closeSync(fd);
}
