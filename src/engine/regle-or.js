/* RÈGLE D'OR : tout résultat affiché porte un statut, et ce statut doit être justifié.
   - « mesuré »              : lu directement sur la vidéo (détection, instant, position vue). Source indiquée.
   - « déduit avec preuve »  : conclu à partir de mesures, avec la preuve (chiffres, instants). Sans preuve, il n'existe pas.
   - « non évalué »          : le programme ne peut pas le dire ; la raison est donnée. Jamais le silence.
   - « inconnu »             : la personne ou la valeur n'est pas déterminée (marge trop faible). Rien n'est affiché à la place.
   Quatre interdits codés (audit + garde) :
   1. une erreur liée au ballon n'est jamais affichée sans ballon fiable (vu sur assez d'images) ;
   2. une identité n'est jamais affichée sous le seuil de confiance (sinon : « inconnu ») ;
   3. une position n'est jamais comblée à travers un trou trop long ;
   4. un résultat sans statut valide n'est jamais affiché.
   Ce module est pur : il ne dessine rien. Il est appelé à la sortie de l'analyse de match (match.js), donc tout ce qui est affiché passe par lui,
   et par les tests qui échouent si une règle est violée. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalRegleOr = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STATUT = { MESURE: "mesure", DEDUIT: "deduit", NON_EVALUE: "non_evalue", INCONNU: "inconnu" };
  const TEXTE = { mesure: "mesuré", deduit: "déduit avec preuve", non_evalue: "non évalué", inconnu: "inconnu" };
  /* Seuils. Ils ne se relâchent que sur décision de John et après mesure (voir les tests qui les figent). */
  const LIMITES = {
    BALL_CONF_MIN: 0.6,        // part minimale d'images avec ballon vu autour d'une erreur (identique à match.js)
    ID_CONF_MIN: 0.95,         // confiance minimale pour AFFICHER une identité (calibrée au chantier « identité » ; en attendant, rien d'autre n'est affiché)
    FILL_GAP_MAX_S: 1.2,       // un joueur n'est interpolé qu'entre deux images analysées distantes de 1,2 s au plus
    BALL_HOLD_MAX_S: 0.6,      // le ballon n'est repris d'une image voisine qu'à 0,6 s au plus
    BALL_LINK_MAX_S: 1.0       // deux détections du ballon ne sont reliées que si elles sont distantes de 1 s au plus
  };

  const txt = (v) => typeof v === "string" && v.trim().length > 0;
  /* Constructeurs : impossible de fabriquer un statut incomplet (une preuve ou une raison est obligatoire). */
  function mesure(source) { if (!txt(source)) throw new Error("mesuré : la source est obligatoire"); return { valeur: STATUT.MESURE, source }; }
  function deduit(preuve) {
    const ok = txt(preuve) || (preuve && typeof preuve === "object" && Object.keys(preuve).length > 0);
    if (!ok) throw new Error("déduit : la preuve est obligatoire");
    return { valeur: STATUT.DEDUIT, preuve };
  }
  function nonEvalue(raison) { if (!txt(raison)) throw new Error("non évalué : la raison est obligatoire"); return { valeur: STATUT.NON_EVALUE, raison }; }
  function inconnu(raison) { return { valeur: STATUT.INCONNU, raison: txt(raison) ? raison : "marge de confiance trop faible" }; }

  /* Problèmes d'un statut (liste vide = valide). */
  function statutProblemes(s) {
    if (!s || typeof s !== "object" || !TEXTE[s.valeur]) return ["pas de statut"];
    if (s.valeur === STATUT.MESURE && !txt(s.source)) return ["statut « mesuré » sans source"];
    if (s.valeur === STATUT.DEDUIT && !(txt(s.preuve) || (s.preuve && typeof s.preuve === "object" && Object.keys(s.preuve).length))) return ["statut « déduit » sans preuve"];
    if (s.valeur === STATUT.NON_EVALUE && !txt(s.raison)) return ["statut « non évalué » sans raison"];
    return [];
  }

  /* ---- règles d'audit : une vue = ce qui est affiché ----
     { events: [], uncertain: [], identities: [], fills: [] }
     event      : { t, type, ballConf, ballFree?, statut }
     uncertain  : { t, type, reason, statut }
     identity   : { id, label, conf, statut }            (label null = inconnu)
     fill       : { kind: "joueur" | "ballon" | "lien-ballon", from, to, statut } */
  const MAX_FILL = { joueur: "FILL_GAP_MAX_S", ballon: "BALL_HOLD_MAX_S", "lien-ballon": "BALL_LINK_MAX_S" };

  function audit(view) {
    const v = view || {}, out = [], add = (regle, item, message) => out.push({ regle, t: item && item.t, id: item && item.id, message });
    const all = [].concat((v.events || []).map((x) => ["évènement", x]), (v.uncertain || []).map((x) => ["incertain", x]), (v.identities || []).map((x) => ["identité", x]), (v.fills || []).map((x) => ["position", x]));
    all.forEach(([k, x]) => statutProblemes(x.statut).forEach((p) => add("statut", x, k + " : " + p)));
    (v.events || []).forEach((e) => {
      if (e.ballFree === true) return;
      if (!(typeof e.ballConf === "number" && e.ballConf >= LIMITES.BALL_CONF_MIN)) add("ballon", e, "erreur liée au ballon affichée sans ballon fiable (vu sur " + (typeof e.ballConf === "number" ? Math.round(e.ballConf * 100) + " %" : "?") + " des images)");
      else if (e.statut && (e.statut.valeur === STATUT.INCONNU || e.statut.valeur === STATUT.NON_EVALUE)) add("ballon", e, "erreur affichée alors que son statut est « " + TEXTE[e.statut.valeur] + " »");
    });
    (v.identities || []).forEach((i) => {
      const shown = i.label != null && i.label !== "inconnu";
      if (shown && !(typeof i.conf === "number" && i.conf >= LIMITES.ID_CONF_MIN)) add("identite", i, "identité « " + i.label + " » affichée sous le seuil de confiance (" + (typeof i.conf === "number" ? Math.round(i.conf * 100) + " %" : "?") + " < " + Math.round(LIMITES.ID_CONF_MIN * 100) + " %)");
      if (shown && i.statut && (i.statut.valeur === STATUT.INCONNU || i.statut.valeur === STATUT.NON_EVALUE)) add("identite", i, "identité affichée alors que son statut est « " + TEXTE[i.statut.valeur] + " »");
      if (!shown && i.statut && i.statut.valeur !== STATUT.INCONNU) add("identite", i, "identité non affichée mais statut « " + TEXTE[i.statut.valeur] + " » au lieu de « inconnu »");
    });
    (v.fills || []).forEach((f) => {
      const lim = LIMITES[MAX_FILL[f.kind]];
      if (lim == null) add("trou", f, "sorte de comblement inconnue : " + f.kind);
      else if (!(f.to - f.from <= lim + 1e-9)) add("trou", f, "position comblée à travers un trou de " + (f.to - f.from).toFixed(2) + " s (maximum " + lim + " s pour « " + f.kind + " »)");
    });
    return out;
  }

  /* ---- sortie de l'analyse de match : statuts posés, violations jamais affichées ---- */
  function stampEvent(e) {
    const c = e.ballConf;
    return Object.assign({}, e, { statut: deduit({ ballon_vu_sur: c, seuil: LIMITES.BALL_CONF_MIN, regle: "perte ou gain de possession déduit de la position du ballon et des joueurs" }) });
  }
  function stampUncertain(u) {
    const reason = u.reason || "ballon pas assez visible";
    return Object.assign({}, u, { statut: nonEvalue(reason) });
  }
  /* Résultat de match.analyze -> même résultat, statuts ajoutés. Un évènement qui violerait la règle du ballon passe dans « incertain »
     avec sa raison : il n'est jamais affiché comme certain, ni perdu en silence. */
  function guardResult(res) {
    const events = [], uncertain = (res.uncertain || []).map(stampUncertain), dropped = [];
    (res.events || []).forEach((e) => {
      const s = stampEvent(e), bad = audit({ events: [s] });
      if (bad.length) { dropped.push({ t: e.t, type: e.type, regle: bad[0].regle, message: bad[0].message }); uncertain.push(stampUncertain({ t: e.t, type: e.type, ballConf: e.ballConf, reason: "ballon pas assez visible", event: Object.assign({}, e) })); }
      else events.push(s);
    });
    return Object.assign({}, res, { events, uncertain, regleOr: { dropped } });
  }
  /* Identités à afficher : sous le seuil, « inconnu » (jamais une identité douteuse). */
  function guardIdentities(list) {
    return (list || []).map((i) => (i.label != null && i.label !== "inconnu" && !(typeof i.conf === "number" && i.conf >= LIMITES.ID_CONF_MIN)
      ? { id: i.id, label: null, conf: i.conf, statut: inconnu("confiance " + (typeof i.conf === "number" ? Math.round(i.conf * 100) + " %" : "inconnue") + " sous le seuil de " + Math.round(LIMITES.ID_CONF_MIN * 100) + " %") }
      : i));
  }
  const decrire = (s) => (s && TEXTE[s.valeur] ? TEXTE[s.valeur] + (s.valeur === STATUT.NON_EVALUE ? " : " + s.raison : "") : "sans statut");

  return { STATUT, TEXTE, LIMITES, mesure, deduit, nonEvalue, inconnu, statutProblemes, audit, stampEvent, stampUncertain, guardResult, guardIdentities, decrire };
});
