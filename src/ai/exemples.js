/* Exemples d'identification accumulés PAR PROJET (pur, sans écran).
   Chaque échantillon de tenue (maillot, short, chaussettes, liseré) porte : un numéro, l'instant de la vidéo, la vidéo et la façon dont il a été
   donné. Ils restent dans a.kits du projet (jamais d'un match à l'autre). Un échantillon d'un ancien projet (sans instant) reste lisible :
   son instant est « inconnu ».
   - etat : « assez d'exemples » ou « il en faut plus » par catégorie (seuils proposés, non réglés sur un match).
   - contradictions : deux exemples presque identiques donnés à deux catégories différentes ; exemple très éloigné des autres de sa catégorie.
   - refs : références pour l'analyse ; avec options.multi, une référence par instant (alts) en plus de la moyenne.
   - prochainInstant : instant où proposer à John de donner un autre exemple (jamais bloquant).
   - banc : cohérence des marques de banc faites à plusieurs instants. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./kit"));
  else root.FutsalExemples = factory(root.FutsalKit);
})(typeof self !== "undefined" ? self : this, function (K) {
  "use strict";

  const CATS = [
    { key: "A", nom: "Mon équipe", requis: true, n: 3, instants: 2 },
    { key: "B", nom: "Adversaires", requis: true, n: 3, instants: 2 },
    { key: "GKA", nom: "Mon gardien", requis: false, n: 2, instants: 2 },
    { key: "GKB", nom: "Gardien adverse", requis: false, n: 2, instants: 2 },
    { key: "REF", nom: "Arbitre", requis: false, n: 2, instants: 2 }
  ];
  const LIMITES = {
    INSTANT_ECART_S: 20,     // deux exemples à moins de 20 s l'un de l'autre comptent pour un seul instant
    CONTRADICTION: 8,        // écart de tenue en dessous duquel deux exemples de deux catégories sont jugés « la même tenue » (un joueur s'écarte de ~18 de sa propre tenue)
    ISOLE: 40,               // écart au reste de la catégorie au-dessus duquel un exemple est jugé « à part » (au moins 3 exemples)
    BANC_MEME: 4,            // m : deux marques à moins de 4 m (ou qui se recouvrent) sont le même banc
    BANC_DERIVE: 1.5,        // m : écart des centres au-delà duquel deux marques du même banc ne s'accordent plus
    BANC_MAX: 6
  };
  const nomCat = (k) => (CATS.find((c) => c.key === k) || { nom: k }).nom;
  const round1 = (v) => Math.round(v * 10) / 10;
  const fmtT = (t) => (typeof t === "number" && isFinite(t) ? Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0") : "instant inconnu");

  let compteur = 0;
  function nouvelId() { compteur++; return "e" + Date.now().toString(36) + compteur.toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  /* Ajoute à l'échantillon son numéro, l'instant (s), la vidéo et la source ("silhouette", "pipette", "auto"). */
  function marquer(feat, info) {
    if (!feat) return feat;
    const i = info || {};
    feat.id = i.id || nouvelId();
    feat.t = typeof i.t === "number" && isFinite(i.t) ? Math.round(i.t * 10) / 10 : null;
    if (i.v) feat.v = i.v;
    if (i.src) feat.src = i.src;
    return feat;
  }

  /* Donne un numéro aux échantillons qui n'en ont pas (anciens projets), sans toucher au reste. */
  function assurerIds(kits) {
    Object.keys(kits || {}).forEach((k) => (kits[k] || []).forEach((f) => { if (f && !f.id) f.id = nouvelId(); }));
    return kits;
  }

  function liste(kits, cat) {
    return ((kits && kits[cat]) || []).map((f, i) => ({ cat, i, id: f && f.id ? f.id : "legacy:" + cat + ":" + i, t: f && typeof f.t === "number" ? f.t : null, v: f && f.v ? f.v : null, src: f && f.src ? f.src : null, feat: f })).filter((e) => e.feat);
  }
  function toutes(kits) { return CATS.reduce((a, c) => a.concat(liste(kits, c.key)), []); }

  /* Retire un échantillon (par numéro). Renvoie vrai s'il existait. La catégorie vide disparaît (comme « effacer »). */
  function retirer(kits, cat, id) {
    const l = (kits && kits[cat]) || [];
    const e = liste(kits, cat).find((x) => x.id === id);
    if (!e) return false;
    l.splice(e.i, 1);
    if (!l.length) delete kits[cat];
    return true;
  }

  /* Instants distincts : les exemples sont regroupés tant que deux voisins sont à moins de INSTANT_ECART_S ; les exemples sans instant
     forment un seul groupe « inconnu » (on ne sait pas s'ils viennent d'instants différents). */
  function groupes(exs) {
    const avec = exs.filter((e) => e.t != null).sort((a, b) => a.t - b.t), sans = exs.filter((e) => e.t == null), out = [];
    avec.forEach((e) => {
      const g = out[out.length - 1];
      if (g && g.inconnu !== true && e.t - g.fin <= LIMITES.INSTANT_ECART_S) { g.items.push(e); g.fin = e.t; } else out.push({ t: e.t, fin: e.t, items: [e] });
    });
    if (sans.length) out.push({ t: null, fin: null, inconnu: true, items: sans });
    return out;
  }

  function etat(kits, cat) {
    const def = CATS.find((c) => c.key === cat) || { key: cat, nom: cat, requis: false, n: 2, instants: 2 };
    const exs = liste(kits, cat), g = groupes(exs), n = exs.length, inst = g.length, inconnus = exs.filter((e) => e.t == null).length;
    if (!n) {
      return { cat, nom: def.nom, n: 0, instants: 0, etat: def.requis ? "insuffisant" : "facultatif", texte: def.requis ? "il en faut plus : aucun exemple" : "aucun exemple (facultatif : à donner si cette personne a une tenue à part)" };
    }
    if (n >= def.n && inst >= def.instants) return { cat, nom: def.nom, n, instants: inst, etat: "assez", texte: "assez d'exemples (" + n + ", à " + inst + " instants différents)" };
    const manques = [];
    if (n < def.n) manques.push("au moins " + def.n + " exemples (il y en a " + n + ")");
    if (inst < def.instants) manques.push("des exemples à au moins " + def.instants + " instants différents (il y en a " + inst + (inconnus ? " ; " + inconnus + " sans instant connu, ancien projet" : "") + ")");
    return { cat, nom: def.nom, n, instants: inst, etat: "insuffisant", texte: "il en faut plus : " + manques.join(" et ") };
  }
  function etats(kits) { return CATS.map((c) => etat(kits, c.key)); }

  /* Contradictions et exemples à part, en français. Rien n'est supprimé : c'est John qui décide. */
  function contradictions(kits) {
    const out = [], all = toutes(kits);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.cat === b.cat) continue;
        const d = K.dist(a.feat, b.feat);
        if (isFinite(d) && d < LIMITES.CONTRADICTION) {
          out.push({ type: "meme_tenue", a: { cat: a.cat, id: a.id, t: a.t }, b: { cat: b.cat, id: b.id, t: b.t }, d: round1(d),
            texte: "Une tenue presque identique a été donnée à « " + nomCat(a.cat) + " » (" + fmtT(a.t) + ") et à « " + nomCat(b.cat) + " » (" + fmtT(b.t) + "), écart " + round1(d) + " alors qu'un joueur s'écarte en moyenne de " + K.PLAYER_SPREAD + " de sa propre tenue. Si les tenues sont vraiment proches, gardez-les ; sinon supprimez l'exemple qui s'est trompé de catégorie." });
        }
      }
    }
    CATS.forEach((c) => {
      const l = liste(kits, c.key);
      if (l.length < 3) return;
      l.forEach((e) => {
        const autres = l.filter((x) => x !== e).map((x) => x.feat), moy = K.average(autres), d = K.dist(e.feat, moy);
        if (isFinite(d) && d > LIMITES.ISOLE) out.push({ type: "isole", a: { cat: c.key, id: e.id, t: e.t }, d: round1(d), texte: "Un exemple de « " + c.nom + " » (" + fmtT(e.t) + ") est très différent des autres (écart " + round1(d) + "). Une erreur de clic est possible : vérifiez-le ou supprimez-le." });
      });
    });
    return out;
  }

  /* Références pour l'analyse. Toujours la moyenne de TOUS les exemples de la catégorie ; avec opts.multi et au moins deux instants, on
     ajoute aussi une référence par instant (alts) : la tenue peut changer de couleur apparente d'un endroit ou d'un moment à l'autre. */
  function refs(kits, opts) {
    const out = {}, multi = !!(opts && opts.multi);
    Object.keys(kits || {}).forEach((k) => {
      const feats = (kits[k] || []).filter(Boolean);
      if (!feats.length) return;
      out[k] = K.average(feats);
      if (multi) {
        const g = groupes(liste(kits, k));
        if (g.length >= 2) out[k].alts = g.map((x) => K.average(x.items.map((e) => e.feat)));
      }
    });
    return out;
  }

  /* Instant où proposer un autre exemple pour la catégorie cat. Différent à chaque appel (o.rotation = nombre de clics déjà faits ; o.dernier = dernier instant proposé).
     frames : images déjà analysées (peut être vide) ; lost : passages à caméra perdue [[de, a], …].
     Avec analyse : images où la caméra est suivie, où une personne de la catégorie est détectée, assez grande et non coupée par le bord, à plus de 20 s des exemples déjà donnés.
     Les meilleurs candidats (taille, éloignement), séparés d'au moins 20 s, tournent à chaque clic. Sans analyse : instants répartis dans la vidéo, hors passages perdus. */
  const HAUT_MIN = 45, BORD = 6;   // hauteur minimale du joueur (millièmes de l'image) ; marge au bord
  function prochainInstant(o) {
    const kits = o.kits || {}, cat = o.cat, dur = o.duree || 0, videoNom = o.v || null, rot = Math.max(0, o.rotation | 0), lost = o.lost || [];
    const deja = liste(kits, cat).filter((e) => e.t != null && (!e.v || !videoNom || e.v === videoNom)).map((e) => e.t);
    const loin = (t) => (deja.length ? Math.min.apply(null, deja.map((x) => Math.abs(x - t))) : Infinity);
    const perdu = (t) => lost.some((l) => t >= l[0] - 0.5 && t <= l[1] + 0.5);
    const ecart = dur > 0 ? Math.min(LIMITES.INSTANT_ECART_S, Math.max(1, dur / 6)) : LIMITES.INSTANT_ECART_S;   // une très courte vidéo ne permet pas 20 s d'écart
    const dernier = typeof o.dernier === "number" ? o.dernier : null;
    const choisir = (liste_, sep) => {
      const sel = [];
      liste_.forEach((c) => { if (sel.length < 8 && sel.every((x) => Math.abs(x.t - c.t) >= sep)) sel.push(c); });
      if (!sel.length) return null;
      let k = rot % sel.length;
      if (sel.length > 1 && dernier != null && Math.abs(sel[k].t - dernier) < 0.15) k = (k + 1) % sel.length;
      return sel[k];
    };
    const cands = [];
    (o.frames || []).forEach((f) => {
      if (perdu(f.t) || (f.h !== undefined && !(Array.isArray(f.h) && f.h.length === 9))) return;
      let best = null;
      (f.players || []).forEach((p) => {
        if (p.team !== cat || !p.b) return;
        const haut = p.b[3] - p.b[1], coupe = p.b[0] < BORD || p.b[1] < BORD || p.b[2] > 1000 - BORD || p.b[3] > 1000 - BORD;
        if (!best || haut > best.haut) best = { haut, coupe };
      });
      if (best) cands.push({ t: f.t, haut: best.haut, coupe: best.coupe });
    });
    const score = (c) => Math.min(loin(c.t), 120) * 2 + Math.min(c.haut, 200);
    for (const strict of [true, false]) {
      const l = cands.filter((c) => loin(c.t) >= ecart && (!strict || (!c.coupe && c.haut >= HAUT_MIN))).sort((x, y) => score(y) - score(x) || x.t - y.t);
      const c = choisir(l, ecart);
      if (c) return { t: Math.round(c.t * 10) / 10, probable: true, raison: strict
        ? "l'analyse y a vu cette catégorie, joueur assez grand et entier, caméra suivie, à " + (deja.length ? Math.round(loin(c.t)) + " s de votre exemple le plus proche" : "un moment sans exemple")
        : "l'analyse y a vu cette catégorie mais le joueur est petit ou coupé par le bord : à vérifier avant de cliquer" };
    }
    if (!dur) return null;
    const pas = [];
    for (let i = 1; i <= 24; i++) { const t = (dur * i) / 25; if (!perdu(t) && loin(t) >= ecart) pas.push({ t, l: loin(t) }); }
    pas.sort((x, y) => Math.min(y.l, 120) - Math.min(x.l, 120) || x.t - y.t);
    const c = choisir(pas, Math.max(1, dur / 12));
    if (!c) return null;
    return { t: Math.round(c.t * 10) / 10, probable: false, raison: "instant réparti dans la vidéo, loin de vos autres exemples" + (lost.length ? " et hors des passages à caméra perdue" : "") + " ; je ne sais pas encore si on y voit cette catégorie" };
  }

  /* Phrase de demande (jamais bloquante) pour la première catégorie qui manque d'exemples. */
  function demande(kits, cat) {
    const e = etat(kits, cat);
    if (e.etat === "assez" || e.etat === "facultatif") return null;
    const nom = cat === "REF" ? "l'arbitre" : cat === "GKA" ? "votre gardien" : cat === "GKB" ? "le gardien adverse" : cat === "A" ? "votre équipe" : "les adversaires";
    if (e.n === 0) return "Je n'ai aucun exemple pour " + nom + ". Voulez-vous m'en montrer un ? Sans réponse, " + nom + (cat === "A" || cat === "B" ? " ne seront pas reconnus." : " sera moins bien reconnu.");
    return "Je n'ai vu " + nom + " " + (e.n === 1 ? "qu'une fois" : "que " + e.n + " fois") + (e.n > 1 && e.instants < 2 ? ", à un seul moment" : "") + ". Voulez-vous m'en montrer un autre moment ? Sans réponse, " + nom + " reste « moins fiable ».";
  }

  /* ---------- zones de banc marquées à plusieurs instants ---------- */
  function centre(z) { return [(z.x1 + z.x2) / 2, (z.y1 + z.y2) / 2]; }
  function recouvre(a, b) { return Math.min(a.x2, b.x2) > Math.max(a.x1, b.x1) && Math.min(a.y2, b.y2) > Math.max(a.y1, b.y1); }
  function marquerBanc(zone, info) {
    const i = info || {};
    zone.id = i.id || nouvelId();
    zone.t = typeof i.t === "number" && isFinite(i.t) ? Math.round(i.t * 10) / 10 : null;
    if (i.v) zone.v = i.v;
    return zone;
  }
  /* Contrôle de cohérence : les marques du même banc (qui se recouvrent ou à moins de BANC_MEME m) doivent s'accorder (centres à moins de BANC_DERIVE m).
     Sinon la projection vers le banc dérive d'un instant à l'autre : l'analyse garde toutes les marques, mais on le dit. */
  function banc(zones, opts) {
    const z = (zones || []).filter((x) => x && isFinite(x.x1) && isFinite(x.x2));
    const o = opts || {}, msgs = [], paires = [];
    for (let i = 0; i < z.length; i++) {
      for (let j = i + 1; j < z.length; j++) {
        const ci = centre(z[i]), cj = centre(z[j]), d = Math.hypot(ci[0] - cj[0], ci[1] - cj[1]);
        if (!(recouvre(z[i], z[j]) || d < LIMITES.BANC_MEME)) continue;
        const ecart = round1(d);
        paires.push({ i, j, d: ecart, coherent: d <= LIMITES.BANC_DERIVE });
        if (d > LIMITES.BANC_DERIVE) msgs.push("Les marques du banc faites à " + fmtT(z[i].t) + " et à " + fmtT(z[j].t) + " ne s'accordent pas : les centres sont à " + ecart + " m l'un de l'autre. La caméra a pu bouger ; si ce n'est pas un second banc, refaites l'une des deux marques. L'analyse utilise toutes les marques.");
      }
    }
    const instants = groupes(z.map((x) => ({ t: typeof x.t === "number" ? x.t : null }))).length;
    let etatB = "aucune";
    if (z.length) etatB = (o.camera === "mobile" && instants < 2) ? "a_completer" : "ok";
    if (etatB === "a_completer") msgs.push("Le banc n'est marqué qu'à un instant et la caméra bouge : voulez-vous le marquer à un autre moment ? Sans réponse, le banc reste « moins fiable » (le suivi de la dérive de la caméra continue de fonctionner).");
    return { n: z.length, instants, etat: etatB, paires, messages: msgs, coherent: !paires.some((p) => !p.coherent) };
  }

  return { CATS, LIMITES, nomCat, fmtT, marquer, assurerIds, liste, toutes, retirer, groupes, etat, etats, contradictions, refs, prochainInstant, demande, marquerBanc, banc };
});
