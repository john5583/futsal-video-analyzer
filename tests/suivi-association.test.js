/* Suivi des joueurs : association globale (hongroise) + prévision du mouvement. Vérifié sur des cas construits à la main et sur des matchs fabriqués
   à identités connues (tests/bench/synthetic.js) : on compte les échanges de joueurs et les pistes recréées. */
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/ai/tracker");
const Syn = require("./bench/synthetic");

/* ---------- affectation globale ---------- */
const sum = (cost, m) => m.reduce((s, p) => s + cost[p.ti][p.di], 0);

test("affectation : le choix global bat « la paire la plus proche d'abord »", () => {
  // piste 0 : 1,0 de la détection 0 et 1,1 de la détection 1 ; piste 1 : 1,05 de la détection 0 seulement
  const cost = [[1.0, 1.1], [1.05, Infinity]];
  const m = T.assign(cost, 2, 2, 5, 5);
  assert.equal(m.length, 2, "les deux pistes sont reliées");
  assert.ok(Math.abs(sum(cost, m) - 2.15) < 1e-9, "coût total minimal : " + sum(cost, m));
  assert.deepEqual(m.map((p) => [p.ti, p.di]).sort(), [[0, 1], [1, 0]]);
});

test("affectation : paires interdites jamais retenues, tailles différentes, entrées vides", () => {
  assert.deepEqual(T.assign([], 0, 0, 5, 5), []);
  assert.deepEqual(T.assign([], 0, 3, 5, 5), []);
  assert.deepEqual(T.assign([[], []], 2, 0, 5, 5), []);
  const forbidden = T.assign([[Infinity, Infinity]], 1, 2, 5, 5);
  assert.deepEqual(forbidden, [], "aucune paire autorisée : aucune liaison");
  const more = T.assign([[2, 1, 9]], 1, 3, 5, 5);
  assert.deepEqual(more.map((p) => p.di), [1], "une seule piste : la détection la moins chère");
});

test("affectation : trop cher = on ne relie pas (la détection devient une nouvelle piste)", () => {
  const m = T.assign([[20]], 1, 1, 4, 4);          // relier coûte 20 ; ne pas relier coûte 4 + 4
  assert.deepEqual(m, []);
  assert.equal(T.assign([[3]], 1, 1, 4, 4).length, 1);
});

test("affectation : coût de piste manquante propre à chaque piste", () => {
  // piste 0 ancienne (laisser sans détection coûte 30) : elle retrouve sa détection lointaine ; piste 1 récente (coût 2) : non
  const cost = [[15, Infinity], [Infinity, 15]];
  const m = T.assign(cost, 2, 2, [30, 2], 4);
  assert.deepEqual(m.map((p) => p.ti), [0]);
});

/* ---------- suivi : cas construits ---------- */
const det = (x, y, team) => ({ x, y, team: team || "A", box: [0, 0, 1, 1], conf: 0.9 });
function run(opts, steps) {
  const tr = new T.Tracker(opts), ids = [];
  steps.forEach((pts, i) => { const d = pts.map(([x, y]) => det(x, y)); tr.update(i * 0.33, d); ids.push(d.map((q) => q.id)); });
  return ids;
}

test("suivi : deux joueurs qui se croisent gardent leur identité grâce à la prévision du mouvement", () => {
  // A va vers la droite, B vers la gauche, 0,6 m par image (1,8 m/s) ; ils se croisent à 0,2 m l'un de l'autre
  const steps = [];
  for (let i = 0; i < 10; i++) steps.push([[5 + 0.6 * i, 10], [8 - 0.6 * i, 10.2]]);
  const ids = run({ method: "optimal" }, steps);
  ids.forEach((r, i) => assert.deepEqual(r, [1, 2], "image " + i));
  const old = run({ method: "greedy" }, steps);
  assert.ok(old.some((r) => r[0] !== 1 || r[1] !== 2), "cas témoin : l'ancienne méthode échange les deux joueurs");
});

