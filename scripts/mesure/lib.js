/* Mesure du programme contre les étiquettes de John (menu Étiquetage). Fonctions pures, sans écran : voir docs/definition-mesure.md.
   Entrées :
   - `etiq` : fichier d'étiquettes (src/ai/labelStore.js) ;
   - `frames` : images de l'analyse décompactées (FutsalPipeline.expandFrames) ; ball en mètres, joueurs avec cadre `b` en pour-mille de l'image ;
   - `video` : { vw, vh }.
   Rien n'est deviné : ce qui ne peut pas être mesuré est rendu avec `evalue: false` et sa raison. */
"use strict";
const HG = require("../../src/ai/homography");

const TOL_BALL_PX = 20;            // échelle : grand côté de l'image = 1920 px
const IOU_MIN = 0.5;
const MIN_H_FRAC = 0.03;           // un cadre de moins de 3 % de la hauteur n'est ni trouvé ni manqué
const T_APPARIE = 0.2;             // image de l'analyse la plus proche d'une image étiquetée (s)
const TEAM_ANALYSE = { A: "A", B: "B", a: "GKA", b: "GKB" };
const JOUEURS = { A: 1, B: 1, GKA: 1, GKB: 1 };

/* Intervalle de Wilson à 95 % pour k réussites sur n. */
function wilson(k, n) {
  if (!(n > 0)) return { p: null, bas: null, haut: null, k, n };
  const z = 1.959964, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { p, bas: Math.max(0, (c - m) / d), haut: Math.min(1, (c + m) / d), k, n };
}
const pct = (x) => (x == null ? null : Math.round(x * 1000) / 10);
const rendu = (w) => ({ k: w.k, n: w.n, pct: pct(w.p), bas: pct(w.bas), haut: pct(w.haut) });

/* Image de l'analyse la plus proche de t (secondes), ou null si plus loin que maxGap. */
function proche(frames, t, maxGap) {
  let lo = 0, hi = frames.length - 1;
  if (!frames.length) return null;
  while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < t) lo = m + 1; else hi = m; }
  let best = frames[lo];
  if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(best.t - t)) best = frames[lo - 1];
  return Math.abs(best.t - t) <= (maxGap == null ? T_APPARIE : maxGap) ? best : null;
}

/* Position du ballon de l'analyse en pixels de la vidéo (la matrice h de l'image est normalisée : pixels / taille -> mètres). */
function ballPixel(f, video, calibs) {
  if (!f || !f.ball) return null;
  let H = Array.isArray(f.h) && f.h.length === 9 ? f.h : null, norm = true;
  if (!H && Array.isArray(calibs) && calibs.length) { const c = calibs.reduce((a, b) => (Math.abs(b.t - f.t) < Math.abs(a.t - f.t) ? b : a)); if (Array.isArray(c.H) && c.H.length === 9) { H = c.H; norm = false; } }
  if (!H) return null;
  try {
    const q = HG.apply(HG.invert(H), f.ball.x, f.ball.y);
    if (!isFinite(q[0]) || !isFinite(q[1])) return null;
    return norm ? [q[0] * video.vw, q[1] * video.vh] : [q[0], q[1]];
  } catch (_e) { return null; }
}

const boxPx = (b, video) => [b[0] * video.vw / 1000, b[1] * video.vh / 1000, b[2] * video.vw / 1000, b[3] * video.vh / 1000];
function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1), u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i;
  return u > 0 ? i / u : 0;
}

/* ---- Ballon ---- */
function mesureBallon(etiq, frames, video, calibs, opts) {
  const tol = TOL_BALL_PX * Math.max(video.vw, video.vh) / 1920 * ((opts && opts.echelle) || 1);
  let vus = 0, trouves = 0, affiches = 0, fauxAffiches = 0, aucun = 0, fauxSurAucun = 0, incertains = 0, sansAnalyse = 0;
  const manques = [];
  Object.keys(etiq.frames || {}).forEach((ms) => {
    const L = etiq.frames[ms].ball; if (!L) return;
    const f = proche(frames, Number(ms) / 1000), p = f ? ballPixel(f, video, calibs) : null;
    if (L.state === "incertain") { incertains++; return; }
    if (L.state === "vu") {
      vus++;
      if (!f) sansAnalyse++;
      if (p) { affiches++; if (Math.hypot(p[0] - L.u, p[1] - L.v) <= tol) trouves++; else fauxAffiches++; } else manques.push(Number(ms) / 1000);
    } else if (L.state === "aucun") { aucun++; if (p) { affiches++; fauxAffiches++; fauxSurAucun++; } }
  });
  const rappel = wilson(trouves, vus), faux = wilson(fauxAffiches, affiches), fauxAucun = wilson(fauxSurAucun, aucun);
  const limites = affiches > 0 || aucun > 0 ? (faux.haut == null || faux.p <= 0.03) && (fauxAucun.p == null || fauxAucun.p <= 0.03) : null;
  return {
    composant: "ballon", evalue: vus > 0, raison: vus > 0 ? null : "aucune image avec ballon visible étiquetée",
    rappel: rendu(rappel), fauxParmiAffiches: rendu(faux), fauxSurImagesSansBallon: rendu(fauxAucun), incertains, imagesSansAnalyse: sansAnalyse,
    score: rappel.p == null ? null : pct(rappel.p), limitesFauxBallons3pc: limites,
    atteint: rappel.bas != null && rappel.bas >= 0.93 && limites === true && vus >= 600 && aucun >= 100,
    reserve: vus < 600 || aucun < 100 ? "effectif insuffisant pour prouver 95 % (il faut 600 images avec ballon et 100 sans)" : null,
    tolerancePx: Math.round(tol * 10) / 10, manques: manques.slice(0, 20)
  };
}

