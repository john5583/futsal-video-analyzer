/* Numéros d'affichage des joueurs : UN numéro par PERSONNE (fiche du registre), le même sur la vidéo, la vue du dessus, la liste d'erreurs et le rapport.
   Règles (demande de John, 2026-11-01) :
   - numérotation par équipe ; le gardien porte le 1, puis les joueurs se suivent dans l'ordre de leur première apparition ;
   - un remplaçant qui entre prend le numéro suivant (le 8 sort, le suivant entre : il n'hérite pas du 8) ;
   - une personne reconnue garde son numéro pendant toute la vidéo (toutes ses pistes : c'est la fiche qui porte le numéro, pas l'identifiant de piste) ;
   - une personne « non identifiée » (vue trop peu de temps ou rattachement douteux) n'a PAS de numéro : jamais une fausse étiquette. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalNumeros = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const cote = (eq) => (eq === "A" || eq === "GKA" ? "A" : eq === "B" || eq === "GKB" ? "B" : null);
  const estGardien = (eq) => eq === "GKA" || eq === "GKB";

  /* personnes : fiches du registre ({ id, equipe, pistes, intervalles, statut }).
     Rend { parPiste : { idPiste : numéro }, parPersonne : { idPersonne : numéro }, effectifs : { A : n, B : n } }. */
  const MAX_PAR_EQUIPE = 8;   // 5 sur le terrain + remplaçants : au-delà, la même personne est découpée en plusieurs fiches (identité trop fragmentée) et les numéros seraient faux
  function attribuer(personnes, opts) {
    const maxEq = (opts && opts.max) || MAX_PAR_EQUIPE, parPiste = {}, parPersonne = {}, effectifs = { A: 0, B: 0 }, refus = {};
    ["A", "B"].forEach((c) => {
      const liste = (personnes || [])
        .filter((p) => cote(p.equipe) === c && p.statut !== "non identifiée" && Array.isArray(p.intervalles) && p.intervalles.length)
        .sort((a, b) => a.intervalles[0][0] - b.intervalles[0][0] || String(a.id).localeCompare(String(b.id)));
      effectifs[c] = liste.length;
      if (liste.length > maxEq) { refus[c] = liste.length; return; }      // identité trop fragmentée : pas de numéro (jamais une fausse étiquette)
      const gardien = liste.find((p) => estGardien(p.equipe)) || null;
      let n = gardien ? 2 : 1;
      if (gardien) donner(gardien, 1);
      liste.forEach((p) => { if (p !== gardien) donner(p, n++); });
    });
    function donner(p, num) { parPersonne[p.id] = num; (p.pistes || []).forEach((id) => { parPiste[id] = num; }); }
    return { parPiste, parPersonne, effectifs, refus };
  }

  return { attribuer, cote, MAX_PAR_EQUIPE };
});
