/* Choix du ballon dans le temps : à chaque image, le détecteur propose plusieurs candidats (coordonnées terrain en
   mètres + score). On retient le chemin le plus cohérent : le ballon ne se téléporte pas (vitesse plafonnée),
   les détections fiables sont préférées, une détection faible n'est gardée que si elle prolonge une trajectoire,
   et une détection isolée qui contredit ses voisines est écartée. Aucune position n'est inventée : une image
   sans candidat retenu reste sans ballon. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalBallTrack = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const V_MAX = 25;          // m/s : vitesse maximale du ballon
  const NOISE = 1.5;         // m : imprécision d'une position (ballon en l'air projeté au sol, détection décalée)
  const MAX_GAP = 1.0;       // s : au-delà, deux détections ne sont plus reliées
  const STRONG = 0.2;        // score à partir duquel une détection est fiable seule
  const BASE = 0.12;         // valeur d'un candidat = score - BASE (un candidat faible isolé coûte plus qu'il ne rapporte)
  const LINK = 0.1;          // bonus d'une liaison cohérente entre deux images
  const GAP_COST = 0.05;     // par image sautée
  const BREAK = 0.5;         // coût d'un nouveau départ (trajectoire sans lien avec la précédente)

  /* frames : [{ t, bc: [[x, y, score], ...] }] triées par temps. Renvoie, pour chaque image, [x, y, score] ou null. */
  function select(frames) {
    const n = frames.length;
    const nodes = frames.map((f) => (Array.isArray(f.bc) ? f.bc : []));
    const best = nodes.map((c) => c.map(() => -Infinity));
    const prev = nodes.map((c) => c.map(() => null));
    // meilleur total jusqu'à l'image i incluse (avec ou sans ballon), et le nœud qui le donne
    const upTo = new Array(n).fill(0), upArg = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const before = i > 0 ? upTo[i - 1] : 0, beforeArg = i > 0 ? upArg[i - 1] : null;
      nodes[i].forEach((c, k) => {
        const gain = c[2] - BASE;
        let v = before - BREAK + gain, from = beforeArg ? { restart: beforeArg } : null;
        for (let j = i - 1; j >= 0 && frames[i].t - frames[j].t <= MAX_GAP + 1e-6; j--) {
          const dt = frames[i].t - frames[j].t;
          nodes[j].forEach((p, q) => {
            if (best[j][q] === -Infinity) return;
            if (Math.hypot(c[0] - p[0], c[1] - p[1]) > V_MAX * dt + NOISE) return;
            const w = best[j][q] + LINK - GAP_COST * (i - j - 1) + gain;
            if (w > v) { v = w; from = { node: [j, q] }; }
          });
        }
        best[i][k] = v; prev[i][k] = from;
      });
      upTo[i] = before; upArg[i] = beforeArg;
      nodes[i].forEach((c, k) => { if (best[i][k] > upTo[i]) { upTo[i] = best[i][k]; upArg[i] = [i, k]; } });
    }
    const out = new Array(n).fill(null);
    let cur = n ? upArg[n - 1] : null;
    while (cur) {
      const [i, k] = cur;
      out[i] = nodes[i][k];
      const p = prev[i][k];
      cur = !p ? null : p.node ? p.node : p.restart;
    }
    return out;
  }

  /* Remplace le ballon de chaque image par le choix cohérent quand les candidats sont connus (f.bc), puis retire f.bc.
     Les images d'anciennes analyses (sans f.bc) ne sont pas modifiées. */
  function apply(frames) {
    const withC = frames.filter((f) => Array.isArray(f.bc));
    if (!withC.length) return frames;
    const pick = select(withC);
    withC.forEach((f, i) => {
      f.ball = pick[i] ? { x: pick[i][0], y: pick[i][1] } : null;
      delete f.bc;
    });
    return frames;
  }

  return { select, apply, V_MAX, STRONG };
});
