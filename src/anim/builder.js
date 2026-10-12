/* Constructeur de scènes d'animation (API chaînée). Les durées sont en secondes, les positions en mètres. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.FutsalSceneBuilder = factory(root.FutsalAnim);
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  const JT = 6.7;      // instant où l'on passe de l'erreur à la correction
  const END = 14.5;

  function Scene(id, title, duration) {
    const o = { id, title, duration: duration || END, actors: [], moves: {}, ball: [], arrows: [], zones: [], lines: [], labels: [], marks: [], steps: [] };
    /* Phases erreur/correction : la flèche d'erreur disparaît à la correction. Exercices : une flèche s'estompe 3 s après son tracé. */
    const dt2 = (t0, t2, t1) => (t2 != null ? t2 : (o.split != null ? (t0 < o.split ? o.split : null) : Math.min(o.duration, (t1 != null ? t1 : t0) + 3)));
    const api = {
      scene: o,
      phased() { o.split = JT + 0.05; return api; },
      add(team, key, n, x, y, tag) { o.actors.push({ id: key, team, n, x, y, tag }); return api; },
      a(n, x, y, tag) { return api.add("A", "A" + n, n, x, y, tag); },
      b(n, x, y, tag) { return api.add("B", "B" + n, n, x, y, tag); },
      gka(x, y) { return api.add("GKA", "GKA", null, x, y); },
      gkb(x, y) { return api.add("GKB", "GKB", null, x, y); },
      cone(k, x, y) { return api.add("C", "C" + k, null, x, y); },
      set(id, x, y) { const a = o.actors.find((q) => q.id === id); if (!a) throw new Error("acteur inconnu " + id); a.x = x; a.y = y; return api; },
      pos(id, t) { return E.actorPos(o, id, t); },
      go(id, ...kf) { o.moves[id] = (o.moves[id] || []).concat(kf); return api; },
      last(id) {
        const m = o.moves[id];
        if (m && m.length) return [m[m.length - 1][1], m[m.length - 1][2]];
        const a = o.actors.find((q) => q.id === id);
        return [a.x, a.y];
      },
      jump(id, t, x, y) { const l = api.last(id); o.moves[id] = (o.moves[id] || []).concat([[t, l[0], l[1]], [t + 0.005, x, y]]); return api; },
      jumpAll(t, map) { Object.keys(map).forEach((id) => api.jump(id, t, map[id][0], map[id][1])); return api; },
      ball(...kf) { if (typeof kf[0] === "number") o.ball.push([kf[0], kf[1], kf[2]]); else o.ball = o.ball.concat(kf); return api; },
      ballJump(t, x, y) {
        const l = o.ball.length ? o.ball[o.ball.length - 1] : [0, x, y];
        o.ball = o.ball.concat([[t, l[1], l[2]], [t + 0.005, x, y]]); return api;
      },
      carry(id, t0, t1) {
        for (let t = t0; t < t1; t += 0.25) { const p = E.actorPos(o, id, t); o.ball.push([Math.round(t * 100) / 100, p[0], p[1]]); }
        const p = E.actorPos(o, id, t1); o.ball.push([t1, p[0], p[1]]);
        return api;
      },
      pass(kind, from, to, t0, t1, label) {
        const p0 = typeof from === "string" ? E.actorPos(o, from, t0) : from;
        const p1 = typeof to === "string" ? E.actorPos(o, to, t1) : to;
        o.ball.push([t0, p0[0], p0[1]], [t1, p1[0], p1[1]]);
        o.arrows.push({ kind, from, to, t0, t1, label: label || null, t2: dt2(t0, null, t1) });
        return api;
      },
      arrow(kind, from, to, t0, t1, label, t2) { o.arrows.push({ kind, from, to, t0, t1, label: label || null, t2: dt2(t0, t2, t1) }); return api; },
      zone(kind, shape, t0, t1, label) {
        const z = { kind, t0, t1, label: label || null };
        if (shape.length === 4) z.rect = shape; else z.circle = shape;
        o.zones.push(z); return api;
      },
      line(from, to, t0, t1, label, color, align) { o.lines.push({ from, to, t0, t1, label: label || null, color: color || null, align: align || null }); return api; },
      label(x, y, text, t0, t1, color, size) { o.labels.push({ x, y, text, t0, t1, color: color || null, size: size || null }); return api; },
      mark(kind, x, y, t0, t1) { o.marks.push({ kind, x, y, t0, t1 }); return api; },
      step(t0, t1, badge, text) { o.steps.push({ t0, t1, badge, text }); return api; },
      done() {
        o.actors.forEach((a) => { if (a.tag == null) delete a.tag; });
        return o;
      }
    };
    return api;
  }

  /* Équipe type : mon équipe A (bleu) attaque vers la droite, adversaire B (rouge). */
  function std(id, title, duration) {
    return Scene(id, title, duration).phased()
      .gka(2, 10).a(5, 10, 10, "Fixo").a(2, 15, 4, "Ala").a(3, 15, 16, "Ala").a(4, 25, 10, "Pivot")
      .gkb(38, 10).b(6, 27, 10).b(7, 23, 5).b(8, 23, 15).b(9, 17, 10);
  }

  return { Scene, std, JT, END };
});
