/* Banc d'essai : mesures calculées sur le résultat d'une analyse (images du projet), sans rien demander à l'utilisateur.
   Fonctions pures : une entrée vide donne des mesures vides, jamais d'exception. Aucun seuil de « réussite » ici :
   on mesure, on compare avant / après, on ne décide pas à la place de John. */
"use strict";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const round = (v, d) => (v == null || !isFinite(v) ? null : Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0));
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
const asc = (arr) => arr.slice().sort((a, b) => a - b);
const frameList = (frames) => (Array.isArray(frames) ? frames.filter((f) => f && typeof f.t === "number" && Array.isArray(f.players)) : []);

/* Couverture : part du temps réellement analysée. ai = project.ai (calibrations, lost, settings, context...). */
function coverage(ai, frames) {
  const a = ai || {}, s = a.settings || {}, fr = frameList(frames);
  const rangeSec = num(s.t1) > num(s.t0) ? num(s.t1) - num(s.t0) : (fr.length > 1 ? fr[fr.length - 1].t - fr[0].t : 0);
  const lostSec = Math.min(rangeSec, (Array.isArray(a.lost) ? a.lost : []).reduce((t, r) => t + (Array.isArray(r) ? Math.max(0, num(r[1]) - num(r[0])) : 0), 0));
  const rel = a.context && a.context.reliable ? a.context.reliable : null;
  const expected = num(s.fps) > 0 && rangeSec > 0 ? rangeSec * num(s.fps) : 0;
  return {
    rangeSec: round(rangeSec, 1), lostSec: round(lostSec, 1), lostRatio: rangeSec > 0 ? round(lostSec / rangeSec, 3) : null,
    reliableRatio: rel ? round(num(rel.ratio), 3) : null, reliableSec: rel ? round(num(rel.sec), 1) : null,
    imagesKept: fr.length, imagesExpected: round(expected, 0), keptRatio: expected > 0 ? round(fr.length / expected, 3) : null
  };
}

/* Fragmentation des pistes d'une équipe : un joueur qui reste le même garde le même identifiant. S'il y a beaucoup plus
   d'identifiants que de joueurs attendus, les joueurs sont perdus puis re-créés (indice indirect, pas la preuve d'une confusion). */
function trackStats(frames, team, expected) {
  const fr = frameList(frames), tracks = new Map();
  let t0 = null, t1 = null, perFrame = 0, nFrames = 0;
  fr.forEach((f) => {
    if (t0 == null) t0 = f.t;
    t1 = f.t;
    let c = 0;
    f.players.forEach((p) => {
      if (p.team !== team) return;
      c++;
      const k = tracks.get(p.id) || { first: f.t, last: f.t, n: 0 };
      k.last = f.t; k.n++; tracks.set(p.id, k);
    });
    perFrame += c; nFrames++;
  });
  const durs = asc([...tracks.values()].map((k) => k.last - k.first));
  const span = t1 != null && t0 != null ? t1 - t0 : 0;
  const births = [...tracks.values()].filter((k) => k.first - t0 > 2).length;     // pistes qui naissent après le départ
  const exp = expected || 5;
  return {
    team, ids: tracks.size, expected: exp, idsPerExpected: tracks.size ? round(tracks.size / exp, 2) : null,
    meanVisible: nFrames ? round(perFrame / nFrames, 2) : null,
    medianTrackSec: round(percentile(durs, 50), 1), p90TrackSec: round(percentile(durs, 90), 1),
    shortShare: tracks.size ? round(durs.filter((d) => d < 2).length / tracks.size, 3) : null,
    birthsPerMin: span > 0 ? round(births / (span / 60), 2) : null
  };
}

/* Plausibilité physique des déplacements des joueurs : vitesses et accélérations entre images voisines (dt <= maxGap).
   Les repères 9 m/s (plafond du suivi) et 6 m/s² sont des ordres de grandeur, pas des lois : on rapporte les parts, sans verdict. */
const SPEED_REF = 9, ACCEL_REF = 6;
function physics(frames, maxGap) {
  const gap = maxGap || 1, last = new Map(), speeds = [], accels = [];
  frameList(frames).forEach((f) => {
    f.players.forEach((p) => {
      if (!["A", "B", "GKA", "GKB"].includes(p.team)) return;
      const q = last.get(p.id);
      if (q && f.t > q.t && f.t - q.t <= gap) {
        const dt = f.t - q.t, v = Math.hypot(p.x - q.x, p.y - q.y) / dt;
        speeds.push(v);
        if (q.v != null) accels.push(Math.abs(v - q.v) / ((dt + q.dt) / 2));
        last.set(p.id, { t: f.t, x: p.x, y: p.y, v, dt });
      } else last.set(p.id, { t: f.t, x: p.x, y: p.y, v: null, dt: 0 });
    });
  });
  const s = asc(speeds), a = asc(accels);
  return {
    samples: s.length, speedP50: round(percentile(s, 50), 2), speedP95: round(percentile(s, 95), 2), speedMax: round(percentile(s, 100), 2),
    overSpeedRef: s.length ? round(s.filter((v) => v > SPEED_REF).length / s.length, 4) : null,
    accelP95: round(percentile(a, 95), 2), overAccelRef: a.length ? round(a.filter((v) => v > ACCEL_REF).length / a.length, 4) : null
  };
}