/* Copie figée de l'ancien suivi (avant l'association globale) : sert de référence pour prouver que le comportement par défaut n'a pas changé. */
function legacyTracker(opts) {
  const o = Object.assign({ maxSpeed: 9, maxMissed: 3, soft: 0 }, opts || {}), tracks = [];
  let nextId = 1;
  const compat = (a, b) => a === "UNK" || b === "UNK" || a === b;
  const best = (votes, fb) => { let r = fb, bv = 0; Object.keys(votes).forEach((k) => { if (votes[k] > bv) { bv = votes[k]; r = k; } }); return r; };
  return { update(t, dets) {
    const live = tracks.filter((tr) => t - tr.lastT <= o.maxMissed), soft = o.soft > 0 ? o.soft : 0, pairs = [];
    live.forEach((tr, ti) => {
      const dt = Math.max(0.05, t - tr.lastT), px = tr.x + tr.vx * dt * 0.5, py = tr.y + tr.vy * dt * 0.5, gate = o.maxSpeed * dt + 1;
      dets.forEach((d, di) => {
        const ok = compat(tr.team, d.team);
        if (!ok && !soft) return;
        const dd = Math.hypot(d.x - px, d.y - py);
        if (dd > gate) return;
        pairs.push({ ti, di, cost: dd + (ok ? (tr.team !== d.team ? 1.5 : 0) : soft) });
      });
    });
    pairs.sort((a, b) => a.cost - b.cost);
    const uT = new Set(), uD = new Set();
    pairs.forEach((p) => {
      if (uT.has(p.ti) || uD.has(p.di)) return;
      uT.add(p.ti); uD.add(p.di);
      const tr = live[p.ti], d = dets[p.di], dt = Math.max(0.05, t - tr.lastT);
      tr.vx = (d.x - tr.x) / dt * 0.6 + tr.vx * 0.4; tr.vy = (d.y - tr.y) / dt * 0.6 + tr.vy * 0.4;
      tr.x = d.x; tr.y = d.y; tr.lastT = t; tr.n += 1;
      if (d.team !== "UNK") { if (soft) Object.keys(tr.votes).forEach((k) => { tr.votes[k] *= 0.9; }); tr.votes[d.team] = (tr.votes[d.team] || 0) + 1; }
      tr.team = best(tr.votes, tr.team); d.id = tr.id;
    });
    dets.forEach((d, di) => {
      if (uD.has(di)) return;
      const tr = { id: nextId++, team: d.team, x: d.x, y: d.y, vx: 0, vy: 0, lastT: t, n: 1, votes: {} };
      if (d.team !== "UNK") tr.votes[d.team] = 1;
      tracks.push(tr); d.id = tr.id;
    });
    tracks.splice(0, tracks.length, ...tracks.filter((tr) => t - tr.lastT <= o.maxMissed || tr.n >= 3));
    return dets;
  } };
}

test("suivi : par défaut (et avec soft), les identités sont exactement celles de l'ancien suivi", () => {
  [{}, { soft: 2 }].forEach((opts) => [1, 2, 3, 4].forEach((seed) => ["calme", "realiste", "difficile", "tenuesProches"].forEach((scene) => {
    const a = new T.Tracker(opts), b = legacyTracker(opts);
    Syn.makeMatch({ seed, scene, fps: 3, seconds: 60 }).forEach((f) => {
      const da = f.dets.map((x) => Object.assign({}, x)), db = f.dets.map((x) => Object.assign({}, x));
      a.update(f.t, da); b.update(f.t, db);
      assert.deepEqual(da.map((x) => x.id), db.map((x) => x.id), "soft=" + (opts.soft || 0) + " " + scene + " seed " + seed + " t=" + f.t);
    });
  })));
});

test("suivi : une piste qui disparaît 2 s retrouve son joueur ; une détection lointaine et soudaine reste une nouvelle piste", () => {
  const tr = new T.Tracker({ method: "optimal" });
  const a = [det(10, 10)]; tr.update(0, a);
  const b = [det(10.5, 10)]; tr.update(0.33, b);
  const c = [det(12, 10)]; tr.update(2.3, c);                    // 2 s sans détection, 1,5 m plus loin : même joueur
  assert.equal(c[0].id, a[0].id);
  const far = [det(35, 3)]; tr.update(2.63, far);                 // 30 m en 0,33 s : impossible
  assert.notEqual(far[0].id, a[0].id);
});

