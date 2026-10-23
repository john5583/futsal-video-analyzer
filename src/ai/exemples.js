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

  /* Instant où proposer un autre exemple pour la catégorie cat.
     frames : images déjà analysées (peut être vide) ; la catégorie y est « probablement visible » si l'analyse y a vu une personne de cette catégorie.
     Choix : l'instant le plus éloigné des exemples déjà donnés (même vidéo), parmi ceux où elle semble visible. */
  function prochainInstant(o) {
    const kits = o.kits || {}, cat = o.cat, dur = o.duree || 0, videoNom = o.v || null;
    const deja = liste(kits, cat).filter((e) => e.t != null && (!e.v || !videoNom || e.v === videoNom)).map((e) => e.t);
    const loin = (t) => (deja.length ? Math.min.apply(null, deja.map((x) => Math.abs(x - t))) : Infinity);
    const ecart = dur > 0 ? Math.min(LIMITES.INSTANT_ECART_S, Math.max(1, dur / 6)) : LIMITES.INSTANT_ECART_S;   // une très courte vidéo ne permet pas 20 s d'écart
    let cands = [];
    (o.frames || []).forEach((f) => {
      const ps = (f.players || []).filter((p) => p.team === cat);
      if (!ps.length) return;
      const taille = Math.max.apply(null, ps.map((p) => (p.b ? p.b[3] - p.b[1] : 0)));
      cands.push({ t: f.t, taille });
    });
    cands = cands.filter((c) => loin(c.t) >= ecart);
    if (cands.length) {
      cands.sort((a, b) => (Math.min(loin(b.t), 120) - Math.min(loin(a.t), 120)) || (b.taille - a.taille));
      return { t: Math.round(cands[0].t * 10) / 10, probable: true, raison: "l'analyse déjà faite y a vu cette catégorie, loin de vos autres exemples" };
    }
    if (!dur) return null;
    let best = null;
    for (let i = 1; i <= 12; i++) {
      const t = (dur * i) / 13, l = loin(t);
      if (!best || l > best.l) best = { t, l };
    }
    if (!best || best.l < ecart) return null;
    return { t: Math.round(best.t * 10) / 10, probable: false, raison: "instant éloigné de vos autres exemples ; je ne sais pas encore si on y voit cette catégorie" };
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
