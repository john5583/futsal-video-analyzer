/* Suivi global du sol : côté processus principal. L'interface envoie les images 480×270 RGBA (une par instant de la grille) dans un fichier
   temporaire, puis demande le calcul, qui tourne dans un fil séparé (l'interface reste utilisable). Aucune donnée ne quitte l'ordinateur. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");

const FS = 480 * 270 * 4;
const sessions = new Map();
let nextId = 1;

function begin(n, dir) {
  if (!(Number.isInteger(n) && n >= 2 && n <= 200000)) throw new Error("Nombre d'images invalide");
  const id = nextId++;
  const file = path.join(dir || os.tmpdir(), "futsal-sol-" + process.pid + "-" + id + ".raw");
  const fd = fs.openSync(file, "w+");
  sessions.set(id, { id, n, file, fd, recues: 0, worker: null });
  return id;
}

function frame(id, k, buf) {
  const s = sessions.get(id);
  if (!s) throw new Error("Session inconnue");
  if (!(Number.isInteger(k) && k >= 0 && k < s.n)) throw new Error("Image hors plage");
  const b = Buffer.from(buf instanceof ArrayBuffer ? buf : (buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf));
  if (b.length !== FS) throw new Error("Image de taille inattendue");
  fs.writeSync(s.fd, b, 0, FS, k * FS);
  s.recues++;
  return true;
}

function close(id) {
  const s = sessions.get(id);
  if (!s) return;
  if (s.worker) { try { s.worker.terminate(); } catch (_e) { /* déjà arrêté */ } }
  try { fs.closeSync(s.fd); } catch (_e) { /* déjà fermé */ }
  try { fs.unlinkSync(s.file); } catch (_e) { /* déjà supprimé */ }
  sessions.delete(id);
}

/* Lance le calcul ; onProgress({ etape, f }) ; rend { G, verdict, score, stats }. */
function run(id, workerFile, onProgress, extra) {
  const s = sessions.get(id);
  if (!s) return Promise.reject(new Error("Session inconnue"));
  if (s.recues < s.n) return Promise.reject(new Error("Il manque des images (" + s.recues + " sur " + s.n + ")"));
  return new Promise((resolve, reject) => {
    const w = new Worker(workerFile, { workerData: { file: s.file, n: s.n, extra: extra || null } });
    s.worker = w;
    w.on("message", (m) => {
      if (m.type === "progress") { if (onProgress) onProgress({ etape: m.etape, f: m.f }); }
      else if (m.type === "result") resolve(m);
      else if (m.type === "error") reject(new Error(m.error));
    });
    w.on("error", reject);
    w.on("exit", (code) => { if (code !== 0) reject(new Error("Le calcul s'est arrêté (code " + code + ")")); });
  });
}

module.exports = { begin, frame, close, run, FS };
