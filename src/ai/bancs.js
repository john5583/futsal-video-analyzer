/* Bancs de remplaçants reconnus par le programme, fiches d'apparence des personnes assises au banc, entrées de remplaçants (pur, sans écran).
   Les images de l'analyse portent, en plus des joueurs, une liste `bn` : les personnes vues hors du terrain près d'une ligne de touche
   et les joueurs vus près d'une ligne de touche, avec leur place sur le terrain et une signature d'apparence (maillot, short, chaussettes).
   Format d'une entrée de bn : [genre, x, y, assis, sig]  (genre 0 = hors terrain, 1 = sur le terrain ; assis 0/1 ; sig = 9 nombres Lab ou null).
   - detecterBancs : zones de banc (personnes ASSISES, présentes longtemps, au même endroit à plusieurs moments) ; rien n'est affirmé si ce n'est pas net.
   - fiches : une fiche d'apparence par personne vue au banc (« remplaçant A », « remplaçant B »…), sans identité devinée ; John peut la nommer.
   - changements : à chaque entrée sur le terrain près d'un banc, rapprochement avec les fiches ; la sortie du joueur remplacé est « observée » si on la voit,
     sinon « non vue » (jamais inventée) ; une ressemblance trop forte entre deux fiches donne une question, pas une décision. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalBancs = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PROFONDEUR = 7;        // m : au-delà de la ligne de touche, on cherche des personnes de banc jusqu'ici
  const DEBUT_PROF = 0.3;      // m : en deçà, la personne est sur la ligne
  const BORD_TERRAIN = 4;      // m : joueurs « près d'une ligne de touche » (signature gardée pour reconnaître une entrée)
  const BIN = 5;               // s : durée d'un créneau de présence
  const PRESENCE_MIN = 6;      // créneaux (30 s) où quelqu'un est assis au même endroit, au minimum
  const LARGEUR_MIN = 1.2, LARGEUR_MAX = 12;       // m : largeur plausible d'une zone de banc
  const ECART_COHERENT_X = 3, ECART_COHERENT_D = 2;   // m : écart maximal entre les positions du banc à des moments différents
  const PARTS = [0, 3, 6], POIDS = [1, 0.7, 0.6];     // maillot, short, chaussettes dans sig
  const MEME = 14;             // écart de signature en dessous duquel deux lectures sont la même personne (voir signature.js : ~18 pour une même personne mal lue)
  const FICHE_MEME = 10;       // écart en dessous duquel deux lectures au banc sont rangées dans la même fiche (plus strict que MEME : on préfère deux fiches proches à une fiche fusionnée à tort)
  const MARGE = 6;             // la 2e fiche doit être au moins 6 plus loin que la 1re, sinon « se ressemblent trop »
  const FICHE_MIN_OBS = 8;     // lectures minimales pour garder une fiche
  const ZONE_ENTREE = 3.5;     // m : une entrée / sortie se fait à moins de 3,5 m de la ligne de touche du banc
  const VU_AVANT = 20;         // s : un remplaçant a été vu assis au banc (à moins de 4 m de son entrée) dans les 20 s avant d'entrer ; sinon ce n'est pas une entrée de banc
  const FRAGMENT_S = 3, FRAGMENT_M = 3;   // une piste qui commence à moins de 3 s et 3 m de la fin d'une piste de la même équipe est le même joueur recollé, pas une entrée
  const FENETRE_SORTIE = 25;   // s : la sortie du remplacé est cherchée autour de l'entrée du remplaçant

  const median = (a) => { const s = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : null; };
  const r1 = (v) => Math.round(v * 10) / 10;

  /* Signature de signature.js (objets Lab) -> 9 nombres ; null si le maillot et une autre partie ne sont pas lus. */
  function aplatir(sig) {
    if (!sig || !sig.shirt) return null;
    const out = [];
    ["shirt", "shorts", "socks"].forEach((k) => { const v = sig[k]; if (v) out.push(Math.round(v[0]), Math.round(v[1]), Math.round(v[2])); else out.push(null, null, null); });
    return out.slice(3).some((v) => v != null) ? out : null;
  }
  /* Écart moyen pondéré (Lab) sur les parties lues des deux côtés ; null si moins de deux parties communes (maillot compris). */
  function distance(a, b) {
    if (!a || !b) return null;
    let s = 0, w = 0, n = 0, shirt = false;
    PARTS.forEach((p, i) => {
      if (a[p] == null || b[p] == null) return;
      s += Math.hypot(a[p] - b[p], a[p + 1] - b[p + 1], a[p + 2] - b[p + 2]) * POIDS[i]; w += POIDS[i]; n++; if (i === 0) shirt = true;
    });
    return n >= 2 && shirt ? s / w : null;
  }
  function moyenne(sigs) {
    const out = [];
    for (let i = 0; i < 9; i++) { const m = median(sigs.map((s) => s[i])); out.push(m == null ? null : Math.round(m)); }
    return out;
  }

  /* Observations de toutes les images. */
  function observations(frames) {
    const off = [], bord = [];
    (frames || []).forEach((f) => (f.bn || []).forEach((e) => {
      if (!Array.isArray(e) || e.length < 4) return;
      const o = { t: f.t, x: e[1], y: e[2], a: e[3] ? 1 : 0, sig: Array.isArray(e[4]) ? e[4] : null, k: typeof e[5] === "string" ? e[5] : null };
      (e[0] === 0 ? off : bord).push(o);
    }));
    return { off, bord };
  }

  /* Distance à la ligne de touche (m, positive hors du terrain) et côté : "y0" (y < 0) ou "yW" (y > W). */
  function cote(y, W) { return y < 0 ? { c: "y0", d: -y } : y > W ? { c: "yW", d: y - W } : null; }

  /* Zones de banc. opts : { L, W }. Rend { bancs: [{ id, cote, x0, x1, d0, d1, presence, personnes, assis, instants, coherent, sur, raison }], notes } */
  function detecterBancs(frames, opts) {
    const L = opts.L, W = opts.W, notes = [], { off } = observations(frames);
    const bancs = [];
    if (!frames || !frames.length) return { bancs, notes };
    const tMin = frames[0].t, tMax = frames[frames.length - 1].t;
    ["y0", "yW"].forEach((c) => {
      let obs = off.filter((o) => { const q = cote(o.y, W); return q && q.c === c && q.d >= DEBUT_PROF && q.d <= PROFONDEUR && o.x >= -2 && o.x <= L + 2 && o.a; });
      // personnes assises dont la tenue est celle d'une des deux équipes : très probablement des remplaçants ou du staff (pas des spectateurs). Si on en a assez, on ne cherche le banc que parmi elles.
      const tenue = obs.filter((o) => o.k);
      const parTenue = tenue.length >= 30;
      if (parTenue) obs = tenue;
      if (obs.length < 20) return;
      // présence par cellule de 1 m : créneaux de 5 s où une personne ASSISE y est
      const N = Math.ceil(L) + 4, pres = Array.from({ length: N }, () => new Set());
      obs.forEach((o) => { const i = Math.min(N - 1, Math.max(0, Math.floor(o.x + 2))); pres[i].add(Math.floor((o.t - tMin) / BIN)); });
      const lisse = pres.map((_s, i) => { const u = new Set(); for (let k = Math.max(0, i - 1); k <= Math.min(N - 1, i + 1); k++) pres[k].forEach((b) => u.add(b)); return u.size; });
      const top = Math.max.apply(null, lisse), seuil = Math.max(PRESENCE_MIN, 0.25 * top);
      let i = 0;
      while (i < N) {
        if (lisse[i] < seuil) { i++; continue; }
        let j = i; while (j + 1 < N && lisse[j + 1] >= seuil) j++;
        const x0 = i - 2 - 0.5, x1 = j - 2 + 1.5;
        const dans = obs.filter((o) => o.x >= x0 && o.x <= x1);
        const bins = new Set(dans.map((o) => Math.floor((o.t - tMin) / BIN)));
        if (x1 - x0 >= LARGEUR_MIN && dans.length >= 20 && bins.size >= PRESENCE_MIN) {
          const ds = dans.map((o) => cote(o.y, W).d);
          // cohérence : la position du banc à 4 moments de la vidéo
          const inst = [];
          for (let q = 0; q < 4; q++) {
            const a = tMin + ((tMax - tMin) * q) / 4, b = tMin + ((tMax - tMin) * (q + 1)) / 4, seg = dans.filter((o) => o.t >= a && o.t < b + (q === 3 ? 1 : 0));
            if (seg.length >= 10) inst.push({ t: Math.round((a + b) / 2), x: r1(median(seg.map((o) => o.x))), d: r1(median(seg.map((o) => cote(o.y, W).d))), n: seg.length });
          }
          const cohX = inst.length ? Math.max.apply(null, inst.map((s) => s.x)) - Math.min.apply(null, inst.map((s) => s.x)) : 0;
          const cohD = inst.length ? Math.max.apply(null, inst.map((s) => s.d)) - Math.min.apply(null, inst.map((s) => s.d)) : 0;
          const coherent = inst.length >= 2 && cohX <= ECART_COHERENT_X && cohD <= ECART_COHERENT_D;
          const larg = x1 - x0, plausible = larg <= LARGEUR_MAX;
          const sur = coherent && plausible && bins.size >= 3 * PRESENCE_MIN;
          const raison = sur ? "" : !plausible ? "zone très large (" + r1(larg) + " m) : plusieurs bancs ou spectateurs assis ?" : inst.length < 2 ? "vue à un seul moment de la vidéo" : !coherent ? "la position change d'un moment à l'autre (" + r1(cohX) + " m) : caméra qui dérive ou personnes qui bougent" : "vue trop peu de temps";
          bancs.push({ _bins: bins, cote: c, x0: r1(x0), x1: r1(x1), d0: r1(pct(ds, 0.05)), d1: r1(pct(ds, 0.95)), tenue: parTenue, presence: bins.size, personnes: r1(dans.length / bins.size / (BIN * 3)), assis: dans.length, instants: inst, coherent, sur, raison });
        }
        i = j + 1;
      }
    });
    // deux zones du même côté occupées à des moments DIFFÉRENTS (peu de moments en commun) : le même banc vu à deux endroits (caméra qui dérive) ou deux groupes ? Rien n'est affirmé.
    bancs.forEach((a) => bancs.forEach((b) => {
      if (a === b || a.cote !== b.cote) return;
      let commun = 0; a._bins.forEach((k) => { if (b._bins.has(k)) commun++; });
      if (commun < 0.2 * Math.min(a._bins.size, b._bins.size)) { a.sur = false; a.raison = a.raison || "une autre zone du même côté est occupée à d'autres moments : le banc a-t-il changé de place (caméra qui dérive) ?"; }
    }));
    bancs.forEach((b) => { delete b._bins; });
    bancs.sort((a, b) => b.presence - a.presence);
    bancs.splice(2);                                   // deux bancs au plus
    bancs.sort((a, b) => (a.cote === b.cote ? a.x0 - b.x0 : a.cote < b.cote ? -1 : 1));
    bancs.forEach((b, k) => { b.id = "B" + (k + 1); });
    if (!bancs.length) notes.push("Aucun banc reconnu : pas assez de personnes assises hors du terrain, présentes longtemps au même endroit.");
    else if (bancs.length === 1) notes.push("Un seul banc reconnu : l'autre est peut-être hors du champ de la caméra.");
    return { bancs, notes };
  }

  /* Fiches d'apparence des personnes vues au banc (lectures près de la zone, assises ou debout). Une fiche = une apparence, jamais une identité. */
  function fiches(frames, bancs, opts) {
    const W = opts.W, { off } = observations(frames), out = [];
    const nom = (k) => "remplaçant " + String.fromCharCode(65 + (k % 26)) + (k >= 26 ? Math.floor(k / 26) : "");
    const old = (opts.anciennes || []);
    (bancs || []).forEach((b) => {
      const obs = off.filter((o) => { const q = cote(o.y, W); return q && q.c === b.cote && q.d <= PROFONDEUR && o.x >= b.x0 - 1.5 && o.x <= b.x1 + 1.5 && o.sig; }).sort((a, c) => a.t - c.t);
      const groupes = [];
      obs.forEach((o) => {
        let best = null;
        groupes.forEach((g) => { const d = distance(g.sig, o.sig); if (d != null && d <= FICHE_MEME && (!best || d < best.d)) best = { g, d }; });
        if (best) { best.g.obs.push(o); best.g.n++; best.g.t1 = o.t; if (best.g.n % 5 === 0) best.g.sig = moyenne(best.g.obs.map((q) => q.sig)); }
        else groupes.push({ banc: b.id, sig: o.sig, obs: [o], n: 1, t0: o.t, t1: o.t });
      });
      groupes.filter((g) => g.n >= FICHE_MIN_OBS).forEach((g) => {
        const sig = moyenne(g.obs.map((q) => q.sig));
        // la fiche garde le nom donné par John si une fiche déjà présente dans le projet a la même apparence
        const dejaVue = old.map((f) => ({ f, d: distance(f.sig, sig) })).filter((x) => x.d != null && x.d <= MEME).sort((a, c) => a.d - c.d)[0];
        out.push({ id: dejaVue ? dejaVue.f.id : null, nom: dejaVue ? dejaVue.f.nom : null, banc: b.id, sig, n: g.n, t0: Math.round(g.t0), t1: Math.round(g.t1), assis: Math.round((100 * g.obs.filter((q) => q.a).length) / g.n) / 100 });
      });
    });
    let k = 0; const pris = new Set(out.map((f) => f.id).filter(Boolean));
    out.forEach((f) => { if (f.id) return; do { k++; } while (pris.has("R" + k)); f.id = "R" + k; pris.add(f.id); });
    out.forEach((f) => { f.libelle = f.nom || nom(Number(f.id.slice(1)) - 1); });
    // ressemblances trop fortes : signalées, jamais tranchées
    out.forEach((f) => { f.proches = out.filter((g) => g !== f && (distance(f.sig, g.sig) != null) && distance(f.sig, g.sig) < MEME + MARGE).map((g) => g.id); });
    return out;
  }

  /* Pistes (images finales) : première et dernière apparition, équipe, lectures de signature près des lignes de touche. */
  function pistes(frames) {
    const m = new Map();
    frames.forEach((f) => {
      (f.players || []).forEach((p) => {
        let s = m.get(p.id); if (!s) { s = { id: p.id, equipes: {}, premier: [f.t, p.x, p.y], dernier: [f.t, p.x, p.y], n: 0, sigs: [] }; m.set(p.id, s); }
        s.dernier = [f.t, p.x, p.y]; s.n++; s.equipes[p.team] = (s.equipes[p.team] || 0) + 1;
      });
      (f.bn || []).forEach((e) => {
        if (e[0] !== 1 || !Array.isArray(e[4])) return;
        const p = (f.players || []).find((q) => Math.abs(q.x - e[1]) <= 0.02 && Math.abs(q.y - e[2]) <= 0.02);
        if (p && m.has(p.id)) m.get(p.id).sigs.push({ t: f.t, sig: e[4] });
      });
    });
    m.forEach((s) => { s.equipe = Object.keys(s.equipes).sort((a, b) => s.equipes[b] - s.equipes[a])[0]; });
    return [...m.values()];
  }

  /* Entrées de remplaçants près d'un banc. Rend { changements, questions }.
     changement : { t, banc, equipe, entrant: { piste, fiche, libelle, statut: "reconnu" | "ambigu" | "inconnu" | "illisible", candidats, ecart },
                    sortant: { piste, statut: "observée" | "non vue" | "ambigu", candidats } } */
  function changements(frames, bancs, listeFiches, opts) {
    const W = opts.W, t0 = frames.length ? frames[0].t : 0, t1 = frames.length ? frames[frames.length - 1].t : 0, ps = pistes(frames);
    const res = [], questions = [];
    const { off } = observations(frames);
    const prochedeLigne = (x, y, b) => { const d = b.cote === "y0" ? y : W - y; return d <= ZONE_ENTREE && d >= -1.5 && x >= b.x0 - 6 && x <= b.x1 + 6; };
    (bancs || []).filter((b) => b.sur || b.confirme).forEach((b) => {
      const offB = off.filter((o) => { const q = cote(o.y, W); return q && q.c === b.cote && q.d <= PROFONDEUR && o.sig; });
      ps.filter((p) => p.n >= 6 && p.premier[0] > t0 + 1 && prochedeLigne(p.premier[1], p.premier[2], b)).forEach((p) => {
        // même joueur recollé après une disparition courte ? alors ce n'est pas une entrée
        if (ps.some((q) => q.id !== p.id && q.equipe === p.equipe && p.premier[0] - q.dernier[0] >= 0 && p.premier[0] - q.dernier[0] <= FRAGMENT_S && Math.hypot(p.premier[1] - q.dernier[1], p.premier[2] - q.dernier[2]) <= FRAGMENT_M)) return;
        // personnes vues assises au banc juste avant, près de l'entrée : seules leurs fiches sont candidates
        const avant = offB.filter((o) => o.t >= p.premier[0] - VU_AVANT && o.t <= p.premier[0] && Math.abs(o.x - p.premier[1]) <= 4);
        if (!avant.length) return;
        const candidates = (listeFiches || []).filter((f) => avant.some((o) => { const d = distance(f.sig, o.sig); return d != null && d <= MEME; }));
        const lect = p.sigs.filter((s) => s.t <= p.premier[0] + 3).map((s) => s.sig);
        const sig = lect.length >= 2 ? moyenne(lect) : null;
        const e = { piste: p.id, fiche: null, libelle: null, statut: "illisible", candidats: [], ecart: null };
        if (sig) {
          const rang = candidates.map((f) => ({ f, d: distance(f.sig, sig) })).filter((x) => x.d != null).sort((a, c) => a.d - c.d);
          if (!rang.length || rang[0].d > MEME) { e.statut = "inconnu"; e.candidats = rang.slice(0, 2).map((x) => x.f.id); e.ecart = rang.length ? r1(rang[0].d) : null; }
          else if (rang[1] && rang[1].d - rang[0].d < MARGE) { e.statut = "ambigu"; e.candidats = rang.slice(0, 2).map((x) => x.f.id); e.ecart = r1(rang[0].d); }
          else { e.statut = "reconnu"; e.fiche = rang[0].f.id; e.libelle = rang[0].f.libelle; e.ecart = r1(rang[0].d); }
        }
        // sortant : piste de la même équipe qui finit près de la même ligne autour de l'entrée
        const sortants = ps.filter((q) => q.id !== p.id && q.equipe === p.equipe && q.dernier[0] < t1 - 1 && Math.abs(q.dernier[0] - p.premier[0]) <= FENETRE_SORTIE && prochedeLigne(q.dernier[1], q.dernier[2], b));
        const s = sortants.length === 1 ? { piste: sortants[0].id, statut: "observée", candidats: [] } : sortants.length > 1 ? { piste: null, statut: "ambigu", candidats: sortants.map((q) => q.id) } : { piste: null, statut: "non vue", candidats: [] };
        const ch = { t: Math.round(p.premier[0] * 10) / 10, banc: b.id, equipe: p.equipe, entrant: e, sortant: s };
        res.push(ch);
        if (e.statut === "ambigu" || e.statut === "inconnu") questions.push({ kind: "qui", t: ch.t, banc: b.id, candidats: e.candidats, piste: p.id });
        if (s.statut === "ambigu") questions.push({ kind: "sortant", t: ch.t, banc: b.id, candidats: s.candidats });
      });
    });
    res.sort((a, c) => a.t - c.t);
    return { changements: res, questions };
  }

  /* Tout en un, pour l'analyse. Rend { bancs, fiches, changements, questions, notes } ou null s'il n'y a pas d'images. */
  function analyser(frames, opts) {
    if (!frames || !frames.length) return null;
    const d = detecterBancs(frames, opts);
    // décisions de John (« oui c'est un banc » / « non ») gardées dans le projet : retrouvées par le côté et la place
    (opts.decisions || []).forEach((dc) => {
      const b = d.bancs.find((q) => q.cote === dc.cote && Math.abs((q.x0 + q.x1) / 2 - dc.x) <= 3);
      if (b) { if (dc.oui) b.confirme = true; else b.refuse = true; }
    });
    d.bancs = d.bancs.filter((b) => !b.refuse);
    const fi = fiches(frames, d.bancs, opts), ch = changements(frames, d.bancs, fi, opts);
    return { bancs: d.bancs, fiches: fi, changements: ch.changements, questions: ch.questions, notes: d.notes };
  }

  return { aplatir, distance, moyenne, observations, detecterBancs, fiches, pistes, changements, analyser, MEME, MARGE, PROFONDEUR, BORD_TERRAIN, DEBUT_PROF_OFF: DEBUT_PROF };
});
