/* Registre des personnes (cahier des charges §2) : à partir des pistes de l'analyse, une FICHE par personne avec son équipe, ses passages sur le terrain,
   son historique d'entrées / sorties, sa taille relative et — plus tard — sa tenue par zones. Deux morceaux de piste ne sont rattachés à la même personne
   que si le rattachement est SANS AMBIGUÏTÉ (un seul candidat possible dans les deux sens, même équipe, vitesse plausible, aucun chevauchement dans le temps).
   Au moindre doute les morceaux restent des personnes séparées marquées « non identifiée » : jamais une fausse étiquette.
   Ce que le registre NE fait PAS (dit franchement) : il ne lit pas les numéros de maillot, ne compare pas d'apparence (les signatures de couleur ne sont pas
   gardées dans l'analyse), et n'a pas été comparé à des fiches faites à la main par John (aucune pour l'instant) : sa justesse est « non évaluée ». */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalRegistre = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MIN_DET = 12;          // une piste de moins de 12 détections n'est pas une personne (bribe)
  const GAP_MAX = 10;          // s : disparition maximale entre deux morceaux d'une même personne
  const VITESSE = 6;           // m/s : vitesse plausible pendant la disparition
  const LONG = 6;              // s : en dessous, une personne vue si peu de temps reste « non identifiée »
  const BORD = 1.2;            // m : une piste qui commence ou finit à moins de cette distance de la ligne de touche ou de but entre / sort par le bord

  function pistes(frames) {
    const m = new Map();
    frames.forEach((f) => f.players.forEach((p) => {
      let s = m.get(p.id);
      if (!s) { s = { id: p.id, team: p.team, n: 0, first: null, last: null, ts: [], hs: [] }; m.set(p.id, s); }
      s.n++; s.ts.push(f.t);
      if (!s.first) s.first = { t: f.t, x: p.x, y: p.y };
      s.last = { t: f.t, x: p.x, y: p.y };
      if (Array.isArray(p.b) && p.b.length === 4 && p.b[3] > p.b[1]) s.hs.push(p.b[3] - p.b[1]);
    }));
    return [...m.values()].filter((s) => s.n >= MIN_DET);
  }
  const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

  /* Candidats de rattachement : fin de a -> début de b. */
  function candidats(P) {
    const c = [];
    P.forEach((a) => P.forEach((b) => {
      if (a === b || a.team !== b.team) return;
      const dt = b.first.t - a.last.t;
      if (dt <= 0 || dt > GAP_MAX) return;
      const d = Math.hypot(b.first.x - a.last.x, b.first.y - a.last.y);
      if (d > VITESSE * dt + 0.5) return;
      c.push({ a, b, d, dt });
    }));
    return c;
  }

  /* opts : { L, W } terrain en mètres (pour reconnaître une entrée / sortie par le bord). Renvoie { personnes, liens, ambigus }. */
  function construire(frames, opts) {
    const o = opts || {}, P = pistes(frames), cand = candidats(P);
    // liens SANS ambiguïté : b n'a qu'un seul prédécesseur possible ET a n'a qu'un seul successeur possible
    const parA = new Map(), parB = new Map();
    cand.forEach((c) => { (parA.get(c.a.id) || parA.set(c.a.id, []).get(c.a.id)).push(c); (parB.get(c.b.id) || parB.set(c.b.id, []).get(c.b.id)).push(c); });
    const liens = [], ambigus = [], pere = new Map();
    const racine = (id) => { while (pere.has(id)) id = pere.get(id); return id; };
    cand.forEach((c) => {
      const ok = parA.get(c.a.id).length === 1 && parB.get(c.b.id).length === 1;
      if (!ok) { ambigus.push({ de: c.a.id, vers: c.b.id, raison: parA.get(c.a.id).length > 1 ? "plusieurs suites possibles" : "plusieurs débuts possibles" }); return; }
      if (racine(c.a.id) === racine(c.b.id)) return;
      pere.set(c.b.id, c.a.id);
      liens.push({ de: c.a.id, vers: c.b.id, ecartS: Math.round(c.dt * 10) / 10, distanceM: Math.round(c.d * 10) / 10 });
    });
    const groupes = new Map();
    P.forEach((p) => { const r = racine(p.id); (groupes.get(r) || groupes.set(r, []).get(r)).push(p); });
    const tailleEquipe = {};
    P.forEach((p) => { (tailleEquipe[p.team] = tailleEquipe[p.team] || []).push(...p.hs); });
    const refTaille = {}; Object.keys(tailleEquipe).forEach((t) => { refTaille[t] = med(tailleEquipe[t]); });
    const ambigusIds = new Set(); ambigus.forEach((x) => { ambigusIds.add(x.de); ambigusIds.add(x.vers); });
    const personnes = [...groupes.values()].map((g, i) => {
      g.sort((a, b) => a.first.t - b.first.t);
      const intervalles = g.map((s) => [Math.round(s.first.t * 10) / 10, Math.round(s.last.t * 10) / 10]);
      const duree = g.reduce((a, s) => a + (s.last.t - s.first.t), 0), h = med([].concat(...g.map((s) => s.hs)));
      const histo = [];
      g.forEach((s, k) => {
        const bord = (pt) => o.L && o.W && (Math.min(pt.x, o.L - pt.x, pt.y, o.W - pt.y) <= BORD);
        histo.push({ t: intervalles[k][0], evt: k === 0 ? "apparait" : "reapparait", source: k === 0 ? (bord(s.first) ? "bord du terrain" : "au milieu du terrain") : "reprise de la piste " + g[k - 1].id });
        histo.push({ t: intervalles[k][1], evt: "disparait", source: bord(s.last) ? "bord du terrain" : "au milieu du terrain" });
      });
      const doute = g.some((s) => ambigusIds.has(s.id)) || duree < LONG;
      return {
        id: "P" + (i + 1), equipe: g[0].team, pistes: g.map((s) => s.id), intervalles, presenceS: Math.round(duree * 10) / 10,
        tailleRelative: h && refTaille[g[0].team] ? Math.round((h / refTaille[g[0].team]) * 100) / 100 : null,
        tenue: null, numero: null, historique: histo,
        statut: doute ? "non identifiée" : g.length > 1 ? "probable" : "sûre",
        raison: doute ? (duree < LONG ? "vue moins de " + LONG + " s" : "plusieurs rattachements possibles : je ne choisis pas") : null
      };
    }).sort((a, b) => a.intervalles[0][0] - b.intervalles[0][0]).map((p, i) => Object.assign(p, { id: "P" + (i + 1) }));
    return { personnes, liens, ambigus, resume: resume(personnes) };
  }
  function resume(pers) {
    const c = { total: pers.length, sures: 0, probables: 0, nonIdentifiees: 0 };
    pers.forEach((p) => { if (p.statut === "sûre") c.sures++; else if (p.statut === "probable") c.probables++; else c.nonIdentifiees++; });
    return c;
  }
  return { construire, resume, MIN_DET, GAP_MAX };
});