test("suivi : une même piste n'apparaît jamais deux fois sur une image, ni une détection deux fois", () => {
  ["greedy", "optimal"].forEach((method) => [1, 2, 3].forEach((seed) => ["calme", "realiste", "difficile", "tenuesProches"].forEach((scene) => {
    const tr = new T.Tracker({ method: method });
    Syn.makeMatch({ seed, scene, fps: 3, seconds: 60 }).forEach((f) => {
      const d = f.dets.map((x) => Object.assign({}, x)); tr.update(f.t, d);
      const ids = d.map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length, scene + " seed " + seed + " t=" + f.t);
      assert.ok(ids.every((x) => Number.isInteger(x) && x > 0));
    });
  })));
});

/* ---------- matchs fabriqués (graines 101 à 110 : jamais utilisées pour choisir les réglages) ---------- */
const seeds = Array.from({ length: 10 }, (_v, i) => 101 + i);
const total = (scene, opts) => seeds.reduce((acc, sd) => {
  const r = Syn.evaluate(Syn.makeMatch({ seed: sd, scene, fps: 3, seconds: 120 }), opts);
  acc.swaps += r.swaps; acc.fragments += r.fragments; return acc;
}, { swaps: 0, fragments: 0 });

test("matchs fabriqués : moins d'échanges de joueurs qu'avant, sans plus de pistes recréées", () => {
  ["calme", "realiste"].forEach((scene) => {
    const old = total(scene, { method: "greedy" }), neu = total(scene, { method: "optimal" });
    assert.ok(neu.swaps < old.swaps, scene + " : échanges " + old.swaps + " -> " + neu.swaps);
    assert.ok(neu.fragments <= old.fragments * 1.1, scene + " : pistes recréées " + old.fragments + " -> " + neu.fragments);
  });
});

test("matchs fabriqués difficiles : jamais pire qu'avant (marge de 3 %)", () => {
  const old = total("difficile", { method: "greedy" }), neu = total("difficile", { method: "optimal" });
  assert.ok(neu.swaps <= old.swaps * 1.03, "échanges " + old.swaps + " -> " + neu.swaps);
  assert.ok(neu.fragments <= old.fragments * 1.1, "pistes recréées " + old.fragments + " -> " + neu.fragments);
});

/* ---------- re-liaison ---------- */
function framesOf(spans) {
  // spans : [{ id, t0, t1, x0, y0, vx }] -> images toutes les 0,33 s
  const times = new Set();
  spans.forEach((s) => { for (let t = s.t0; t <= s.t1 + 1e-9; t += 1 / 3) times.add(Math.round(t * 100) / 100); });
  return [...times].sort((a, b) => a - b).map((t) => ({ t, players: spans.filter((s) => t >= s.t0 - 1e-9 && t <= s.t1 + 1e-9).map((s) => ({ id: s.id, team: "A", x: s.x0 + s.vx * (t - s.t0), y: s.y0 })) }));
}
const A = () => true;

test("re-liaison : par défaut, comportement inchangé (trou de 1 s au plus)", () => {
  const f = framesOf([{ id: 1, t0: 0, t1: 3, x0: 10, y0: 5, vx: 2 }, { id: 2, t0: 3.7, t1: 6, x0: 16.5, y0: 5, vx: 2 }]);
  assert.equal(T.relinkTracks(f, { 1: "A", 2: "A" }, A), 1);
  const g = framesOf([{ id: 1, t0: 0, t1: 3, x0: 10, y0: 5, vx: 2 }, { id: 2, t0: 5, t1: 8, x0: 22, y0: 5, vx: 2 }]);
  assert.equal(T.relinkTracks(g, { 1: "A", 2: "A" }, A), 0, "trou de 2 s : pas relié par défaut");
});

