/* Bilan de fiabilité d'une analyse, en une phrase par sujet, sans que l'utilisateur ait à regarder toute la vidéo : part du temps où le terrain est SÛR, où le ballon est VU,
   et les passages à regarder. Tout ce qui n'est pas calculé est dit « non évalué » (jamais un chiffre inventé). Pur : aucune dépendance à l'interface.
   camSuivi : { frames: [[t, h, q]], lost: [[a, b]], t0, t1 } ; frames : images analysées [{ t, ball }] ; seuil : durée minimale d'un passage signalé (s). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalBilan = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const pct = (x) => String(Math.round(x * 1000) / 10).replace(".", ",") + " %";
  const mmss = (t) => { const s = Math.max(0, Math.round(t)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };

  /* Plages [de, a] d'une suite d'instants où pred(f) est vrai, à ≤ trou s d'écart, d'au moins duree s. */
  function plages(items, pred, trou, duree) {
    const out = []; let cur = null;
    items.forEach((f) => {
      if (!pred(f)) { if (cur) { out.push(cur); cur = null; } return; }
      if (cur && f.t - cur.a <= trou) cur.a = f.t; else { if (cur) out.push(cur); cur = { de: f.t, a: f.t }; }
    });
    if (cur) out.push(cur);
    return out.filter((p) => p.a - p.de >= duree);
  }

  function bilan(ai, opts) {
    const o = Object.assign({ seuil: 8, max: 5 }, opts || {}), lignes = [];
    const cs = ai && ai.camSuivi, fr = (ai && Array.isArray(ai.frames) ? ai.frames : []).filter((f) => f && isFinite(f.t));
    // terrain
    if (cs && Array.isArray(cs.frames) && cs.frames.length) {
      const sv = cs.frames.map((c) => ({ t: c[0], q: c[2] })), sure = sv.filter((s) => s.q === 1 || s.q === 2).length / sv.length;
      const non = plages(sv, (s) => !(s.q === 1 || s.q === 2), 1, o.seuil), perdues = (cs.lost || []).filter((r) => r[1] - r[0] >= o.seuil);
      let t = "Terrain sûr sur " + pct(sure) + " de la vidéo suivie";
      if (non.length || perdues.length) t += " ; à regarder : " + non.slice(0, o.max).map((p) => mmss(p.de) + "–" + mmss(p.a) + " (tracé non confirmé)").concat(perdues.slice(0, o.max).map((r) => mmss(r[0]) + "–" + mmss(r[1]) + " (caméra perdue)")).join(", ");
      lignes.push({ sujet: "terrain", texte: t + ".", sure });
    } else lignes.push({ sujet: "terrain", texte: "Terrain : suivi de la caméra non fait, non évalué." });
    // ballon
    if (fr.length) {
      const vu = fr.filter((f) => f.ball).length / fr.length, sans = plages(fr, (f) => !f.ball, 1.5, o.seuil);
      lignes.push({ sujet: "ballon", texte: "Ballon vu sur " + pct(vu) + " des images analysées" + (sans.length ? " ; sans ballon plus de " + o.seuil + " s : " + sans.slice(0, o.max).map((p) => mmss(p.de) + "–" + mmss(p.a)).join(", ") + (sans.length > o.max ? "…" : "") : "") + ". Ce chiffre n'est PAS une justesse : il dit seulement quand un ballon a été retenu ; la justesse se mesure sur une vidéo jamais utilisée.", vu });
    } else lignes.push({ sujet: "ballon", texte: "Ballon : pas d'analyse faite, non évalué." });
    // événements
    const em = (ai && ai.evenementsMatch) || [];
    if (em.length) lignes.push({ sujet: "evenements", texte: "Événements du match : " + em.filter((e) => e.statut === "ok").length + " validé(s), " + em.filter((e) => e.statut === "non").length + " écarté(s), " + em.filter((e) => !e.statut).length + " à valider." });
    lignes.push({ sujet: "personnes", texte: "Personnes identifiées : non évalué ici (les fiches se vérifient dans le registre des personnes)." });
    return lignes;
  }
  return { bilan, plages, mmss };
});
