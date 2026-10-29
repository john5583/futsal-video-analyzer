/* Événements du match proposés à partir de la position du BALLON sur le terrain (mètres, 40 × 20 par défaut) : sortie de balle, but, phase arrêtée, corner, penalty.
   Rien n'est affirmé : ce sont des PROPOSITIONS que l'utilisateur valide en quelques secondes (« Oui » / « Non »). Elles ne valent que ce que valent le terrain et le ballon :
   un ballon mal trouvé ou un terrain faux donnent des propositions fausses, d'où la validation. Si le ballon n'est pas vu, aucun événement n'est proposé (jamais deviné).
   frames : [{ t, ball: { x, y } | null }] triées par temps, déjà dans le sens du terrain de la vidéo ; dirAt(t) : +1 si « Mon équipe » attaque le côté x = L, -1 sinon. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalEvenements = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MARGE = 0.5;            // m : le ballon doit dépasser la ligne de plus que ça (le ballon en l'air se projette un peu au-delà de la ligne)
  const SORTIE_ECHANTILLONS = 3; // images avec ballon dehors, de suite, pour parler de sortie
  const SORTIE_DUREE = 0.4;     // s : durée minimale dehors
  const RETOUR_MAX = 8;         // s : après une sortie, on n'en propose pas une autre avant ce délai
  const ARRET_VITESSE = 0.6;    // m/s : ballon « immobile » en dessous
  const ARRET_DUREE = 2;        // s : durée minimale d'immobilité
  const TROU_MAX = 1.5;         // s : plus de temps que ça sans ballon = on ne relie pas les images
  const POTEAU = 1.5;           // m : demi-largeur du but (3 m)
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function sorties(frames, L, W) {
    const ev = [];
    let run = [], dernier = -99;
    const flush = () => {
      if (run.length >= SORTIE_ECHANTILLONS && run[run.length - 1].t - run[0].t >= SORTIE_DUREE && run[0].t - dernier > RETOUR_MAX) {
        const f = run[0], b = f.ball, depasse = Math.max(-b.x, b.x - L, -b.y, b.y - W);
        const cote = b.y < -MARGE ? "touche_haut" : b.y > W + MARGE ? "touche_bas" : b.x < -MARGE ? "fond_gauche" : "fond_droite";
        ev.push({ t: f.t, cote, x: Math.max(0, Math.min(L, b.x)), y: Math.max(0, Math.min(W, b.y)), depasse, fin: run[run.length - 1].t });
        dernier = f.t;
      }
      run = [];
    };
    let prec = null;
    frames.forEach((f) => {
      const b = f.ball;
      if (!b) return;                                                   // pas de ballon vu : on ne devine pas
      if (prec && f.t - prec.t > TROU_MAX) flush();
      const dehors = b.x < -MARGE || b.x > L + MARGE || b.y < -MARGE || b.y > W + MARGE;
      if (dehors) run.push(f); else flush();
      prec = f;
    });
    flush();
    return ev;
  }

  /* But : sortie par une ligne de fond entre les poteaux (3 m), ballon vu près de la ligne juste avant. */
  function estBut(s, L, W) {
    if (s.cote !== "fond_gauche" && s.cote !== "fond_droite") return false;
    return Math.abs(s.y - W / 2) <= POTEAU + MARGE;
  }

  /* Arrêts : ballon immobile (vitesse faible) pendant au moins ARRET_DUREE, vu sur au moins 3 images. */
  function arrets(frames) {
    const pts = frames.filter((f) => f.ball), out = [];
    let i = 0;
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && pts[j + 1].t - pts[j].t <= TROU_MAX && dist(pts[j + 1].ball, pts[i].ball) <= ARRET_VITESSE * Math.max(0.5, pts[j + 1].t - pts[i].t) + 0.3) j++;
      if (j - i + 1 >= 3 && pts[j].t - pts[i].t >= ARRET_DUREE) { out.push({ t: pts[i].t, fin: pts[j].t, x: pts[i].ball.x, y: pts[i].ball.y }); i = j + 1; } else i++;
    }
    return out;
  }

  function evenements(frames, opts) {
    const o = Object.assign({ L: 40, W: 20, dirAt: () => 1 }, opts || {}), { L, W } = o;
    const fr = (frames || []).filter((f) => f && isFinite(f.t)).sort((a, b) => a.t - b.t), ev = [];
    const so = sorties(fr, L, W);
    so.forEach((s) => {
      if (estBut(s, L, W)) {
        const droite = s.cote === "fond_droite", mien = (o.dirAt(s.t) > 0) === droite;      // « Mon équipe » marque si elle attaque le côté où le ballon est entré
        ev.push({ t: s.t, type: "but", equipe: mien ? "A" : "B", x: s.x, y: s.y, note: "Ballon passé entre les poteaux (à valider)" });
      } else ev.push({ t: s.t, type: s.cote.startsWith("touche") ? "sortie_touche" : "sortie_fond", x: s.x, y: s.y, note: "Ballon sorti par une ligne de " + (s.cote.startsWith("touche") ? "touche" : "fond") + " (à valider)" });
    });
    // un ballon immobile HORS du terrain (après une sortie, dans le but) n'est pas une « phase arrêtée » : le jeu est déjà arrêté par la sortie ou le but
    arrets(fr).filter((a) => a.x >= -0.3 && a.x <= L + 0.3 && a.y >= -0.3 && a.y <= W + 0.3).forEach((a) => {
      const coin = [[0, 0], [L, 0], [0, W], [L, W]].some((c) => Math.hypot(a.x - c[0], a.y - c[1]) <= 1.2);
      const penalty = [6, L - 6].some((px) => Math.hypot(a.x - px, a.y - W / 2) <= 0.8);
      const proche = so.some((s) => a.t >= s.t && a.t - s.fin <= RETOUR_MAX + 4);
      if (coin && proche) ev.push({ t: a.t, type: "corner", x: a.x, y: a.y, note: "Ballon immobile dans un coin après une sortie (à valider)" });
      else if (penalty) ev.push({ t: a.t, type: "penalty", x: a.x, y: a.y, note: "Ballon immobile sur un point de penalty (à valider)" });
      else ev.push({ t: a.t, type: "phase_arretee", x: a.x, y: a.y, note: "Ballon immobile " + Math.round(a.fin - a.t) + " s (coup franc, remise en jeu ou arrêt : à préciser)" });
    });
    return ev.sort((a, b) => a.t - b.t);
  }
  return { evenements, sorties, arrets, MARGE, ARRET_DUREE };
});
