/* Fil d'exécution d'inférence (YOLOX via onnxruntime-node) : isolé du processus principal pour ne jamais figer l'interface.
   Le détecteur tourne sur la carte graphique quand elle est plus rapide, sinon sur le processeur (voir backend.js). */
"use strict";
const { parentPort, workerData } = require("worker_threads");
const Y = require("./yolox");
const SAM = require("./sam");
const SIL = require("./silhouette");
const Backend = require("./backend");

let ort = null;
let engine = null;

async function init() {
  ort = require("onnxruntime-node");
  const opts = {
    modelPath: workerData.modelPath, gpuModelPath: workerData.gpuModelPath || null, threads: Math.max(1, Math.min(8, (workerData && workerData.threads) || 4)),
    prefer: workerData.prefer === "cpu" ? "cpu" : "auto", platform: process.platform,
    stateFile: workerData.backendFile || null, signature: workerData.signature || "", size: Y.SIZE
  };
  engine = Object.assign(await Backend.open(ort, opts), { ort, opts, onSwitch: (b) => parentPort.postMessage({ type: "backend", backend: b }) });
}

const ready = init().then(() => parentPort.postMessage({ type: "ready", backend: Backend.info(engine) })).catch((e) => parentPort.postMessage({ type: "fatal", error: String(e && e.message || e) }));

/* Découpe (silhouettes) : le modèle n'est chargé qu'à la première demande. */
let sam = null;
async function getSam() {
  if (!sam) {
    if (!workerData.samEncPath || !workerData.samDecPath) throw new Error("Modèle de découpe introuvable");
    sam = SAM.create(ort, workerData.samEncPath, workerData.samDecPath, Math.max(1, Math.min(8, workerData.threads || 4)));
    sam.catch(() => { sam = null; });
  }
  return sam;
}

async function onSegment(msg) {
  try {
    await ready;
    const s = await getSam();
    if (msg.buffer) await s.embed(msg.imgId, new Uint8ClampedArray(msg.buffer), msg.width, msg.height);
    const masks = [];
    const boxes = msg.boxes || [], negs = Array.isArray(msg.negs) ? msg.negs : [];
    for (let i = 0; i < boxes.length; i++) {
      const m = await s.segmentBox(boxes[i], msg.imgId, negs[i]);
      // stabilité : la même personne découpée avec une boîte un peu plus petite puis un peu plus grande doit donner le même contour.
      // Inutile (donc non calculée, 0) quand la découpe sera refusée de toute façon : forme impossible ou voisin collé.
      const crowded = boxes.some((o, j) => j !== i && SIL.gap(boxes[i], o) <= SIL.LIM.gapMin);
      let stab = 0;
      if (!crowded && SIL.evaluate(Object.assign({}, m, { stab: 1 }), boxes[i]).ok) {
        const mi = await s.segmentBox(SIL.scaleBox(boxes[i], 0.88), msg.imgId, negs[i]), mo = await s.segmentBox(SIL.scaleBox(boxes[i], 1.1), msg.imgId, negs[i]);
        stab = Math.min(SIL.maskIoU(m, mi), SIL.maskIoU(m, mo));
      }
      masks.push({ x0: m.x0, y0: m.y0, w: m.w, h: m.h, area: m.area, iou: m.iou, stab, data: m.data });
    }
    parentPort.postMessage({ type: "result", id: msg.id, masks });
  } catch (e) {
    parentPort.postMessage({ type: "result", id: msg.id, error: String(e && e.message || e) });
  }
}

parentPort.on("message", async (msg) => {
  if (msg && msg.type === "segment") return onSegment(msg);
  if (!msg || msg.type !== "detect") return;
  try {
    await ready;
    if (!engine) throw new Error("Modèle non chargé");
    const rgba = new Uint8ClampedArray(msg.buffer);
    const input = new ort.Tensor("float32", Y.rgbaToTensor(rgba, Y.SIZE), [1, 3, Y.SIZE, Y.SIZE]);
    let outName = null;
    const res = await Backend.run(engine, (s) => { outName = s.outputNames[0]; return { [s.inputNames[0]]: input }; });
    const out = res[outName].data;
    const dets = Y.postprocess(out, { minPerson: msg.minPerson, minBall: msg.minBall, iou: 0.45 });
    parentPort.postMessage({ type: "result", id: msg.id, dets });
  } catch (e) {
    parentPort.postMessage({ type: "result", id: msg.id, error: String(e && e.message || e) });
  }
});
