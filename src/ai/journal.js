/* Journal de décisions : le programme garde ce qu'il a MESURÉ, ce qu'il en a CONCLU et ce qui s'est révélé JUSTE ou FAUX, d'un projet à l'autre.
   Il ne garde que des chiffres (mesures, seuils, verdicts) : jamais le contenu d'un match, ni l'identité d'un joueur. Un fichier local, sur cet ordinateur.
   Il sert à régler ses seuils tout seul (calibrer) : plus strict quand il s'est trompé en disant « vérifié » ; jamais plus laxiste sans exemples.
   Entrée terrain : { v: 1, type: "terrain", date, video, t, mesures: { rond: [sur, vis], touches: [sur, vis], mediane: [sur, vis] }, decision: "verifie" | "incertain", verdict: "oui" | "non", source: "coach", seuils: {...} } */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalJournal = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const DEFAUT = { rondPart: 0.5, touchePart: 0.35 };
  const BORNES = { rondPart: [0.2, 0.85], touchePart: [0.15, 0.8] };
  const VUE_MIN = { rond: 30, touches: 40 };       // même minimum que le suivi : en dessous, la partie du terrain n'est pas jugée
  const MIN_PAR_CLASSE = 2, MIN_TOTAL = 6;          // pas de réglage sans exemples des deux sortes
  const MAX_ERREURS = 0.25;                          // part de réponses qu'un seuil a le droit de mal classer pour être retenu
  const COUT_FAUX_VERIFIE = 3;                      // dire « vérifié » à tort coûte 3 fois plus que dire « incertain » à tort

  const ratio = (m) => (m && m[1] > 0 ? m[0] / m[1] : null);

  /* Ligne de mesures du suivi [t, rondSur, rondVis, toucheSur, toucheVis, medSur, medVis, verifie] -> entrée du journal (verdict du coach). */
  function entreeTerrain(ligne, verdict, meta) {
    if (!Array.isArray(ligne) || ligne.length < 8 || (verdict !== "oui" && verdict !== "non")) return null;
    const m = meta || {};
    return {
      v: 1, type: "terrain", date: m.date || new Date().toISOString().slice(0, 10), video: String(m.video || "").slice(0, 80), t: ligne[0],
      mesures: { rond: [ligne[1], ligne[2]], touches: [ligne[3], ligne[4]], mediane: [ligne[5], ligne[6]] },
      decision: ligne[7] ? "verifie" : "incertain", verdict, source: "coach", seuils: m.seuils || null
    };
  }

  /* Meilleur seuil pour une mesure (rond ou touches) d'après les verdicts : on cherche le seuil qui se trompe le moins,
     avec un coût plus lourd pour « vérifié alors que c'est faux ». Rend le seuil par défaut s'il y a trop peu d'exemples. */
  function seuilPour(exemples, defaut, bornes) {
    const oui = exemples.filter((e) => e.verdict === "oui").map((e) => e.r), non = exemples.filter((e) => e.verdict === "non").map((e) => e.r);
    if (oui.length < MIN_PAR_CLASSE || non.length < MIN_PAR_CLASSE || oui.length + non.length < MIN_TOTAL) return { seuil: defaut, appris: false, oui: oui.length, non: non.length };
    const vals = Array.from(new Set(exemples.map((e) => e.r))).sort((a, b) => a - b), cand = [bornes[0]];
    for (let i = 0; i < vals.length - 1; i++) cand.push((vals[i] + vals[i + 1]) / 2);
    cand.push(bornes[1]);
    let best = null;
    cand.forEach((s) => {
      if (s < bornes[0] || s > bornes[1]) return;
      const faux = non.filter((r) => r >= s).length, rate = oui.filter((r) => r < s).length, cout = COUT_FAUX_VERIFIE * faux + rate;
      if (!best || cout < best.cout || (cout === best.cout && Math.abs(s - defaut) < Math.abs(best.s - defaut))) best = { s, cout, erreurs: faux + rate };
    });
    // une mesure qui ne sépare pas les « oui » des « non » (plus d'une réponse sur quatre mal classée) ne règle rien : le seuil de départ est gardé, jamais de réglage au hasard
    if (best.erreurs / (oui.length + non.length) > MAX_ERREURS) return { seuil: defaut, appris: false, oui: oui.length, non: non.length, inseparable: true };
    return { seuil: Math.round(best.s * 100) / 100, appris: true, oui: oui.length, non: non.length };
  }

  /* Seuils réglés d'après les verdicts du journal. Rend { seuils, notes } ; seuils sans exemple suffisant = valeurs par défaut. */
  function calibrer(entrees) {
    const t = (entrees || []).filter((e) => e && e.type === "terrain" && (e.verdict === "oui" || e.verdict === "non") && e.mesures);
    const ex = (cle, vue) => t.filter((e) => e.mesures[cle] && e.mesures[cle][1] >= vue).map((e) => ({ r: ratio(e.mesures[cle]), verdict: e.verdict })).filter((e) => e.r != null);
    const rond = seuilPour(ex("rond", VUE_MIN.rond), DEFAUT.rondPart, BORNES.rondPart), touches = seuilPour(ex("touches", VUE_MIN.touches), DEFAUT.touchePart, BORNES.touchePart);
    return { seuils: { rondPart: rond.seuil, touchePart: touches.seuil }, notes: { rond, touches, entrees: t.length } };
  }

  /* Phrase pour l'écran : d'après combien de réponses les seuils sont réglés. */
  function texteSeuils(cal) {
    if (!cal || !cal.notes || !cal.notes.entrees) return "Seuils du terrain : valeurs de départ (aucune réponse du coach dans le journal).";
    const n = cal.notes, ap = [n.rond.appris ? "rond " + cal.seuils.rondPart : null, n.touches.appris ? "lignes de touche " + cal.seuils.touchePart : null].filter(Boolean);
    return "Seuils du terrain réglés d'après " + n.entrees + " réponse(s) du coach" + (ap.length ? " : " + ap.join(", ") + "." : " (pas encore assez d'exemples « oui » et « non » pour les changer).");
  }
  return { DEFAUT, BORNES, entreeTerrain, calibrer, seuilPour, texteSeuils };
});
