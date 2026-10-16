/* Contexte du match, image par image, à partir des seuls faits visibles (catégorie A : positions, vitesses, ballon
   détecté, ballon vu hors du terrain, gardien dans sa surface). Les déductions (catégorie B : ballon tenu, arrêt de jeu)
   portent une confiance et ne reposent jamais sur une autre déduction. Rien d'invisible (sifflet, score, fautes) n'est
   utilisé. Entrée : images normalisées de match.js ({ t, A, B, ball }, mon équipe attaque vers x croissant). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalContext = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const OUT_MARGIN = 0.3;      // m : ballon vu au-delà d'une ligne
  const BACK_IN = 0.5;         // m : ballon revu à l'intérieur du terrain (reprise du jeu)
  const SHORT_GAP = 0.8;       // s : un trou plus court ne gêne pas l'analyse
  const STILL_GAP = 2.0;       // s : ballon absent au moins ce temps…
  const STILL_SPEED = 1.2;     // m/s : …avec des joueurs presque arrêtés -> arrêt de jeu probable
  const HOLD_DIST = 1.0;       // m : ballon disparu tout près d'un joueur
  const HOLD_SPEED = 2.0;      // m/s : joueur qui bouge peu pendant qu'il le tient
  const HOLD_BACK = 2.0;       // m : ballon revu près de ce même joueur
  const AREA = 6;              // m : surface de réparation (futsal)
  const GK_DIST = 2.5;         // m : ballon arrêté ou pris par le gardien
  const CONF_MIN = 0.6;        // confiance minimale d'une déduction pour être utilisée

  const all = (f) => f.A.concat(f.B);
  const fmt = (t) => { const s = Math.max(0, Math.round(t)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };

  /* Vitesse moyenne des joueurs (A, fait mesuré) entre les images i et j, par appariement des identifiants. */
  function meanSpeed(nf, i, j) {
    let sum = 0, n = 0;
    for (let k = Math.max(1, i); k <= j; k++) {
      const dt = nf[k].t - nf[k - 1].t;
      if (!(dt > 0)) continue;
      const prev = new Map(all(nf[k - 1]).map((p) => [p.id, p]));
      all(nf[k]).forEach((p) => { const q = prev.get(p.id); if (q) { sum += Math.hypot(p.x - q.x, p.y - q.y) / dt; n++; } });
    }
    return n ? sum / n : null;
  }

  const isOut = (b, L, W) => b.x < -OUT_MARGIN || b.x > L + OUT_MARGIN || b.y < -OUT_MARGIN || b.y > W + OUT_MARGIN;
  const isIn = (b, L, W) => b.x > BACK_IN && b.x < L - BACK_IN && b.y > BACK_IN && b.y < W - BACK_IN;

  /* Renvoie { states: [{ play: "jeu" | "arret" | "incertain", held: { id, team, gk, conf } | null, conf }],
               passages: [{ t0, t1, kind, text }], reliable: { ratio, sec, total } }.
     opts : { L, W, lost: [[t0, t1]] (caméra perdue), span: [t0, t1] (plage analysée) } */
  function analyzeContext(nf, opts) {
    opts = opts || {};
    const L = opts.L || 40, W = opts.W || 20, n = nf.length;
    const states = nf.map((f) => ({ play: "jeu", held: null, conf: f.ball ? 1 : 0, why: null }));
    if (!n) return { states, passages: [], reliable: { ratio: 0, sec: 0, total: 0 } };

    // 1. Ballon vu hors du terrain (A) : arrêt jusqu'à ce qu'il soit revu à l'intérieur (rentrée, corner, relance)
    for (let i = 0; i < n; i++) {
      const b = nf[i].ball;
      if (!b || !isOut(b, L, W)) continue;
      // vocabulaire du futsal : touche -> rentrée de touche au pied ; ligne de but -> corner ou relance du gardien
      const kind = b.x < -OUT_MARGIN || b.x > L + OUT_MARGIN ? "ligne de but : corner ou relance du gardien" : "en touche : rentrée de touche au pied";
      let j = i;
      while (j + 1 < n && !(nf[j + 1].ball && isIn(nf[j + 1].ball, L, W))) j++;
      for (let k = i; k <= j; k++) { states[k].play = "arret"; states[k].conf = 0.8; states[k].why = "ballon sorti (" + kind + ")"; }
      i = j;
    }

    // 2. Trous dans le ballon : tenu par un joueur (B), arrêt probable (B) ou incertain
    for (let i = 0; i < n; i++) {
      if (nf[i].ball || states[i].play === "arret") continue;
      let j = i;
      while (j + 1 < n && !nf[j + 1].ball && states[j + 1].play !== "arret") j++;
      const t0 = i > 0 ? nf[i - 1].t : nf[i].t, t1 = j + 1 < n ? nf[j + 1].t : nf[j].t, dur = t1 - t0;
      if (dur <= SHORT_GAP) { i = j; continue; }                          // trou court : jeu normal
      const held = heldBy(nf, i, j, L);
      const still = meanSpeed(nf, i, j);
      let st;
      if (held && held.conf >= CONF_MIN) st = { play: "jeu", held, conf: held.conf, why: (held.gk ? "ballon tenu par le gardien" : "ballon tenu par un joueur") };
      else if (dur >= STILL_GAP && still != null && still < STILL_SPEED) st = { play: "arret", held: null, conf: 0.6, why: "arrêt de jeu probable (ballon absent, joueurs presque arrêtés)" };
      else st = { play: "incertain", held: null, conf: 0, why: "ballon non visible" };
      for (let k = i; k <= j; k++) Object.assign(states[k], st);
      i = j;
    }

    // 3. Passages (au moins 1 s) et part du temps analysée de façon fiable
    const passages = [];
    const push = (t0, t1, kind, text) => { if (t1 - t0 >= 1 - 1e-6) passages.push({ t0, t1, kind, text }); };
    for (let i = 0; i < n; i++) {
      const s = states[i];
      const key = s.play === "jeu" && !s.held ? null : s.play + "|" + s.why;
      if (!key) continue;
      let j = i;
      while (j + 1 < n && (states[j + 1].play + "|" + states[j + 1].why) === key && !(states[j + 1].play === "jeu" && !states[j + 1].held)) j++;
      const t0 = nf[i].t, t1 = j + 1 < n ? nf[j + 1].t : nf[j].t;
      if (s.play === "incertain") push(t0, t1, "incertain", "Ballon non visible entre " + fmt(t0) + " et " + fmt(t1) + " : non analysé.");
      else if (s.play === "arret") push(t0, t1, "arret", (s.why.startsWith("ballon sorti") ? "Ballon sorti (" + s.why.slice(14, -1) + ")" : "Arrêt de jeu probable") + " entre " + fmt(t0) + " et " + fmt(t1) + " : aucune erreur recherchée.");
      else if (s.held) push(t0, t1, "tenu", (s.held.gk ? "Ballon tenu par le gardien" : "Ballon tenu par un joueur") + " entre " + fmt(t0) + " et " + fmt(t1) + ".");
      i = j;
    }
    (opts.lost || []).forEach(([a, b]) => push(a, b, "camera", "Caméra perdue entre " + fmt(a) + " et " + fmt(b) + " : non analysé."));
    passages.sort((a, b) => a.t0 - b.t0);

    const span = opts.span || [nf[0].t, nf[n - 1].t];
    const total = Math.max(0, span[1] - span[0]);
    // chaque image vaut le pas habituel entre deux images (pas plus : un trou n'est pas du temps analysé)
    const steps = []; for (let i = 1; i < n; i++) steps.push(nf[i].t - nf[i - 1].t);
    const step = steps.length ? steps.slice().sort((x, y) => x - y)[steps.length >> 1] : 0;
    let sec = 0;
    for (let i = 0; i < n; i++) {
      const dt = i + 1 < n ? Math.min(nf[i + 1].t - nf[i].t, step) : step;
      if (states[i].play === "jeu") sec += dt;
    }
    sec = Math.min(sec, total);
    return { states, passages, reliable: { ratio: total ? Math.round((sec / total) * 100) / 100 : 0, sec: Math.round(sec * 10) / 10, total: Math.round(total * 10) / 10 } };
  }

  /* Ballon tenu (B) pendant le trou i..j : il a disparu tout près d'un joueur (A) qui bouge peu, et il est revu près de
     ce même joueur, ou le joueur est le gardien dans sa surface. Confiance 0 à 1. */
  function heldBy(nf, i, j, L) {
    if (i === 0) return null;
    const b = nf[i - 1].ball;
    if (!b) return null;
    let best = null, bd = HOLD_DIST;
    all(nf[i - 1]).forEach((p) => { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } });
    // gardien : ballon vu en dernier à moins de GK_DIST m de lui, dans sa surface (+1 m), et allant vers lui (arrêt,
    // prise en main) ; prioritaire sur un joueur de champ proche (tir arrêté)
    const prevB = i > 1 ? nf[i - 2].ball : null;
    all(nf[i - 1]).forEach((p) => {
      if (!p.gk) return;
      const own = nf[i - 1].A.includes(p) ? p.x <= AREA + 1 : p.x >= L - AREA - 1;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      const toward = !prevB || Math.hypot(p.x - prevB.x, p.y - prevB.y) > d;
      if (own && toward && d < GK_DIST) best = p;
    });
    if (!best) return null;
    const team = nf[i - 1].A.includes(best) ? "A" : "B";
    const track = [];
    for (let k = i; k <= j; k++) { const p = all(nf[k]).find((q) => q.id === best.id); if (p) track.push([nf[k].t, p]); }
    if (track.length < Math.max(1, (j - i + 1) * 0.5)) return null;     // joueur trop peu suivi pendant le trou
    let sp = 0;
    for (let k = 1; k < track.length; k++) { const dt = track[k][0] - track[k - 1][0]; if (dt > 0) sp = Math.max(sp, Math.hypot(track[k][1].x - track[k - 1][1].x, track[k][1].y - track[k - 1][1].y) / dt); }
    if (sp > HOLD_SPEED * 2) return null;
    const last = track[track.length - 1][1];
    const back = j + 1 < nf.length ? nf[j + 1].ball : null;
    // le gardien prend le ballon dans sa surface (il peut ensuite avancer avant de relancer)
    const inArea = best.gk && (team === "A" ? best.x <= AREA + 1 : best.x >= L - AREA - 1);
    let conf = 0.3;
    if (back && Math.hypot(back.x - last.x, back.y - last.y) <= HOLD_BACK) conf += 0.4;
    else if (best.gk && inArea && back && (team === "A" ? back.x > last.x : back.x < last.x)) conf += 0.2;   // relance vers l'avant
    if (inArea) conf += 0.2;
    if (sp <= HOLD_SPEED) conf += 0.1;
    return { id: best.id, team, gk: !!best.gk, conf: Math.round(Math.min(1, conf) * 100) / 100 };
  }

  return { analyzeContext, CONF_MIN, AREA };
});