/* ---- Joueurs, équipes, identités ---- */
function apparie(labels, dets, video) {
  const paires = [];
  labels.forEach((l, i) => dets.forEach((d, j) => { const v = iou(l.px, d.px); if (v >= IOU_MIN) paires.push([v, i, j]); }));
  paires.sort((a, b) => b[0] - a[0]);
  const ul = new Set(), ud = new Set(), res = [];
  paires.forEach(([v, i, j]) => { if (ul.has(i) || ud.has(j)) return; ul.add(i); ud.add(j); res.push({ i, j, iou: v }); });
  return res;
}

function mesureJoueurs(etiq, frames, video) {
  let nLab = 0, trouves = 0, nDet = 0, nFausses = 0, equipeJuste = 0, equipeFausse = 0, equipeInconnue = 0, imagesMesurees = 0;
  const fausses = { BANC: 0, PUBLIC: 0, ARB: 0, AUTRE: 0, rien: 0 };
  const pistes = {};      // who -> [{ms, id}]
  const parPiste = {};    // id de piste -> Set de personnes
  Object.keys(etiq.frames || {}).forEach((ms) => {
    const F = etiq.frames[ms]; if (!F.playersDone) return;
    const f = proche(frames, Number(ms) / 1000); if (!f) return;
    imagesMesurees++;
    const tous = (F.boxes || []).map((b) => ({ b, px: [b.x1, b.y1, b.x2, b.y2] }));
    const labels = tous.filter((x) => JOUEURS[x.b.team] && (x.b.y2 - x.b.y1) >= MIN_H_FRAC * video.vh);
    const dets = f.players.filter((p) => Array.isArray(p.b) && p.b.length === 4).map((p) => ({ p, px: boxPx(p.b, video) }));
    const m = apparie(labels, dets, video);
    nLab += labels.length; trouves += m.length;
    const prises = new Set(m.map((x) => x.j));
    m.forEach((x) => {
      const eq = TEAM_ANALYSE[dets[x.j].p.team];
      if (!eq) equipeInconnue++; else if (eq === labels[x.i].b.team) equipeJuste++; else equipeFausse++;
      const who = labels[x.i].b.who;
      if (who) { (pistes[who] = pistes[who] || []).push({ ms: Number(ms), id: dets[x.j].p.id }); const s = (parPiste[dets[x.j].p.id] = parPiste[dets[x.j].p.id] || new Set()); s.add(who); }
    });
    dets.forEach((d, j) => {
      if (prises.has(j)) return;
      nDet++;
      const autre = tous.filter((x) => !JOUEURS[x.b.team]).map((x) => [iou(x.px, d.px), x.b.team]).sort((a, b) => b[0] - a[0])[0];
      const tj = labels.map((x) => iou(x.px, d.px)).sort((a, b) => b - a)[0] || 0;
      nFausses++;
      if (autre && autre[0] >= IOU_MIN && autre[0] > tj) fausses[autre[1]] = (fausses[autre[1]] || 0) + 1; else fausses.rien++;
    });
    nDet += m.length;      // détections gardées au total (appariées + fausses)
  });
  const rappel = wilson(trouves, nLab), precision = wilson(nDet - nFausses, nDet), eqAff = equipeJuste + equipeFausse;
  const equipes = wilson(equipeJuste, eqAff);
  // continuité des pistes
  let imagesAvecPiste = 0, imagesPersonne = 0, changements = 0;
  Object.keys(pistes).forEach((who) => {
    const seq = pistes[who].sort((a, b) => a.ms - b.ms), freq = {};
    seq.forEach((s) => { freq[s.id] = (freq[s.id] || 0) + 1; });
    const principale = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
    imagesPersonne += seq.length; imagesAvecPiste += freq[principale];
    for (let i = 1; i < seq.length; i++) if (seq[i].id !== seq[i - 1].id) changements++;
  });
  const fusions = Object.keys(parPiste).filter((id) => parPiste[id].size > 1).length;
  const continuite = wilson(imagesAvecPiste, imagesPersonne);
  return {
    detection: { composant: "joueurs (détection)", evalue: nLab > 0, raison: nLab > 0 ? null : "aucune image avec « image terminée » étiquetée", imagesMesurees, personnesEtiquetees: nLab, rappel: rendu(rappel), precision: rendu(precision), fausses, score: rappel.p == null ? null : pct(rappel.p), atteint: rappel.bas != null && rappel.bas >= 0.93, reserve: nLab < 400 ? "moins de 400 personnes cadrées : intervalle trop large pour prouver 95 %" : null },
    equipes: { composant: "équipes affichées", evalue: eqAff > 0, raison: eqAff > 0 ? null : "aucun joueur trouvé", justes: equipeJuste, fausses: equipeFausse, inconnues: equipeInconnue, justesParmiAffichees: rendu(equipes), score: equipes.p == null ? null : pct(equipes.p), atteint: equipes.bas != null && equipes.bas >= 0.93, reserve: eqAff < 400 ? "moins de 400 équipes comparées" : null },
    identites: { composant: "identité gardée (continuité de piste)", evalue: imagesPersonne > 0, raison: imagesPersonne > 0 ? null : "aucun cadre rattaché à une fiche (« Qui est-ce ? ») sur les images trouvées", imagesPersonne, continuite: rendu(continuite), changementsDePiste: changements, fusions, score: continuite.p == null ? null : pct(continuite.p), atteint: continuite.bas != null && continuite.bas >= 0.93 && fusions === 0, reserve: "mesure de la piste du programme ; les vraies identités affichées (chantier 3) seront mesurées autrement" }
  };
}

