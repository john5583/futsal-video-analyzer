/* Registre des animations : une scène par erreur du catalogue, une par exercice, et séquences (vidéo complète). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./engine.js"), require("./scenarios-errors.js"), require("./scenarios-drills.js"));
  } else {
    root.FutsalScenes = factory(root.FutsalAnim, root.FutsalScenesErrors, root.FutsalScenesDrills);
  }
})(typeof self !== "undefined" ? self : this, function (E, ERR, DRL) {
  "use strict";

  const cache = {};
  function get(kind, table, id) {
    const key = kind + ":" + id;
    if (!table[id]) return null;
    if (!cache[key]) cache[key] = table[id]();
    return cache[key];
  }

  function forError(id) { return get("e", ERR, id); }
  function forDrill(id) { return get("d", DRL, id); }

  /* Séquence de scènes précédées de cartons de titre. items : { type: "title"|"scene", ... } */
  function buildSequence(items) {
    let t = 0;
    const out = items.map((it) => {
      const dur = it.type === "title" ? (it.dur || 3) : it.scene.duration + 0.8;
      const r = Object.assign({}, it, { start: t, end: t + dur, dur });
      t += dur;
      return r;
    });
    return { items: out, duration: t };
  }

  function sequenceOps(seq, T) {
    T = Math.max(0, Math.min(seq.duration, T));
    const it = seq.items.find((i) => T >= i.start && T < i.end) || seq.items[seq.items.length - 1];
    if (it.type === "title") return E.titleOps(it.title, it.subtitle);
    return E.buildOps(it.scene, Math.min(it.scene.duration, T - it.start), { subtitle: it.subtitle });
  }

  /* Image fixe (SVG) d'un instant de scène. */
  function snapshotSVG(scene, t, width) {
    return E.opsToSVG(E.buildOps(scene, t), width || 640);
  }

  return { forError, forDrill, buildSequence, sequenceOps, snapshotSVG, errorIds: () => Object.keys(ERR), drillIds: () => Object.keys(DRL) };
});