/* Ballon retenu : part des images avec un ballon, vitesses entre images voisines (au-delà de ~30 m/s : peu plausible pour un ballon de futsal). */
const BALL_SPEED_REF = 30;
function ballStats(frames, maxGap) {
  const gap = maxGap || 1, fr = frameList(frames), speeds = [];
  let withBall = 0, prev = null;
  fr.forEach((f) => {
    if (!f.ball) { prev = null; return; }
    withBall++;
    if (prev && f.t > prev.t && f.t - prev.t <= gap) speeds.push(Math.hypot(f.ball.x - prev.x, f.ball.y - prev.y) / (f.t - prev.t));
    prev = { t: f.t, x: f.ball.x, y: f.ball.y };
  });
  const s = asc(speeds);
  return {
    images: fr.length, withBall, withBallRatio: fr.length ? round(withBall / fr.length, 3) : null,
    speedP50: round(percentile(s, 50), 2), speedP95: round(percentile(s, 95), 2), speedMax: round(percentile(s, 100), 2),
    overSpeedRef: s.length ? round(s.filter((v) => v > BALL_SPEED_REF).length / s.length, 4) : null
  };
}

/* Image la plus proche d'un instant, dans la limite maxGap ; null sinon. */
function nearest(fr, t, maxGap) {
  let best = null, bd = Infinity;
  fr.forEach((f) => { const d = Math.abs(f.t - t); if (d < bd) { bd = d; best = f; } });
  return best && bd <= maxGap ? best : null;
}
/* Projette un point d'image normalisé (u, v dans 0..1) sur le terrain avec l'homographie normalisée h de l'image (9 nombres). */
function toCourt(h, u, v) {
  if (!Array.isArray(h) || h.length !== 9) return null;
  const w = h[6] * u + h[7] * v + h[8];
  if (!isFinite(w) || Math.abs(w) < 1e-12) return null;
  const x = (h[0] * u + h[1] * v + h[2]) / w, y = (h[3] * u + h[4] * v + h[5]) / w;
  return isFinite(x) && isFinite(y) ? [x, y] : null;
}

/* Rappel du ballon sur des images étiquetées par l'utilisateur. labels : [{ t (s), ball: { u, v } | null }] (null = « aucun ballon »).
   Une étiquette est retrouvée si le ballon retenu est à moins de `radius` mètres de l'étiquette, projetée sur le terrain.
   Les étiquettes sans image analysée proche (ou sans homographie) sont comptées à part : elles ne comptent ni pour ni contre. */
function ballRecall(frames, labels, opts) {
  const o = Object.assign({ radius: 1, maxGap: 0.2 }, opts || {}), fr = frameList(frames);
  const out = { labelled: 0, withBall: 0, found: 0, nearMiss: 0, missed: 0, noBallLabels: 0, falsePositives: 0, skipped: 0 };
  (Array.isArray(labels) ? labels : []).forEach((l) => {
    const f = l && typeof l.t === "number" ? nearest(fr, l.t, o.maxGap) : null;
    if (!f) { out.skipped++; return; }
    if (!l.ball) { out.noBallLabels++; if (f.ball) out.falsePositives++; out.labelled++; return; }
    const c = toCourt(f.h, l.ball.u, l.ball.v);
    if (!c) { out.skipped++; return; }
    out.labelled++; out.withBall++;
    if (!f.ball) out.missed++;
    else if (Math.hypot(f.ball.x - c[0], f.ball.y - c[1]) <= o.radius) out.found++;
    else out.nearMiss++;
  });
  out.recall = out.withBall ? round(out.found / out.withBall, 3) : null;
  out.falsePositiveRatio = out.noBallLabels ? round(out.falsePositives / out.noBallLabels, 3) : null;
  return out;
}

/* Étiquettes au format YOLO (une ligne « classe cx cy w h » normalisée par image, nom « balle_<millisecondes> ») -> [{ t, ball }]. */
function parseYoloLabels(files) {
  return (Array.isArray(files) ? files : []).map((f) => {
    const m = /(\d+)\.txt$/i.exec(f && f.name ? f.name : "");
    if (!m) return null;
    const line = String(f.text || "").split(/\r?\n/).map((s) => s.trim().split(/\s+/).map(Number)).find((p) => p.length >= 5 && p.every(Number.isFinite));
    return { t: Number(m[1]) / 1000, ball: line ? { u: line[1], v: line[2] } : null };
  }).filter(Boolean);
}