/* ---- Entrées depuis le banc ---- */
function mesureEntrees(etiq, frames, video) {
  const entrees = (etiq.subs || []).filter((s) => s.sens === "entre");
  if (!entrees.length) return { composant: "entrées depuis le banc", evalue: false, raison: "aucun changement étiqueté", score: null };
  let ok = 0, mesurees = 0;
  entrees.forEach((s) => {
    const cible = Object.keys(etiq.frames || {}).map(Number).filter((ms) => ms >= s.ms + 3000).sort((a, b) => a - b).find((ms) => (etiq.frames[ms].boxes || []).some((b) => b.who === s.who && JOUEURS[b.team]));
    if (cible == null) return;
    mesurees++;
    const F = etiq.frames[cible], b = F.boxes.find((x) => x.who === s.who && JOUEURS[x.team]), f = proche(frames, cible / 1000);
    if (!f) return;
    const px = [b.x1, b.y1, b.x2, b.y2], det = f.players.filter((p) => Array.isArray(p.b) && p.b.length === 4).map((p) => ({ p, v: iou(px, boxPx(p.b, video)) })).sort((x, y) => y.v - x.v)[0];
    if (det && det.v >= IOU_MIN && TEAM_ANALYSE[det.p.team] === b.team) ok++;
  });
  const w = wilson(ok, mesurees);
  return { composant: "entrées depuis le banc", evalue: mesurees > 0, raison: mesurees > 0 ? null : "aucune entrée avec cadre étiqueté 3 s après", entreesEtiquetees: entrees.length, reconnues: rendu(w), score: w.p == null ? null : pct(w.p), atteint: false, reserve: "très peu de changements sur une courte vidéo : intervalle trop large pour conclure" };
}

/* ---- Contrôle rapide (verdicts de John sur ce que le programme affiche) : ctrl = [{ t, comp, v: "oui"|"non"|"incertain" }] ---- */
function mesureControle(ctrl) {
  const out = {};
  const comps = Array.from(new Set((ctrl || []).map((c) => c.comp)));
  comps.forEach((comp) => {
    const l = ctrl.filter((c) => c.comp === comp), oui = l.filter((c) => c.v === "oui").length, non = l.filter((c) => c.v === "non").length, inc = l.filter((c) => c.v === "incertain").length;
    const w = wilson(oui, oui + non);
    out[comp] = { composant: "contrôle rapide : " + comp, evalue: oui + non > 0, raison: oui + non > 0 ? null : "aucun verdict", oui, non, incertains: inc, justes: rendu(w), score: w.p == null ? null : pct(w.p), atteint: w.bas != null && w.bas >= 0.93 && oui + non >= 100, reserve: oui + non < 100 ? "moins de 100 verdicts" : null };
  });
  return out;
}

module.exports = { wilson, proche, ballPixel, iou, boxPx, mesureBallon, mesureJoueurs, mesureEntrees, mesureControle, TOL_BALL_PX, IOU_MIN };
