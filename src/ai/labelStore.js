/* Étiquettes faites à la main par le coach (menu « Étiquetage ») : ballon ET joueurs, sur les images d'une vidéo.
   Rien n'est deviné ni proposé par le programme : chaque donnée est un clic ou un cadre du coach. Les cadres servent seulement à mesurer
   puis à entraîner (jamais à l'affichage de l'analyse).
   Format (un fichier par vidéo) :
   { version: 1, video: { name, size, duration, vw, vh },
     pos?: ms de la dernière image regardée,
     persons: [{ id, nom, team, role }],                       fiches des personnes (joueurs, remplaçants, arbitre…)
     frames: { "<ms>": { ball?: { state: "vu"|"aucun"|"incertain", u?, v? },       u, v en pixels de la vidéo
                         boxes?: [{ id, x1, y1, x2, y2, team, who? }],            who = id d'une fiche
                         playersDone?: true } } }                                 « toutes les personnes de cette image sont cadrées » */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalLabelStore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const GRID_FPS = 3;                         // les images étiquetables : 3 par seconde (même grille que la mesure du ballon)
  const TEAMS = { A: "Mon équipe", B: "Adversaire", GKA: "Mon gardien", GKB: "Gardien adverse", ARB: "Arbitre", BANC: "Remplaçant / banc", PUBLIC: "Public / spectateur", AUTRE: "Autre personne" };
  const BALL_STATES = { vu: 1, aucun: 1, incertain: 1 };
  const MIN_BOX = 6;                          // un cadre de moins de 6 px est un clic involontaire
  const MAX_PERSONS = 60;

  const msKey = (t) => Math.round(t * 1000);
  const gridMs = (k) => Math.round((k * 1000) / GRID_FPS);
  /* Image de la grille la plus proche d'un instant (en ms). */
  const snap = (t) => gridMs(Math.round(t * GRID_FPS));
  /* Indice de la dernière image de la grille (l'instant doit rester avant la fin de la vidéo). */
  const gridCount = (duration) => Math.max(0, Math.ceil(duration * GRID_FPS - 1e-9) - 1);

  function create(video) {
    return { version: 1, video: { name: String(video.name || ""), size: Number(video.size) || 0, duration: Number(video.duration) || 0, vw: Number(video.vw) || 0, vh: Number(video.vh) || 0 }, persons: [], frames: {} };
  }
  /* Relit un fichier de progression : refuse ce qui n'a pas la forme attendue, sans jamais lever d'erreur. */
  function normalize(raw) {
    if (!raw || typeof raw !== "object" || raw.version !== 1 || !raw.video || typeof raw.video !== "object") return null;
    const d = create(raw.video);
    if (Array.isArray(raw.persons)) raw.persons.slice(0, MAX_PERSONS).forEach((p) => {
      if (p && typeof p.id === "string" && TEAMS[p.team]) d.persons.push({ id: p.id, nom: String(p.nom || "").slice(0, 60), team: p.team, role: String(p.role || "").slice(0, 30) });
    });
    if (isFinite(raw.pos) && raw.pos >= 0) d.pos = Math.round(raw.pos);      // dernière image regardée : la reprise se fait au même endroit
    const f = raw.frames && typeof raw.frames === "object" ? raw.frames : {};
    Object.keys(f).forEach((k) => {
      if (!/^\d{1,9}$/.test(k) || !f[k] || typeof f[k] !== "object") return;
      const o = {}, s = f[k];
      if (s.ball && BALL_STATES[s.ball.state]) {
        if (s.ball.state === "vu") { if (isFinite(s.ball.u) && isFinite(s.ball.v)) o.ball = { state: "vu", u: s.ball.u, v: s.ball.v }; }
        else o.ball = { state: s.ball.state };
      }
      if (Array.isArray(s.boxes)) {
        const b = s.boxes.filter((x) => x && typeof x.id === "string" && [x.x1, x.y1, x.x2, x.y2].every(isFinite) && TEAMS[x.team] && x.x2 - x.x1 >= 1 && x.y2 - x.y1 >= 1)
          .map((x) => { const r = { id: x.id, x1: x.x1, y1: x.y1, x2: x.x2, y2: x.y2, team: x.team }; if (typeof x.who === "string") r.who = x.who; return r; });
        if (b.length) o.boxes = b;
      }
      if (s.playersDone === true) o.playersDone = true;
      if (o.ball || o.boxes || o.playersDone) d.frames[k] = o;
    });
    return d;
  }

  function frame(d, ms, create) { const k = String(ms); if (!d.frames[k] && create) d.frames[k] = {}; return d.frames[k] || null; }
  const inside = (d, u, v) => isFinite(u) && isFinite(v) && u >= 0 && v >= 0 && u <= d.video.vw && v <= d.video.vh;

  /* Ballon : « vu » (clic), « aucun » (aucun ballon visible), « incertain » (ni pour ni contre). Un clic en dehors de l'image est refusé. */
  function setBall(d, ms, state, u, v) {
    if (!BALL_STATES[state]) return false;
    if (state === "vu" && !inside(d, u, v)) return false;
    frame(d, ms, true).ball = state === "vu" ? { state, u: Math.round(u), v: Math.round(v) } : { state };
    return true;
  }
  function clearBall(d, ms) { const f = frame(d, ms); if (f) { delete f.ball; prune(d, ms); } }

  function newId(list, prefix) {
    let n = 1; const used = new Set(list.map((x) => x.id));
    while (used.has(prefix + n)) n++;
    return prefix + n;
  }
  /* Ajoute un cadre ; les coins sont remis dans l'ordre et dans l'image. Renvoie le cadre, ou null s'il est trop petit. */
  function addBox(d, ms, b) {
    if (!TEAMS[b.team]) return null;
    const cl = (x, m) => Math.min(m, Math.max(0, x));
    const x1 = cl(Math.min(b.x1, b.x2), d.video.vw), x2 = cl(Math.max(b.x1, b.x2), d.video.vw), y1 = cl(Math.min(b.y1, b.y2), d.video.vh), y2 = cl(Math.max(b.y1, b.y2), d.video.vh);
    if (![x1, x2, y1, y2].every(isFinite) || x2 - x1 < MIN_BOX || y2 - y1 < MIN_BOX) return null;
    const f = frame(d, ms, true); f.boxes = f.boxes || [];
    const r = { id: newId(f.boxes, "c"), x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), team: b.team };
    if (b.who && d.persons.some((p) => p.id === b.who)) r.who = b.who;
    f.boxes.push(r);
    return r;
  }
  function boxes(d, ms) { const f = frame(d, ms); return f && f.boxes ? f.boxes : []; }
  function removeBox(d, ms, id) { const f = frame(d, ms); if (!f || !f.boxes) return false; const n = f.boxes.length; f.boxes = f.boxes.filter((b) => b.id !== id); if (!f.boxes.length) delete f.boxes; prune(d, ms); return f.boxes ? f.boxes.length < n : n > 0; }
  function setBoxTeam(d, ms, id, team) { const b = boxes(d, ms).find((x) => x.id === id); if (!b || !TEAMS[team]) return false; b.team = team; return true; }
  function setBoxWho(d, ms, id, who) {
    const b = boxes(d, ms).find((x) => x.id === id);
    if (!b) return false;
    if (!who) { delete b.who; return true; }
    if (!d.persons.some((p) => p.id === who)) return false;
    b.who = who; return true;
  }
  function setPlayersDone(d, ms, done) { const f = frame(d, ms, true); if (done) f.playersDone = true; else delete f.playersDone; prune(d, ms); }
  function prune(d, ms) { const f = d.frames[String(ms)]; if (f && !f.ball && !f.boxes && !f.playersDone) delete d.frames[String(ms)]; }

  /* Fiches : une par personne (joueurs, remplaçants, arbitre…), créées par le coach, jamais devinées. */
  function addPerson(d, p) {
    if (!TEAMS[p.team] || d.persons.length >= MAX_PERSONS) return null;
    const r = { id: newId(d.persons, "p"), nom: String(p.nom || "").trim().slice(0, 60), team: p.team, role: String(p.role || "").trim().slice(0, 30) };
    d.persons.push(r); return r;
  }
  function removePerson(d, id) {
    d.persons = d.persons.filter((p) => p.id !== id);
    Object.keys(d.frames).forEach((k) => (d.frames[k].boxes || []).forEach((b) => { if (b.who === id) delete b.who; }));
  }

  function counts(d) {
    const c = { vu: 0, aucun: 0, incertain: 0, imagesJoueurs: 0, cadres: 0 };
    Object.keys(d.frames).forEach((k) => {
      const f = d.frames[k];
      if (f.ball) c[f.ball.state]++;
      if (f.playersDone) c.imagesJoueurs++;
      if (f.boxes) c.cadres += f.boxes.length;
    });
    return c;
  }
  /* Prochaine image à faire dans le sens dir (+1/-1), en ne regardant qu'une image de la grille sur « every » (≥ 1).
     kind « ballon » : sans réponse pour le ballon ; kind « joueurs » : joueurs pas marqués comme terminés. Renvoie des ms, ou null. */
  function nextTodo(d, kind, fromMs, every, dir) {
    const n = gridCount(d.video.duration), step = Math.max(1, Math.round(every) || 1), s = dir < 0 ? -1 : 1;
    let k = fromMs < 0 ? 0 : Math.round((fromMs * GRID_FPS) / 1000) + s * step;
    k = Math.round(k / step) * step;
    if (fromMs >= 0 && s > 0 && k <= Math.round((fromMs * GRID_FPS) / 1000)) k += step;
    if (s < 0 && k >= Math.round((fromMs * GRID_FPS) / 1000)) k -= step;
    for (; k >= 0 && k <= n; k += s * step) {
      const ms = gridMs(k), f = d.frames[String(ms)];
      if (kind === "joueurs" ? !(f && f.playersDone) : !(f && f.ball)) return ms;
    }
    return null;
  }
  /* Ce qui sert à l'entraînement et à la mesure du ballon : « incertain » en est exclu, comme dans l'outil de la session. */
  function trainingBalls(d) {
    return Object.keys(d.frames).filter((k) => d.frames[k].ball && d.frames[k].ball.state !== "incertain").map((k) => Object.assign({ ms: Number(k) }, d.frames[k].ball)).sort((a, b) => a.ms - b.ms);
  }
  return { GRID_FPS, TEAMS, MIN_BOX, msKey, gridMs, snap, gridCount, create, normalize, setBall, clearBall, addBox, boxes, removeBox, setBoxTeam, setBoxWho, setPlayersDone, addPerson, removePerson, counts, nextTodo, trainingBalls };
});