/* Toutes les mesures d'une analyse. ai = project.ai ; frames = images décompressées ; opts.labels = étiquettes du ballon (facultatif). */
function summarize(ai, frames, opts) {
  const o = opts || {}, out = {
    coverage: coverage(ai, frames),
    tracksA: trackStats(frames, "A", 5), tracksB: trackStats(frames, "B", 5),
    physics: physics(frames), ball: ballStats(frames)
  };
  if (Array.isArray(o.labels) && o.labels.length) out.ballRecall = ballRecall(frames, o.labels, o.recall);
  return out;
}

/* Tableau lisible en français. */
const pct = (v) => (v == null ? "n.d." : Math.round(v * 1000) / 10 + " %");
const val = (v, unit) => (v == null ? "n.d." : v + (unit ? " " + unit : ""));
function table(name, s) {
  const c = s.coverage, L = [];
  L.push("== " + name);
  L.push("Couverture : " + val(c.rangeSec, "s") + " analysés sur la plage, caméra perdue " + val(c.lostSec, "s") + " (" + pct(c.lostRatio) + "), jeu fiable " + pct(c.reliableRatio) + ", images gardées " + c.imagesKept + " sur " + val(c.imagesExpected) + " attendues.");
  [s.tracksA, s.tracksB].forEach((t) => L.push("Pistes équipe " + t.team + " : " + t.ids + " identifiants pour " + t.expected + " joueurs attendus (x" + val(t.idsPerExpected) + "), " + val(t.meanVisible) + " visibles en moyenne, piste médiane " + val(t.medianTrackSec, "s") + ", " + pct(t.shortShare) + " de pistes < 2 s, " + val(t.birthsPerMin) + " nouvelles pistes / min."));
  const p = s.physics;
  L.push("Déplacements : vitesse médiane " + val(p.speedP50, "m/s") + ", p95 " + val(p.speedP95, "m/s") + ", max " + val(p.speedMax, "m/s") + ", " + pct(p.overSpeedRef) + " au-dessus de " + SPEED_REF + " m/s ; accélération p95 " + val(p.accelP95, "m/s²") + ", " + pct(p.overAccelRef) + " au-dessus de " + ACCEL_REF + " m/s².");
  const b = s.ball;
  L.push("Ballon retenu : " + pct(b.withBallRatio) + " des images, vitesse p95 " + val(b.speedP95, "m/s") + ", max " + val(b.speedMax, "m/s") + ", " + pct(b.overSpeedRef) + " au-dessus de " + BALL_SPEED_REF + " m/s.");
  if (s.ballRecall) {
    const r = s.ballRecall;
    L.push("Ballon sur étiquettes : " + r.found + " retrouvés sur " + r.withBall + " (rappel " + pct(r.recall) + "), " + r.nearMiss + " trop loin, " + r.missed + " non retenus ; fausses détections sur « aucun ballon » : " + r.falsePositives + " / " + r.noBallLabels + " ; " + r.skipped + " étiquettes sans image analysée.");
  }
  return L.join("\n");
}

/* Comparaison avant / après de deux résumés (summarize). Pour chaque mesure : sens « mieux » (+1 : plus haut, -1 : plus bas) ;
   on indique seulement mieux / moins bien / identique, sans seuil : c'est à John de juger si l'écart compte. */
const KEYS = [
  ["coverage.lostRatio", "Caméra perdue (part du temps)", -1], ["coverage.reliableRatio", "Jeu fiable (part du temps)", 1],
  ["tracksA.idsPerExpected", "Identifiants / joueurs, équipe A", -1], ["tracksB.idsPerExpected", "Identifiants / joueurs, équipe B", -1],
  ["tracksA.medianTrackSec", "Piste médiane, équipe A (s)", 1], ["tracksB.medianTrackSec", "Piste médiane, équipe B (s)", 1],
  ["tracksA.shortShare", "Pistes < 2 s, équipe A", -1], ["tracksB.shortShare", "Pistes < 2 s, équipe B", -1],
  ["physics.overSpeedRef", "Joueurs au-dessus de 9 m/s", -1], ["ball.withBallRatio", "Ballon retenu (part des images)", 1],
  ["ball.overSpeedRef", "Ballon au-dessus de 30 m/s", -1], ["ballRecall.recall", "Rappel du ballon sur étiquettes", 1]
];
const dig = (o, path) => path.split(".").reduce((x, k) => (x == null ? null : x[k]), o);
function compare(avant, apres) {
  return KEYS.map(([path, label, better]) => {
    const a = dig(avant, path), b = dig(apres, path);
    let verdict = "non comparable";
    if (a != null && b != null) verdict = b === a ? "identique" : (b - a) * better > 0 ? "mieux" : "moins bien";
    return { mesure: label, avant: a, apres: b, verdict };
  });
}
function compareTable(avant, apres) {
  return compare(avant, apres).map((r) => r.mesure + " : " + val(r.avant) + " -> " + val(r.apres) + " (" + r.verdict + ")").join("\n");
}

module.exports = { compare, compareTable, percentile, coverage, trackStats, physics, ballStats, ballRecall, parseYoloLabels, toCourt, summarize, table, SPEED_REF, ACCEL_REF, BALL_SPEED_REF };
