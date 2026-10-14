const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const B = require("../src/ai/backend");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Faux onnxruntime : spec["cpu"] / spec["dml:N"] = { ms, noCreate, failAfter (nombre d'inférences réussies), nan }. */
function fakeOrt(spec) {
  const log = { created: [], released: 0 };
  // horloge simulée : chaque inférence « dure » exactement s.ms, quelle que soit la charge de la machine
  const clock = { t: 0 };
  now = () => clock.t;
  const ort = {
    Tensor: function (type, data, dims) { this.type = type; this.data = data; this.dims = dims; },
    InferenceSession: {
      create: async (file, opts) => {
        const ep = opts.executionProviders[0];
        const key = typeof ep === "string" ? ep : ep.name + ":" + ep.deviceId;
        // « dml:N|fichier » : comportement propre à un modèle (ex. le modèle précis) sur cette carte
        const s = spec[key + "|" + file] || spec[key];
        log.created.push(spec[key + "|" + file] ? key + "|" + file : key);
        if (!s || s.noCreate) throw new Error("pas de carte " + key);
        let runs = 0;
        return {
          key, inputNames: ["images"], outputNames: ["output"],
          run: async () => {
            await sleep(0);
            clock.t += s.ms;
            runs++;
            if (s.failAfter != null && runs > s.failAfter) throw new Error("carte graphique perdue");
            return { output: { data: new Float32Array([1, 2, s.nan ? NaN : 3]) } };
          },
          release: async () => { log.released++; }
        };
      }
    }
  };
  return { ort, log };
}

function tmpState() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fsal-backend-")), "ai-backend.json");
}
let now = Date.now;   // remplacée par l'horloge du dernier faux moteur créé
const base = (stateFile, extra) => Object.assign({ modelPath: "m.onnx", threads: 4, prefer: "auto", platform: "win32", stateFile, signature: "1.0:123", size: 8, now }, extra || {});

test("moteur : « processeur uniquement » et hors Windows, la carte graphique n'est pas essayée", async () => {
  const { ort, log } = fakeOrt({ cpu: { ms: 1 }, "dml:0": { ms: 1 } });
  const a = await B.open(ort, base(tmpState(), { prefer: "cpu" }));
  assert.equal(a.kind, "cpu"); assert.equal(a.reason, "choix");
  const b = await B.open(ort, base(tmpState(), { platform: "linux" }));
  assert.equal(b.kind, "cpu"); assert.equal(b.reason, "plateforme");
  assert.deepEqual(log.created, ["cpu", "cpu"]);
});

test("moteur : la carte graphique la plus rapide est choisie et mémorisée", async () => {
  const file = tmpState();
  const { ort, log } = fakeOrt({ cpu: { ms: 40 }, "dml:0": { ms: 25 }, "dml:1": { ms: 4 }, "dml:2": { noCreate: true }, "dml:3": { noCreate: true } });
  const e = await B.open(ort, base(file));
  assert.equal(e.kind, "dml"); assert.equal(e.deviceId, 1);
  assert.ok(e.cpuMs >= 35 && e.ms < 20, JSON.stringify(B.info(e)));
  assert.equal(log.released, 2, "sessions processeur et carte 0 libérées");
  const st = B.readState(file);
  assert.equal(st.choice.kind, "dml"); assert.equal(st.choice.deviceId, 1); assert.equal(st.probing, undefined);
  // lancement suivant : seule la carte mémorisée est ouverte
  log.created.length = 0;
  const again = await B.open(ort, base(file));
  assert.equal(again.kind, "dml"); assert.deepEqual(log.created, ["dml:1"]);
  // nouvelle version de l'application : nouveau test complet
  log.created.length = 0;
  await B.open(ort, base(file, { signature: "1.1:123" }));
  assert.deepEqual(log.created, ["cpu", "dml:0", "dml:1", "dml:2", "dml:3"]);
});

test("moteur : processeur si la carte n'est pas nettement plus rapide, absente ou donne une sortie invalide", async () => {
  const slow = fakeOrt({ cpu: { ms: 30 }, "dml:0": { ms: 28 } });
  const a = await B.open(slow.ort, base(tmpState()));
  assert.equal(a.kind, "cpu"); assert.equal(a.reason, "plus-rapide");
  const none = fakeOrt({ cpu: { ms: 2 } });
  const b = await B.open(none.ort, base(tmpState()));
  assert.equal(b.kind, "cpu"); assert.equal(b.reason, "indisponible");
  const nan = fakeOrt({ cpu: { ms: 30 }, "dml:0": { ms: 1, nan: true } });
  const c = await B.open(nan.ort, base(tmpState()));
  assert.equal(c.kind, "cpu");
  // carte mémorisée devenue anormalement lente (autre carte à ce numéro) : nouveau test complet
  const file = tmpState();
  fs.writeFileSync(file, JSON.stringify({ choice: { signature: "1.0:123", kind: "dml", deviceId: 0, ms: 2, cpuMs: 30 } }));
  const moved = fakeOrt({ cpu: { ms: 30 }, "dml:0": { ms: 25 }, "dml:1": { ms: 3 } });
  const d = await B.open(moved.ort, base(file));
  assert.equal(d.kind, "dml"); assert.equal(d.deviceId, 1);
});

test("moteur : un essai de la carte interrompu (plantage) fait passer au processeur sans réessayer", async () => {
  const file = tmpState();
  fs.writeFileSync(file, JSON.stringify({ probing: "1.0:123" }));
  const { ort, log } = fakeOrt({ cpu: { ms: 15 }, "dml:0": { ms: 1 } });
  const a = await B.open(ort, base(file));
  assert.equal(a.kind, "cpu"); assert.equal(a.reason, "echec-precedent");
  const b = await B.open(ort, base(file));
  assert.equal(b.reason, "echec-precedent");
  assert.deepEqual(log.created, ["cpu", "cpu"]);
  // après une mise à jour, la carte est de nouveau essayée
  const c = await B.open(ort, base(file, { signature: "1.1:123" }));
  assert.equal(c.kind, "dml");
});

test("moteur : la carte graphique qui échoue en cours d'analyse est remplacée par le processeur, image rejouée", async () => {
  const file = tmpState();
  const { ort } = fakeOrt({ cpu: { ms: 20 }, "dml:0": { ms: 1, failAfter: 5 } });
  const opts = base(file);
  const switched = [];
  const st = Object.assign(await B.open(ort, opts), { ort, opts, onSwitch: (b) => switched.push(b) });
  assert.equal(st.kind, "dml");
  const feeds = (s) => ({ [s.inputNames[0]]: 1 });
  // deux images en même temps : un seul basculement, et les deux obtiennent un résultat
  const [r1, r2] = await Promise.all([B.run(st, feeds), B.run(st, feeds)]);
  assert.ok(r1.output && r2.output);
  assert.equal(st.kind, "cpu"); assert.equal(st.reason, "erreur-gpu");
  assert.equal(switched.length, 1); assert.equal(switched[0].kind, "cpu");
  assert.deepEqual(B.readState(file), {}, "la carte sera retestée au prochain lancement");
  // une erreur sur le processeur reste une vraie erreur
  st.session = { inputNames: ["x"], run: async () => { throw new Error("image invalide"); } };
  await assert.rejects(B.run(st, feeds), /image invalide/);
});

test("moteur : modèle précis sur la carte graphique, modèle standard s'il échoue, est trop lent, ou sur processeur", async () => {
  const precise = { gpuModelPath: "g.onnx" };
  const ok = fakeOrt({ cpu: { ms: 40 }, "dml:0": { ms: 5 }, "dml:0|g.onnx": { ms: 12 } });
  const a = await B.open(ok.ort, base(tmpState(), precise));
  assert.deepEqual([a.kind, a.model, a.ms], ["dml", "precis", 12]);
  assert.equal(B.info(a).model, "precis");
  const broken = fakeOrt({ cpu: { ms: 40 }, "dml:0": { ms: 5 }, "dml:0|g.onnx": { noCreate: true } });
  const b = await B.open(broken.ort, base(tmpState(), precise));
  assert.deepEqual([b.kind, b.model, b.ms], ["dml", "standard", 5]);
  const slow = fakeOrt({ cpu: { ms: 40 }, "dml:0": { ms: 5 }, "dml:0|g.onnx": { ms: 45 } });
  const c = await B.open(slow.ort, base(tmpState(), precise));
  assert.deepEqual([c.kind, c.model], ["dml", "standard"]);
  const cpu = fakeOrt({ cpu: { ms: 40 }, "dml:0": { ms: 5 }, "dml:0|g.onnx": { ms: 12 } });
  const d = await B.open(cpu.ort, base(tmpState(), Object.assign({ prefer: "cpu" }, precise)));
  assert.deepEqual([d.kind, d.model], ["cpu", "standard"]);
  assert.deepEqual(cpu.log.created, ["cpu"]);
  // panne de la carte en cours d'analyse : retour au processeur avec le modèle standard
  const fail = fakeOrt({ cpu: { ms: 40 }, "dml:0": { ms: 5 }, "dml:0|g.onnx": { ms: 12, failAfter: 4 } });
  const opts = base(tmpState(), precise);
  const st = Object.assign(await B.open(fail.ort, opts), { ort: fail.ort, opts });
  assert.equal(st.model, "precis");
  await B.run(st, (s) => ({ [s.inputNames[0]]: 1 }));
  assert.deepEqual([st.kind, st.model], ["cpu", "standard"]);
  assert.equal(fail.log.created[fail.log.created.length - 1], "cpu");
});

const MODEL = path.join(__dirname, "..", "models", "yolox_s.onnx");
const MODEL_M = path.join(__dirname, "..", "models", "yolox_m.onnx");
test("moteur réel : le détecteur s'ouvre sur la carte graphique ou le processeur et produit une sortie valide", { skip: !fs.existsSync(MODEL) }, async () => {
  const ort = require("onnxruntime-node");
  const opts = { modelPath: MODEL, threads: 4, prefer: "auto", platform: process.platform, stateFile: tmpState(), signature: "test", size: 640 };
  const st = Object.assign(await B.open(ort, opts), { ort, opts });
  assert.ok(st.kind === "dml" || st.kind === "cpu");
  const input = new ort.Tensor("float32", new Float32Array(3 * 640 * 640).fill(114), [1, 3, 640, 640]);
  let outName = null;
  const res = await B.run(st, (s) => { outName = s.outputNames[0]; return { [s.inputNames[0]]: input }; });
  assert.equal(res[outName].data.length, 8400 * 85);
  console.log("moteur réel :", JSON.stringify(B.info(st)));
});

test("fil d'analyse : annonce le moteur utilisé et détecte, en automatique comme sur processeur", { skip: !fs.existsSync(MODEL) }, async () => {
  const { Worker } = require("worker_threads");
  for (const prefer of ["auto", "cpu"]) {
    const gpuModelPath = fs.existsSync(MODEL_M) ? MODEL_M : null;
    const w = new Worker(path.join(__dirname, "..", "src", "ai", "worker.js"), { workerData: { modelPath: MODEL, gpuModelPath, threads: 4, prefer, backendFile: tmpState(), signature: "test" } });
    try {
      const ready = await new Promise((resolve, reject) => { w.once("message", resolve); w.once("error", reject); });
      assert.equal(ready.type, "ready", JSON.stringify(ready));
      if (prefer === "cpu") assert.deepEqual([ready.backend.kind, ready.backend.reason, ready.backend.model], ["cpu", "choix", "standard"]);
      else {
        assert.ok(["dml", "cpu"].includes(ready.backend.kind));
        if (ready.backend.kind === "cpu") assert.equal(ready.backend.model, "standard");
        console.log("fil d'analyse :", JSON.stringify(ready.backend));
      }
      const buf = new Uint8ClampedArray(640 * 640 * 4).fill(114).buffer;
      const res = await new Promise((resolve) => { w.on("message", (m) => { if (m.type === "result") resolve(m); }); w.postMessage({ type: "detect", id: 1, buffer: buf, minPerson: 0.35, minBall: 0.12 }, [buf]); });
      assert.equal(res.error, undefined);
      assert.ok(Array.isArray(res.dets));
    } finally { await w.terminate(); }
  }
});
