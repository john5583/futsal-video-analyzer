/* Choix du moteur de calcul du détecteur : carte graphique (DirectML, Windows) si elle est nettement plus rapide
   que le processeur, sinon processeur. Le choix est mémorisé dans un petit fichier pour ne pas refaire le test à
   chaque lancement ; un test interrompu (plantage du pilote) ou une erreur en cours d'analyse fait repasser au processeur. */
"use strict";
const fs = require("fs");

const GPU_IDS = [0, 1, 2, 3];   // numéros de carte essayés (l'ordre varie d'un PC à l'autre)
const RUNS = 3;                  // inférences chronométrées par candidat (après une inférence de préparation)
const MIN_GAIN = 0.8;            // la carte graphique doit faire au moins 20 % mieux que le processeur

function sessionOptions(kind, deviceId, threads) {
  if (kind === "dml") {
    // DirectML n'accepte ni l'optimisation mémoire par motifs ni l'exécution parallèle
    return { executionProviders: [{ name: "dml", deviceId }], graphOptimizationLevel: "all", enableMemPattern: false, executionMode: "sequential" };
  }
  return { executionProviders: ["cpu"], intraOpNumThreads: Math.max(1, Math.min(8, threads || 4)), graphOptimizationLevel: "all" };
}

function readState(file) {
  if (!file) return {};
  try { const s = JSON.parse(fs.readFileSync(file, "utf8")); return s && typeof s === "object" ? s : {}; } catch (_e) { return {}; }
}

function writeState(file, s) {
  if (!file) return;
  try { fs.writeFileSync(file + ".tmp", JSON.stringify(s)); fs.renameSync(file + ".tmp", file); } catch (_e) { /* mémorisation facultative */ }
}

function release(session) {
  if (session && typeof session.release === "function") { try { Promise.resolve(session.release()).catch(() => {}); } catch (_e) { /* déjà libérée */ } }
}

/* Temps médian d'une inférence sur une image grise ; vérifie que la sortie est exploitable. */
async function measure(ort, session, size, now) {
  now = now || Date.now;
  const input = new ort.Tensor("float32", new Float32Array(3 * size * size).fill(114), [1, 3, size, size]);
  const feeds = { [session.inputNames[0]]: input };
  const check = (res) => {
    const out = res[session.outputNames[0]];
    if (!out || !out.data || !out.data.length) throw new Error("Sortie vide");
    for (let i = 0; i < Math.min(out.data.length, 2000); i++) if (!Number.isFinite(out.data[i])) throw new Error("Sortie invalide");
  };
  check(await session.run(feeds));
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t = now();
    check(await session.run(feeds));
    times.push(now() - t);
  }
  times.sort((a, b) => a - b);
  return Math.max(1, times[times.length >> 1]);
}

/* Ouvre le détecteur sur le meilleur moteur.
   o : { modelPath, threads, prefer ("auto" | "cpu"), platform, stateFile, signature, size, now (horloge, pour les tests) }
   Renvoie { session, kind ("dml" | "cpu"), deviceId, ms, cpuMs, reason }.
   reason : "choix" (processeur demandé), "plateforme" (hors Windows), "plus-rapide" (la carte n'est pas plus rapide),
            "indisponible" (aucune carte utilisable), "echec-precedent" (le dernier test a planté). */
async function open(ort, o) {
  const size = o.size || 640;
  const create = (kind, id) => ort.InferenceSession.create(o.modelPath, sessionOptions(kind, id, o.threads));
  const cpu = async (reason, cpuMs) => ({ session: await create("cpu"), kind: "cpu", deviceId: null, ms: cpuMs || null, cpuMs: cpuMs || null, reason });
  if (o.prefer === "cpu") return cpu("choix");
  if (o.platform !== "win32") return cpu("plateforme");

  const state = readState(o.stateFile);
  // un test resté « en cours » : le précédent lancement s'est arrêté net pendant l'essai de la carte graphique
  if (state.probing === o.signature || state.crashed === o.signature) {
    if (state.probing === o.signature) writeState(o.stateFile, { crashed: o.signature });
    return cpu("echec-precedent");
  }
  const known = state.choice && state.choice.signature === o.signature ? state.choice : null;
  if (known && known.kind === "cpu") return cpu(known.reason || "plus-rapide", known.cpuMs);
  if (known && known.kind === "dml") {
    let s = null;
    try {
      s = await create("dml", known.deviceId);
      const ms = await measure(ort, s, size, o.now);
      // même carte et même vitesse qu'au dernier test : pas besoin de tout retester
      if (ms <= known.ms * 2 + 5) return { session: s, kind: "dml", deviceId: known.deviceId, ms, cpuMs: known.cpuMs, reason: null };
    } catch (_e) { /* carte changée ou indisponible : nouveau test complet */ }
    release(s);
  }

  writeState(o.stateFile, { probing: o.signature });
  const cpuSession = await create("cpu");
  let cpuMs;
  try { cpuMs = await measure(ort, cpuSession, size, o.now); } catch (e) { release(cpuSession); writeState(o.stateFile, {}); throw e; }
  let best = null;
  for (const id of GPU_IDS) {
    let s = null;
    try {
      s = await create("dml", id);
      const ms = await measure(ort, s, size, o.now);
      if (!best || ms < best.ms) { if (best) release(best.session); best = { session: s, id, ms }; s = null; }
    } catch (_e) { /* pas de carte à ce numéro, ou carte inutilisable */ }
    release(s);
  }
  if (best && best.ms < cpuMs * MIN_GAIN) {
    release(cpuSession);
    writeState(o.stateFile, { choice: { signature: o.signature, kind: "dml", deviceId: best.id, ms: best.ms, cpuMs } });
    return { session: best.session, kind: "dml", deviceId: best.id, ms: best.ms, cpuMs, reason: null };
  }
  if (best) release(best.session);
  const reason = best ? "plus-rapide" : "indisponible";
  writeState(o.stateFile, { choice: { signature: o.signature, kind: "cpu", cpuMs, reason } });
  return { session: cpuSession, kind: "cpu", deviceId: null, ms: cpuMs, cpuMs, reason };
}

/* Lance une inférence ; si la carte graphique échoue en cours de route, on passe au processeur et on rejoue l'image.
   st : résultat de open() complété de { ort, opts, onSwitch } ; st.session et st.kind sont mis à jour sur place. */
async function run(st, feedsFor) {
  const session = st.session;
  try {
    return await session.run(feedsFor(session));
  } catch (e) {
    if (st.kind !== "dml") throw e;
    if (!st.switching) {
      st.switching = (async () => {
        const next = await st.ort.InferenceSession.create(st.opts.modelPath, sessionOptions("cpu", null, st.opts.threads));
        release(session);
        st.session = next; st.kind = "cpu"; st.deviceId = null; st.ms = st.cpuMs; st.reason = "erreur-gpu";
        // au prochain lancement, la carte sera de nouveau testée (l'erreur peut venir d'une mise en veille, d'une mise à jour du pilote…)
        writeState(st.opts.stateFile, {});
        if (st.onSwitch) st.onSwitch(info(st));
      })();
      st.switching.catch(() => {});
    }
    await st.switching;
    return st.session.run(feedsFor(st.session));
  }
}

function info(st) {
  return { kind: st.kind, deviceId: st.deviceId, ms: st.ms, cpuMs: st.cpuMs, reason: st.reason };
}

module.exports = { open, run, info, sessionOptions, measure, readState, GPU_IDS, MIN_GAIN };
