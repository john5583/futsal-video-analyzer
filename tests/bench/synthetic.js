/* Matchs fabriqués à identités connues : 5 joueurs par équipe qui se regroupent autour d'un ballon (beaucoup de croisements), détectés avec du bruit,
   des détections manquantes, des coupures de 1 à 3 s et des équipes parfois mal lues. Chaque détection garde l'identité réelle (gt).
   Sert à compter exactement ce que la vraie vidéo ne permet pas de compter : échanges de joueurs (confusions) et pistes recréées. */
"use strict";
const T = require("../../src/ai/tracker");

function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.gauss = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return next;
}

const SCENES = {
  calme: { sigma: 0.2, pMiss: 0.05, pBurst: 0, pFlip: 0, pUnk: 0.02 },
  realiste: { sigma: 0.35, pMiss: 0.15, pBurst: 0.004, pFlip: 0.02, pUnk: 0.05 },
  difficile: { sigma: 0.5, pMiss: 0.25, pBurst: 0.01, pFlip: 0.04, pUnk: 0.08 },
  tenuesProches: { sigma: 0.35, pMiss: 0.15, pBurst: 0.004, pFlip: 0.25, pUnk: 0.1 }     // deux équipes en tenues presque identiques : l'équipe est souvent mal lue
};

/* Trajectoires puis détections. opts : { seed, scene, fps, seconds }. Renvoie [{ t, dets: [{ x, y, team, gt }] }] (ordre des détections mélangé). */
function makeMatch(opts) {
  const o = Object.assign({ seed: 1, scene: "realiste", fps: 3, seconds: 120 }, opts), S = SCENES[o.scene];
  const rand = rng(o.seed), obs = rng(o.seed + 1000003);      // deux flux : les trajectoires ne dépendent pas de la cadence ni du bruit de détection
  const L = 40, W = 20, dt = 1 / 30;                                         // les trajectoires vivent à 30 images/s, on échantillonne ensuite
  const players = [];
  for (let k = 0; k < 10; k++) players.push({ gt: k, team: k < 5 ? "A" : "B", x: 5 + rand() * 30, y: 2 + rand() * 16, vx: 0, vy: 0, top: 3 + rand() * 2.5, jit: rand() * 360, off: [rand() * 16 - 8, rand() * 10 - 5], gone: 0 });
  const ball = { x: 20, y: 10, tx: 20, ty: 10 };
  const out = [], every = Math.round(30 / o.fps), steps = Math.round(o.seconds * 30);
  for (let s = 0; s <= steps; s++) {
    const t = s * dt;
    if (s % 90 === 0) { ball.tx = 4 + rand() * 32; ball.ty = 2 + rand() * 16; }
    ball.x += (ball.tx - ball.x) * 0.02; ball.y += (ball.ty - ball.y) * 0.02;
    players.forEach((p) => {
      if (s % 60 === 0) p.jit = rand() * 360;
      const gx = ball.x * 0.5 + 20 * 0.5 + p.off[0] + Math.cos((p.jit * Math.PI) / 180) * 2, gy = ball.y * 0.5 + 10 * 0.5 + p.off[1] + Math.sin((p.jit * Math.PI) / 180) * 2;
      const dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy) || 1, want = Math.min(p.top, d * 1.2);
      p.vx += (((dx / d) * want - p.vx) * 4 * dt); p.vy += (((dy / d) * want - p.vy) * 4 * dt);
      p.x = Math.max(0, Math.min(L, p.x + p.vx * dt)); p.y = Math.max(0, Math.min(W, p.y + p.vy * dt));
    });
    if (s % every) continue;
    const dets = [];
    players.forEach((p) => {
      if (p.gone > 0) { p.gone -= every * dt; return; }
      if (obs() < S.pBurst) { p.gone = 1 + obs() * 2; return; }
      if (obs() < S.pMiss) return;
      const r = obs();
      const team = r < S.pFlip ? (p.team === "A" ? "B" : "A") : r < S.pFlip + S.pUnk ? "UNK" : p.team;
      dets.push({ x: p.x + obs.gauss() * S.sigma, y: p.y + obs.gauss() * S.sigma, team, gt: p.gt });
    });
    for (let i = dets.length - 1; i > 0; i--) { const j = Math.floor(obs() * (i + 1)); [dets[i], dets[j]] = [dets[j], dets[i]]; }
    out.push({ t: Math.round(t * 1000) / 1000, dets });
  }
  return out;
}

/* Passe le match dans le suivi (et, si relink, dans la re-liaison finale du programme) puis compte :
   - swaps : fois où une piste passe d'un joueur réel à un autre (une vraie confusion) ;
   - fragments : identifiants créés en trop (pour chaque joueur réel : identifiants distincts - 1) ;
   - impurity : part des détections dont l'identifiant appartient surtout à un autre joueur réel. */
function evaluate(match, trackerOpts, opts) {
  const o = Object.assign({ relink: true }, opts || {}), tracker = o.trackerFactory ? o.trackerFactory(trackerOpts) : new T.Tracker(trackerOpts);
  const frames = match.map((f) => { const dets = f.dets.map((d) => Object.assign({}, d)); tracker.update(f.t, dets); return { t: f.t, players: dets }; });
  if (o.relink) {
    const teams = T.finalTeams(frames);
    T.relinkTracks(frames, teams, (tm) => tm === "A" || tm === "B");
  }
  const byId = new Map(), byGt = new Map();
  frames.forEach((f) => f.players.forEach((p) => {
    (byId.get(p.id) || byId.set(p.id, []).get(p.id)).push(p.gt);
    (byGt.get(p.gt) || byGt.set(p.gt, new Set()).get(p.gt)).add(p.id);
  }));
  let swaps = 0, impure = 0, total = 0;
  byId.forEach((seq) => {
    const cnt = {};
    seq.forEach((g, i) => { cnt[g] = (cnt[g] || 0) + 1; if (i && g !== seq[i - 1]) swaps++; });
    const best = Math.max(...Object.values(cnt));
    impure += seq.length - best; total += seq.length;
  });
  let fragments = 0;
  byGt.forEach((ids) => { fragments += ids.size - 1; });
  return { swaps, fragments, impurity: total ? impure / total : 0, ids: byId.size, detections: total };
}

module.exports = { makeMatch, evaluate, SCENES };