/* ---------- filtre de Kalman (analyse continue) ---------- */
test("Kalman : deux joueurs qui se croisent gardent leur identité, à 3 comme à 30 images/s", () => {
  [3, 30].forEach((fps) => {
    const dt = 1 / fps, n = Math.round(3 * fps), tr = new T.Tracker({ method: "kalman" }), ids = [];
    for (let i = 0; i < n; i++) {
      const t = i * dt, d = [det(10 + 2 * t, 10), det(16 - 2 * t, 10.3)];       // A vers la droite, B vers la gauche, 2 m/s, ils se croisent à 0,3 m
      tr.update(t, d); ids.push(d.map((q) => q.id));
    }
    ids.forEach((r, i) => assert.deepEqual(r, [1, 2], fps + " im/s, image " + i));
  });
});

test("Kalman : une piste qui disparaît 2 s retrouve son joueur ; une détection impossible reste une nouvelle piste", () => {
  const tr = new T.Tracker({ method: "kalman" });
  const a = [det(10, 10)]; tr.update(0, a);
  const b = [det(10.4, 10)]; tr.update(0.33, b);
  const c = [det(12, 10)]; tr.update(2.3, c);
  assert.equal(c[0].id, a[0].id);
  const far = [det(35, 3)]; tr.update(2.63, far);
  assert.notEqual(far[0].id, a[0].id);
});

test("Kalman : la méthode par défaut reste l'ancienne ; Kalman n'est actif que sur demande", () => {
  assert.equal(new T.Tracker().opts.method === "kalman", false);
  const steps = [[[5, 5], [20, 12]], [[5.5, 5], [20.4, 12]], [[6, 5.1], [20.9, 12.1]]];
  assert.deepEqual(run({}, steps), run({ method: "greedy" }, steps));
});

test("Kalman : jamais deux fois la même piste sur une image, ni aux cadences extrêmes", () => {
  [3, 10, 30].forEach((fps) => ["realiste", "tenuesProches"].forEach((scene) => {
    const tr = new T.Tracker({ method: "kalman", soft: scene === "tenuesProches" ? 2 : 0 });
    Syn.makeMatch({ seed: 5, scene, fps, seconds: 30 }).forEach((f) => {
      const d = f.dets.map((x) => Object.assign({}, x)); tr.update(f.t, d);
      const ids = d.map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length, scene + " " + fps + " im/s t=" + f.t);
    });
  }));
});

/* graines 101 à 110 : jamais utilisées pour choisir les réglages */
function totalAt(scene, fps, opts) {
  return seeds.reduce((acc, sd) => {
    const r = Syn.evaluate(Syn.makeMatch({ seed: sd, scene, fps, seconds: 90 }), opts);
    acc.swaps += r.swaps; acc.fragments += r.fragments; acc.impurity += r.impurity / seeds.length; return acc;
  }, { swaps: 0, fragments: 0, impurity: 0 });
}
test("matchs fabriqués : Kalman fait mieux que l'ancien suivi à 30 images/s (impureté, échanges)", () => {
  ["realiste", "tenuesProches"].forEach((scene) => {
    const soft = scene === "tenuesProches" ? 2 : 0;
    const old = totalAt(scene, 30, { method: "greedy", soft }), kal = totalAt(scene, 30, { method: "kalman", soft });
    assert.ok(kal.impurity < old.impurity, scene + " : impureté " + (old.impurity * 100).toFixed(1) + " % -> " + (kal.impurity * 100).toFixed(1) + " %");
    assert.ok(kal.swaps < old.swaps, scene + " : échanges " + old.swaps + " -> " + kal.swaps);
  });
});

test("matchs fabriqués : Kalman jamais pire que l'ancien suivi à 3 images/s (marge de 5 %)", () => {
  ["realiste", "tenuesProches"].forEach((scene) => {
    const soft = scene === "tenuesProches" ? 2 : 0;
    const old = totalAt(scene, 3, { method: "greedy", soft }), kal = totalAt(scene, 3, { method: "kalman", soft });
    assert.ok(kal.swaps <= old.swaps * 1.05, scene + " : échanges " + old.swaps + " -> " + kal.swaps);
    assert.ok(kal.fragments <= old.fragments * 1.1, scene + " : pistes recréées " + old.fragments + " -> " + kal.fragments);
  });
});
