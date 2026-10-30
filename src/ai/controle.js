/* Contrôle rapide : le programme choisit des instants au hasard (toujours les mêmes pour une même vidéo) et John répond O / N / ? à une question
   courte sur ce qui est affiché. Ce fichier ne fait que le choix des instants et le calcul du résumé ; l'écran est dans src/controle-ui.js.
   Verdict : { t, comp, v: "oui" | "non" | "incertain" } gardé dans le projet (ai.controleRapide). Voir docs/definition-mesure.md. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalControle = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const COMPS = {
    ballon: { nom: "Ballon", question: "Le repère du ballon est-il bien posé sur le ballon ?", eligible: (f) => !!f.ball },
    joueurs: { nom: "Joueurs", question: "Chaque joueur et chaque gardien sur le terrain est-il repéré, sans personne en trop (public, remplaçant, arbitre) ?", eligible: (f) => f.players.length >= 2 },
    terrain: { nom: "Terrain", question: "Le tracé cyan du terrain colle-t-il aux lignes noires du terrain (rond central, lignes de touche, surfaces) ? Réponds « Non » si une ligne tombe à côté, même un peu.", eligible: () => true },
    equipes: { nom: "Équipes", question: "Les couleurs d'équipe affichées sont-elles justes sur cette image ?", eligible: (f) => f.players.length >= 2 }
  };
  const VERDICTS = { oui: 1, non: 1, incertain: 1 };

  function graine(texte) { let h = 2166136261 >>> 0; for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function alea(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* Instants à contrôler : images éligibles, mélangées avec une graine fixe (vidéo + composant), séparées d'au moins `ecart` secondes. */
  function echantillon(frames, comp, nomVideo, opts) {
    const c = COMPS[comp]; if (!c) return [];
    const n = (opts && opts.n) || 100, ecart = opts && opts.ecart != null ? opts.ecart : 2;
    const ok = frames.filter((f) => c.eligible(f)).map((f) => f.t);
    const rnd = alea(graine(String(nomVideo || "") + "|" + comp));
    for (let i = ok.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = ok[i]; ok[i] = ok[j]; ok[j] = x; }
    const pris = [];
    for (const t of ok) { if (pris.length >= n) break; if (pris.every((p) => Math.abs(p - t) >= ecart)) pris.push(t); }
    return pris.sort((a, b) => a - b);
  }

  function wilson(k, n) {
    if (!(n > 0)) return null;
    const z = 1.959964, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return { p, bas: Math.max(0, (c - m) / d), haut: Math.min(1, (c + m) / d) };
  }
  function resume(liste, comp) {
    const l = (liste || []).filter((x) => x.comp === comp), oui = l.filter((x) => x.v === "oui").length, non = l.filter((x) => x.v === "non").length, inc = l.filter((x) => x.v === "incertain").length;
    return { oui, non, incertain: inc, n: oui + non, wilson: wilson(oui, oui + non) };
  }
  /* Enregistre (ou remplace) le verdict d'un instant ; refuse un verdict ou un composant inconnu. */
  function repondre(liste, t, comp, v) {
    if (!Array.isArray(liste) || !COMPS[comp] || !VERDICTS[v] || !isFinite(t)) return false;
    const i = liste.findIndex((x) => x.comp === comp && Math.abs(x.t - t) < 0.05);
    const o = { t: Math.round(t * 100) / 100, comp, v };
    if (i >= 0) liste[i] = o; else liste.push(o);
    return true;
  }
  const verdictDe = (liste, t, comp) => { const x = (liste || []).find((y) => y.comp === comp && Math.abs(y.t - t) < 0.05); return x ? x.v : null; };
  return { COMPS, echantillon, wilson, resume, repondre, verdictDe, graine };
});
