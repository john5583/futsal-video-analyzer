/* Fil d'exécution d'inférence (YOLOX via onnxruntime-node) : isolé du processus principal pour ne jamais figer l'interface. */
"use strict";
const { parentPort, workerData } = require("worker_threads");
const Y = require("./yolox");

let ort = null;
let session = null;

async function init() {
  ort = require("onnxruntime-node");
  const threads = Math.max(1, Math.min(8, (workerData && workerData.threads) || 4));
  session = await ort.InferenceSession.create(workerData.modelPath, {
    executionProviders: ["cpu"], intraOpNumThreads: threads, graphOptimizationLevel: "all"
  });
}

const ready = init().then(() => parentPort.postMessage({ type: "ready" })).catch((e) => parentPort.postMessage({ type: "fatal", error: String(e && e.message || e) }));

parentPort.on("message", async (msg) => {
  if (!msg || msg.type !== "detect") return;
  try {
    await ready;
    if (!session) throw new Error("Modèle non chargé");
    const rgba = new Uint8ClampedArray(msg.buffer);
    const input = new ort.Tensor("float32", Y.rgbaToTensor(rgba, Y.SIZE), [1, 3, Y.SIZE, Y.SIZE]);
    const res = await session.run({ [session.inputNames[0]]: input });
    const out = res[session.outputNames[0]].data;
    const dets = Y.postprocess(out, { minPerson: msg.minPerson, minBall: msg.minBall, iou: 0.45 });
    parentPort.postMessage({ type: "result", id: msg.id, dets });
  } catch (e) {
    parentPort.postMessage({ type: "result", id: msg.id, error: String(e && e.message || e) });
  }
});
