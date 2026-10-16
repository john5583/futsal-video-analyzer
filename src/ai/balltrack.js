/* Choix du ballon dans le temps : à chaque image, le détecteur propose plusieurs candidats (coordonnées terrain en
   mètres + score). On retient le chemin le plus cohérent : le ballon ne se téléporte pas (vitesse plafonnée),
   une trajectoire n'est acceptée que si elle contient au moins une détection fiable (score >= STRONG) ; les détections
   faibles ne font que la prolonger (avant ou après), et une détection isolée qui contredit ses voisines est écartée. Aucune position n'est inventée : une image
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

  /* frames : [{ t, bc: [[x, y, score], ...] }] triées par temps. Renvoie, pour chaque image, [x, y, score] ou null.
     Chaque candidat a deux états : s = 1 si la trajectoire qui y mène (depuis son départ) contient une détection fiable,
     s = 0 sinon. Seuls les états s = 1 peuvent être retenus ; un état s = 0 ne sert qu'à relier des détections faibles
     à une détection fiable qui arrive ensuite. */
  function select(frames) {
    const n = frames.length;
    const nodes = frames.map((f) => (Array.isArray(f.bc) ? f.bc : []));
    const best = [0, 1].map(() => nodes.map((c) => c.map(() => -Infinity)));
    const prev = [0, 1].map(() => nodes.map((c) => c.map(() => null)));
    // meilleur total jusqu'à l'image i incluse (avec ou sans ballon retenu), et le nœud (état s = 1) qui le donne
    const upTo = new Array(n).fill(0), upArg = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const before = i > 0 ? upTo[i - 1] : 0, beforeArg = i > 0 ? upArg[i - 1] : null;
      nodes[i].forEach((c, k) => {
        const gain = c[2] - BASE, strong = c[2] >= STRONG;
        // nouveau départ : l'état dépend de cette seule détection
        const s0 = strong ? 1 : 0;
        let v = [-Infinity, -Infinity], from = [null, null];
        v[s0] = before - BREAK + gain; from[s0] = beforeArg ? { restart: beforeArg } : { start: true };
        for (let j = i - 1; j >= 0 && frames[i].t - frames[j].t <= MAX_GAP + 1e-6; j--) {
          const dt = frames[i].t - frames[j].t;
          nodes[j].forEach((p, q) => {
            if (Math.hypot(c[0] - p[0], c[1] - p[1]) > V_MAX * dt + NOISE) return;
            [0, 1].forEach((ps) => {
              if (best[ps][j][q] === -Infinity) return;
              const s = strong ? 1 : ps;
              const w = best[ps][j][q] + LINK - GAP_COST * (i - j - 1) + gain;
              if (w > v[s]) { v[s] = w; from[s] = { node: [j, q, ps] }; }
            });
          });
        }
        [0, 1].forEach((s) => { best[s][i][k] = v[s]; prev[s][i][k] = from[s]; });
      });
      upTo[i] = before; upArg[i] = beforeArg;
      nodes[i].forEach((c, k) => { if (best[1][i][k] > upTo[i]) { upTo[i] = best[1][i][k]; upArg[i] = [i, k, 1]; } });
    }
    const out = new Array(n).fill(null);
    let cur = n ? upArg[n - 1] : null;
    while (cur) {
      const [i, k, s] = cur;
      out[i] = nodes[i][k];
      const p = prev[s][i][k];
      cur = !p || p.start ? null : p.node ? p.node : p.restart;
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
