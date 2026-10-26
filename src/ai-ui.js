/* Volet « Analyse IA » : calibrage du terrain, choix des tenues, analyse de la vidéo, résultats (cadres, mini-carte, erreurs suggérées). */
(function () {
  "use strict";
  const App = window.FSApp;
  const KB = window.FutsalKB, HG = window.FutsalHomography, K = window.FutsalKit, P = window.FutsalPipeline, M = window.FutsalMatch, V2 = window.FutsalMatchV2, RG = window.FutsalRegles, E = window.FutsalAnim, D = window.FutsalDoubt, BL = window.FutsalBallLabels, Z = window.FutsalZoom, O = window.FutsalOverlay, Q = window.FutsalQuality, EX = window.FutsalExemples;
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const video = App.video, api = App.api, state = App.state;

  const ROLES = [["A", "Mon équipe", "#2f6fed"], ["B", "Adversaire", "#e5484d"], ["GKA", "Mon gardien", "#f2b705"], ["GKB", "Gardien adverse", "#ff8a3d"], ["REF", "Arbitre", "#a78bfa"]];
  const TEAM_COLOR = { A: "#3b82f6", B: "#ef4444", GKA: "#f2b705", GKB: "#ff8a3d", REF: "#a78bfa", UNK: "#9aa5a0" };
  const PARTS = { shirt: "le MAILLOT", shorts: "le SHORT", socks: "les CHAUSSETTES", trim: "les MANCHES / le LISERÉ" };
  let pts = [];              // repères en cours de placement : { id, label, ix, iy }
  let placing = null;        // identifiant du repère à placer
  let pickRole = null;       // rôle de tenue à choisir
  const exRot = {};          // « Aller à un instant… » : nombre de clics par catégorie et dernier instant proposé (pour proposer un instant différent à chaque clic)
  let more = null;           // « ＋ Autre exemple » depuis la liste des équipes : { key, t } (t = instant où revenir après validation)
  let qGroup = null;         // proposition d'appliquer la même réponse aux pistes de la même personne : { team, q, group }
  let qHighlight = null;     // personne désignée par une question : { t, b } (cadre orange sur la vidéo)
  const CT = window.FutsalContour, SIL = window.FutsalSilhouette, ACC = window.FutsalAccroche, BCH = window.FutsalBancs;
  let selPt = null;          // repère sélectionné dans la liste (flèches du clavier : décalage fin)
  const contours = new Map();          // contours des personnes par image : temps (ms) -> { state: "pending" | "ready" | "fail", items: [{ id, mask }], k, p }
  let contChain = Promise.resolve(), shadow = null, shadowUrl = "";
  let benchMark = null;      // marquage d'une zone de banc en cours : { t, H, first: [x, y] | null }
  let frames = [];           // trajectoires (format d'analyse)
  let abort = null;
  let running = false;
  let live = null;           // image affichée pendant l'analyse
  let pip = null;            // pipette en cours : { role, parts: { shirt, shorts, socks, trim }, part, points }
  let preview = null;        // aperçu de la reconnaissance sur l'image en pause
  let lastTest = null;       // dernière détection (pour re-classer quand la tolérance change)
  let raf = 0;
  const layers = [];         // couches de dessin ajoutées par l'assistant : fn(ctx, { toView, rect })
  let linePick = false;       // l'utilisateur montre une ligne en cliquant dessus (nuance apprise)
  let pointer = null;        // gestionnaires de souris de l'assistant : { click, down, move, up, cursor }

  /* ---------- données du projet ---------- */
  function ai() {
    const p = state.project;
    if (!p.ai) p.ai = { L: 40, W: 20, dir: 1, flip: true, camera: "mobile", calibrations: [], kits: {}, frames: null, stats: null, suggestedEvents: [], settings: { fps: 3, tiles: 1, t0: 0, t1: 0, tol: 42 } };
    return p.ai;
  }
  const hasAi = () => !!state.project.ai;
  function dirAt(t) {
    const a = ai();
    const second = a.flip && typeof state.project.secondHalfStart === "number" && t >= state.project.secondHalfStart;
    return (a.dir || 1) * (second ? -1 : 1);
  }
  function refs() {
    const a = ai();
    if (EX) return EX.refs(a.kits, { multi: !!a.exemplesParInstant });
    const out = {};
    Object.keys(a.kits).forEach((k) => { if (a.kits[k] && a.kits[k].length) out[k] = K.average(a.kits[k]); });
    return out;
  }
  /* Instant et vidéo d'un exemple donné maintenant (gardés dans le projet avec l'échantillon). */
  const marque = (feat, src, t) => (EX ? EX.marquer(feat, { t: typeof t === "number" ? t : video.currentTime || 0, v: state.project.videoName || null, src }) : feat);
  const L = () => ai().L, W = () => ai().W;

  /* ---------- géométrie de l'affichage ---------- */
  function boxSize() { const b = $("video-box"); return { w: b.clientWidth, h: b.clientHeight }; }
  /* Zoom de la vidéo : { k, tx, ty } ; la vidéo ajustée à la boîte est agrandie de k puis déplacée de (tx, ty). Les coordonnées en pixels de
     la vidéo ne changent pas : tous les clics et repères passent par videoRect(), donc restent exacts à n'importe quel zoom. */
  let zm = { k: 1, tx: 0, ty: 0 };
  function baseRect() {
    const { w, h } = boxSize();
    const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
    const s = Math.min(w / vw, h / vh);
    return { s, x: (w - vw * s) / 2, y: (h - vh * s) / 2, vw, vh };
  }
  function videoRect() { return Z.apply(baseRect(), zm); }
  function setZoom(z) {
    const { w, h } = boxSize();
    zm = Z.clampPan(z.k, z.tx, z.ty, w, h);
    video.style.transformOrigin = "0 0";
    video.style.transform = zm.k === 1 ? "" : "translate(" + zm.tx + "px," + zm.ty + "px) scale(" + zm.k + ")";
    $("video-box").classList.toggle("zoomed", zm.k > 1);
    const rs = $("zm-reset"); if (rs) rs.textContent = zm.k === 1 ? "1×" : (Math.round(zm.k * 10) / 10) + "×";
    drawOverlay();
  }
  function zoomBy(factor, mx, my) { const { w, h } = boxSize(); setZoom(Z.zoomAt(zm, mx == null ? w / 2 : mx, my == null ? h / 2 : my, factor, w, h)); }
  function zoomOnPoint(u, v, k) { const { w, h } = boxSize(); setZoom(Z.centerOn(baseRect(), u, v, k, w, h)); }
  function bindZoom() {
    const box = $("video-box");
    box.addEventListener("wheel", (e) => {
      if (!video.videoWidth || video.hidden) return;
      e.preventDefault();
      const r = box.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    $("zm-in").addEventListener("click", () => zoomBy(1.5)); $("zm-out").addEventListener("click", () => zoomBy(1 / 1.5)); $("zm-reset").addEventListener("click", () => setZoom({ k: 1, tx: 0, ty: 0 }));
    // glisser pour déplacer l'image agrandie (désactivé pendant un outil qui utilise déjà le glisser) ; un glisser n'est jamais pris pour un clic
    let drag = null, moved = false;
    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || zm.k <= 1 || pointer || (e.target && e.target.closest && e.target.closest(".zoom-ctl"))) return;
      drag = { x: e.clientX, y: e.clientY, tx: zm.tx, ty: zm.ty }; moved = false;
    });
    document.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; box.classList.add("panning");
      setZoom({ k: zm.k, tx: drag.tx + dx, ty: drag.ty + dy });
    });
    document.addEventListener("pointerup", () => { if (!drag) return; drag = null; box.classList.remove("panning"); if (moved) setTimeout(() => { moved = false; }, 0); });
    box.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    window.addEventListener("resize", () => { if (zm.k > 1) setZoom(zm); });
  }
  function toVideo(ox, oy) { const r = videoRect(); return [(ox - r.x) / r.s, (oy - r.y) / r.s]; }
  function toView(ix, iy) { const r = videoRect(); return [ix * r.s + r.x, iy * r.s + r.y]; }

  function sizeOverlay() {
    const c = $("overlay"), { w, h } = boxSize();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    return dpr;
  }

  /* ---------- tracés ---------- */
  function courtPolylines() {
    const l = L(), w = W(), cy = w / 2, arc = (cx, cyy, r, a0, a1) => { const o = []; for (let i = 0; i <= 14; i++) { const a = ((a0 + ((a1 - a0) * i) / 14) * Math.PI) / 180; o.push([cx + r * Math.cos(a), cyy + r * Math.sin(a)]); } return o; };
    const left = arc(0, cy - 1.5, 6, -90, 0).concat(arc(0, cy + 1.5, 6, 0, 90));
    const right = left.map((p) => [l - p[0], p[1]]);
    return [[[0, 0], [l, 0], [l, w], [0, w], [0, 0]], [[l / 2, 0], [l / 2, w]], arc(l / 2, cy, 3, 0, 360), left, right];
  }

  /* ---------- contours des personnes (MobileSAM, hors ligne) ----------
     Une silhouette découpée (seulement si elle est fiable, sinon cercle au sol) : elle ne contient que la personne (pas le ballon posé à côté d'un pied). Calculée à la demande
     pour l'image affichée (1 à 2 s) et en avance pour la suivante ; jamais pour toute la vidéo. Si la découpe échoue, rien n'est inventé. */
  const loadShadow = async () => {
    const url = App.getVideoUrl();
    if (!url) throw new Error("vidéo absente");
    if (shadow && shadowUrl === url) return shadow;
    if (shadow) { shadow.removeAttribute("src"); shadow.load(); shadow = null; }
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v.src = url;
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("Vidéo illisible")); });
    shadow = v; shadowUrl = url;
    return v;
  };
  const seekShadow = (v, t) => new Promise((res) => {
    const to = Math.max(0, Math.min((v.duration || t) - 0.05, t));
    if (Math.abs(v.currentTime - to) < 1e-3 && v.readyState >= 2) { res(); return; }
    const d = () => { v.removeEventListener("seeked", d); res(); };
    v.addEventListener("seeked", d); v.currentTime = to; setTimeout(d, 4000);
  });
  const ckey = (t) => Math.round(t * 1000);
  const contoursReady = (f) => { const e = f && contours.get(ckey(f.t)); return e && e.state === "ready" ? e : null; };
  function getContours(f) {
    if (!f || !CT || !App.getVideoUrl() || !App.isVideoReady() || !video.videoWidth) return Promise.resolve(null);
    const key = ckey(f.t), old = contours.get(key);
    if (old) return old.p;
    const vw = video.videoWidth, vh = video.videoHeight, k = 1024 / Math.max(vw, vh), w = Math.max(2, Math.round(vw * k)), h = Math.max(2, Math.round(vh * k));
    const list = f.players.filter((p) => Array.isArray(p.b) && p.b.length === 4 && ((p.b[3] - p.b[1]) / 1000) * h >= 24 && ((p.b[2] - p.b[0]) / 1000) * w >= 8)
      .sort((a, b) => (b.b[2] - b.b[0]) * (b.b[3] - b.b[1]) - (a.b[2] - a.b[0]) * (a.b[3] - a.b[1])).slice(0, 24);
    const e = { state: "pending", items: [], k, t: f.t };
    if (!list.length) { e.state = "ready"; e.p = Promise.resolve(e); contours.set(key, e); return e.p; }
    e.p = contChain = contChain.then(async () => {
      try {
        const v = await loadShadow();
        await seekShadow(v, f.t);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const g = cv.getContext("2d", { willReadFrequently: true });
        g.drawImage(v, 0, 0, w, h);
        const img = g.getImageData(0, 0, w, h);
        const allp = f.players.filter((p) => Array.isArray(p.b) && p.b.length === 4), px = (p) => [(p.b[0] / 1000) * w, (p.b[1] / 1000) * h, (p.b[2] / 1000) * w, (p.b[3] / 1000) * h];
        const around = allp.map((p) => ({ id: p.id, box: px(p) }));      // toutes les personnes de l'image : les voisins servent à ne pas les mélanger
        const boxes = list.map(px), negs = list.map((p) => SIL.negativesFor(allp.indexOf(p), around));
        const res = await FSAI.segment({ imgId: "c" + key + "-" + Date.now().toString(36), width: w, height: h, buffer: img.data.buffer.slice(0), boxes, negs });
        if (!res || res.error) throw new Error(res && res.error ? res.error : "réponse vide");
        e.items = list.map((p, i) => ({ id: p.id, mask: res.masks[i] && res.masks[i].data ? { x0: res.masks[i].x0, y0: res.masks[i].y0, w: res.masks[i].w, h: res.masks[i].h, data: res.masks[i].data instanceof Uint8Array ? res.masks[i].data : new Uint8Array(res.masks[i].data), area: res.masks[i].area, iou: res.masks[i].iou, stab: res.masks[i].stab } : null }))
          .filter((it) => it.mask && it.mask.area > 30);
        // seule une silhouette FIABLE est gardée ; les autres personnes auront un cercle au sol (jamais une découpe douteuse, jamais un cadre)
        const have = new Map(e.items.map((it) => [it.id, it.mask])), verdict = SIL.evaluateAll(around.map((a) => ({ id: a.id, box: a.box, mask: have.get(a.id) || null })));
        const okIds = new Set(verdict.filter((v) => v.ok).map((v) => v.id));
        e.items = e.items.filter((it) => okIds.has(it.id)).map((it) => Object.assign(it, { box: around.find((a) => a.id === it.id).box }));
        e.state = "ready";
      } catch (_err) { e.state = "fail"; }
      drawOverlay();
      return e;
    });
    contours.set(key, e);
    if (contours.size > 40) contours.delete(contours.keys().next().value);
    return e.p;
  }
  /* Trace les contours de l'image f. only : un seul identifiant (la personne d'une question, en orange avec son étiquette). Renvoie vrai si dessiné. */
  function drawContours(ctx, f, only, label) {
    const e = contoursReady(f);
    if (!e) return false;
    let drawn = false;
    e.items.forEach((it) => {
      if (only != null && it.id !== only) return;
      if (!it.poly) it.poly = CT.outline(it.mask, 0.8);
      if (!it.poly) return;
      const pl = f.players.find((p) => p.id === it.id), col = only != null ? "#f97316" : TEAM_COLOR[pl ? pl.team : "UNK"] || TEAM_COLOR.UNK;
      ctx.strokeStyle = col; ctx.lineWidth = only != null ? 3 : 2; ctx.lineJoin = "round";
      ctx.beginPath();
      it.poly.forEach((p, n) => { const v = toView(p[0] / e.k, p[1] / e.k); if (n) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); });
      ctx.closePath(); ctx.stroke();
      if (only != null && label) {
        let top = Infinity, left = Infinity;
        it.poly.forEach((p) => { const v = toView(p[0] / e.k, p[1] / e.k); if (v[1] < top) { top = v[1]; left = v[0]; } });
        ctx.font = "700 13px 'Segoe UI',Arial,sans-serif";
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = "#f97316"; ctx.fillRect(left - tw / 2, top - 22, tw, 20); ctx.fillStyle = "#fff"; ctx.fillText(label, left - tw / 2 + 5, top - 7);
      }
      drawn = true;
    });
    return drawn;
  }
  /* Cercle au sol d'une personne (jamais de cadre) : projeté avec le terrain de cette image quand il est cohérent avec ses pieds, sinon petite ellipse sous les pieds. */
  const groundInverse = (f) => { try { return f && Array.isArray(f.h) && f.h.length === 9 ? HG.invert(f.h) : null; } catch (_e) { return null; } };
  function drawGround(ctx, p, col, hInv, r, lw) {
    const pts = SIL.groundCircle(p, r.vw, r.vh, hInv, (Hi, x, y) => { const q = HG.apply(Hi, x, y); return [q[0] * r.vw, q[1] * r.vh]; });
    if (!pts) return;
    ctx.fillStyle = col + "33"; ctx.strokeStyle = col; ctx.lineWidth = lw || 2; ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((q, k) => { const v = toView(q[0], q[1]); if (k) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  let ctTimer = null;
  const scheduleContours = (f) => { clearTimeout(ctTimer); ctTimer = setTimeout(() => { if (video.paused && frames.length && Math.abs(f.t - (video.currentTime || 0)) < 0.15) getContours(f); }, 600); };
  const prefetchContours = (t) => { if (frames.length) { const f = P.frameNear(frames, t, 0.3); if (f) getContours(f); } };

  /* Ballon proposé par le programme : un simple cercle fin (le ballon reste visible à l'intérieur), avec son étiquette au-dessus. */
  function drawBallMarker(ctx) {
    if (!(qHighlight && qHighlight.ballPt && Math.abs((video.currentTime || 0) - qHighlight.t) < 0.4)) return;
    const v = toView(qHighlight.ballPt.u, qHighlight.ballPt.v);
    ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(v[0], v[1], 18, 0, Math.PI * 2); ctx.stroke();
    ctx.font = "700 13px 'Segoe UI',Arial,sans-serif"; const lb = qHighlight.label || "Ballon proposé", tw = ctx.measureText(lb).width + 10;
    ctx.fillStyle = "#f97316"; ctx.fillRect(v[0] - tw / 2, v[1] - 46, tw, 20); ctx.fillStyle = "#fff"; ctx.fillText(lb, v[0] - tw / 2 + 5, v[1] - 31);
  }
  /* Raison pour laquelle le terrain n'est pas tracé à l'instant t (jamais « non tracé » sans le dire). */
  function noTraceReason(a, t) {
    const l = a ? (O.lostAt(a.lost, t) || O.lostAt(a.camSuivi && a.camSuivi.lost, t)) : null, s = (a && a.settings) || {};
    if (l) return "caméra perdue de " + App.fmt(l.de) + " à " + App.fmt(l.a) + " (suivi interrompu)";
    if (suiviRun) return "suivi de la caméra en cours (" + suiviRun.pct + " %, il est arrivé à " + App.fmt(suiviRun.t || 0) + "), le terrain apparaîtra ici dès qu'il sera passé";
    const cs = a && a.camSuivi;
    if (cs && a.calibrations.length && t < a.calibrations[0].t - 0.5) return "avant le premier calibrage (" + App.fmt(a.calibrations[0].t) + ")";
    if (cs && t > cs.t1 + 0.5) return "après la fin du suivi de la caméra (" + App.fmt(cs.t1) + ")";
    if (!frames.length && !suiviFr.length) return "la caméra a bougé depuis le calibrage (le suivi de la caméra n'a pas encore été fait)";
    if (typeof s.t0 === "number" && typeof s.t1 === "number" && (t < s.t0 - 0.5 || t > s.t1 + 0.5)) return "hors de la plage analysée (" + App.fmt(s.t0) + " à " + App.fmt(s.t1) + ")";
    return "aucune image analysée près de cet instant, la caméra a bougé depuis le calibrage";
  }
  /* Bouton posé sur la vidéo quand le terrain n'est pas tracé : mène à l'image où ajouter un calibrage. */
  function calibGo(t, ok) {
    const b = $("ai-calib-go"); if (!b) return;
    const a = ai(), l = ok ? null : (a && (O.lostAt(a.lost, t) || O.lostAt(a.camSuivi && a.camSuivi.lost, t)));
    if (ok || !a || !a.calibrations.length || suiviRun) { b.hidden = true; return; }
    const c = l ? P.cibleCalibrage(l, (a.camSuivi && a.camSuivi.t1) || (a.settings && a.settings.t1) || video.duration || l.a) : null;
    b.dataset.t = String(c ? c.t : Math.round(t * 10) / 10);
    b.textContent = c ? "Ajouter un calibrage à " + App.fmt(c.t) + (c.reprise ? " (là où la caméra est retrouvée)" : " (juste après le décrochage)") : "Ajouter un calibrage ici";
    b.hidden = false;
  }
  function drawOverlay() {
    const c = $("overlay");
    if (c.hidden) { calibGo(0, true); const qb0 = $("ai-trace-q"); if (qb0) qb0.hidden = true; return; }
    c.classList.toggle("fixable", frames.length > 0 && !(placing || pickRole || pip || pointer || benchMark));      // un clic sur un cadre permet de corriger la personne
    const dpr = sizeOverlay();
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!video.videoWidth) return;
    const r = videoRect();
    const a = state.project.ai;
    const t = video.currentTime || 0;
    if (bs) {
      const fb = frames.length ? P.frameNear(frames, t, 0.3) : null;
      if (fb && !drawContours(ctx, fb)) getContours(fb);           // le contour arrive en 1 à 2 s ; en attendant, rien n'est dessiné sur les personnes
      drawBallMarker(ctx); return;
    }          // session d'étiquetage : image propre, pour voir le ballon sans cadre, silhouette ni terrain par-dessus
    // caméra perdue à cet instant : bandeau d'explication (les images de ce passage ne sont pas analysées)
    const lostNow = a ? O.lostAt(a.lost, t) : null;
    if (lostNow) {
      const msg = "Caméra perdue de " + App.fmt(lostNow.de) + " à " + App.fmt(lostNow.a) + " : ces images ne sont pas analysées";
      ctx.save(); ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
      const w = ctx.measureText(msg).width + 16;
      ctx.fillStyle = "rgba(185,28,28,.9)"; ctx.fillRect(8, 8, w, 26);
      ctx.fillStyle = "#fff"; ctx.fillText(msg, 16, 26); ctx.restore();
    }
    // aperçu du terrain calibré
    // (tracé seulement si la projection est fiable à cet instant ; sinon un message l'explique, pas de lignes absurdes)
    if (a && $("ov-court").checked) {
      const ch = P.courtH(frames, a.calibrations, a.camera || $("ai-camera").value, t, video.videoWidth, video.videoHeight, suiviFr);
      calibGo(t, !!(ch && ch.H));
      const qb = $("ai-trace-q"), qa = ch && ch.H ? qualiteAt(a, t) : null;
      if (qb) { qb.hidden = qa !== 0; if (qa === 0) qb.textContent = "Recalage incertain : le tracé vient du suivi seul ici (lignes non retrouvées)"; }
      if (ch && ch.H) {
        const Hi = HG.invert(ch.H), o = toView(0, 0), e = toView(r.vw, r.vh), far = 4;
        ctx.save(); ctx.beginPath(); ctx.rect(o[0], o[1], e[0] - o[0], e[1] - o[1]); ctx.clip();
        ctx.strokeStyle = "rgba(0,230,255,.9)"; ctx.lineWidth = 2;
        // près de l'action quand elle est connue (là où l'estimation de la caméra est fiable) ; sans image d'analyse à cet instant (suivi de la caméra seul), tout le terrain visible
        const fa = frames.length ? P.frameNear(frames, t, 0.3) : null, win = fa ? O.actionWindow(fa.players, L(), W(), 5) : null;
        courtPolylines().forEach((full) => {
          (win ? O.clipLine(full, win, 0.5) : (fa ? [] : [full])).forEach((pl) => {
            let pen = false;
            ctx.beginPath();
            pl.forEach((p) => {
              const q = HG.apply(Hi, p[0], p[1]);
              if (!isFinite(q[0]) || !isFinite(q[1]) || Math.abs(q[0]) > far * r.vw || Math.abs(q[1]) > far * r.vh) { pen = false; return; }
              const v = toView(q[0], q[1]);
              if (pen) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]);
              pen = true;
            });
            ctx.stroke();
          });
        });
        ctx.restore();
      } else if (ch) {
        ctx.fillStyle = "rgba(11,18,32,.85)"; ctx.fillRect(8, 8, Math.min(520, boxSize().w - 16), 26);
        ctx.fillStyle = "#fff"; ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
        ctx.fillText("Terrain non tracé ici : " + noTraceReason(a, t) + ".", 16, 26);
      }
    }
    // joueurs détectés
    const f = preview || live || (frames.length ? P.frameNear(frames, t, 0.8) : null);
    if (f && $("ov-boxes").checked) {
      // Jamais de cadre. Image arrêtée : silhouette FIABLE de la personne (calculée en arrière-plan, 1 à 2 s) ; sinon, et en lecture, cercle au sol.
      const still = !preview && !live && video.paused && Math.abs(f.t - t) < 0.15;
      const ceGen = still ? contoursReady(f) : null;
      if (ceGen) drawContours(ctx, f); else if (still) scheduleContours(f);
      const sil = new Set(ceGen ? ceGen.items.map((it) => it.id) : []), hInv = groundInverse(f);
      f.players.forEach((p) => {
        if (!p.b || p.b.length < 4) return;
        const x1 = (p.b[0] / 1000) * r.vw, y1 = (p.b[1] / 1000) * r.vh, x2 = (p.b[2] / 1000) * r.vw, y2 = (p.b[3] / 1000) * r.vh;
        const a1 = toView(x1, y1), a2 = toView(x2, y2);
        const col = TEAM_COLOR[p.team] || TEAM_COLOR.UNK;
        const w = a2[0] - a1[0], h = a2[1] - a1[1];
        if (!sil.has(p.id)) drawGround(ctx, p, col, hInv, r, 2);
        if ($("ov-ids").checked) {
          const label = p.team === "UNK" ? "non reconnu" : p.team === "REF" ? "arbitre" : (p.team === "A" ? "" : p.team === "B" ? "Adv. " : p.team === "GKA" ? "GB " : "GB adv. ") + (p.id != null ? "#" + p.id : (p.team === "A" ? "Mon équipe" : ""));
          ctx.font = "600 12px 'Segoe UI',Arial,sans-serif";
          const tw = ctx.measureText(label).width + 8;
          ctx.fillStyle = col; ctx.fillRect(a1[0], a1[1] - 16, tw, 16);
          ctx.fillStyle = "#fff"; ctx.fillText(label, a1[0] + 4, a1[1] - 4);
        }
      });
    }
    // personne d'une question du programme : cadre orange sur l'image exacte de la question
    if (qHighlight && Math.abs((video.currentTime || 0) - qHighlight.t) < 0.4 && Array.isArray(qHighlight.polys)) {
      ctx.strokeStyle = "#f97316"; ctx.lineWidth = 3; ctx.setLineDash([8, 5]);
      qHighlight.polys.forEach((pl) => { ctx.beginPath(); pl.forEach((p, k) => { const v = toView(p[0] * r.vw, p[1] * r.vh); if (k) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); }); ctx.closePath(); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    const qf = qHighlight && qHighlight.id != null && frames.length ? P.frameNear(frames, qHighlight.t, 0.3) : null;
    const qDone = qf && Math.abs((video.currentTime || 0) - qHighlight.t) < 0.4 && drawContours(ctx, qf, qHighlight.id, qHighlight.label);
    if (qHighlight && !qDone && Math.abs((video.currentTime || 0) - qHighlight.t) < 0.4 && Array.isArray(qHighlight.b)) {
      const b = qHighlight.b, a1 = toView((b[0] / 1000) * r.vw, (b[1] / 1000) * r.vh);
      const qp = qf ? qf.players.find((p) => p.id === qHighlight.id) : null;      // pas de silhouette fiable : cercle orange au sol, jamais un cadre
      drawGround(ctx, qp || { b }, "#f97316", qf ? groundInverse(qf) : null, r, 4);
      ctx.font = "700 13px 'Segoe UI',Arial,sans-serif";
      const label = qHighlight.label || "Question", tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "#f97316"; ctx.fillRect(a1[0], a1[1] - 20, tw, 20);
      ctx.fillStyle = "#fff"; ctx.fillText(label, a1[0] + 5, a1[1] - 5);
    }
    drawBallMarker(ctx);
    // repères de calibrage
    pts.forEach((p) => {
      const v = toView(p.ix, p.iy);
      const col = p.sus ? "#ff4d4d" : p.id === selPt ? "#ffe14d" : "#00e6ff";
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v[0], v[1], 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(v[0] - 10, v[1]); ctx.lineTo(v[0] + 10, v[1]); ctx.moveTo(v[0], v[1] - 10); ctx.lineTo(v[0], v[1] + 10); ctx.stroke();
      ctx.font = "600 12px 'Segoe UI',Arial,sans-serif"; ctx.fillText(p.label.slice(0, 28), v[0] + 10, v[1] - 8);
    });
    if (pip) {
      (pip.points || []).forEach((q) => {
        const v = toView(q.ix, q.iy);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(v[0], v[1], 8, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(v[0], v[1], 9.5, 0, Math.PI * 2); ctx.stroke();
      });
    }
    layers.forEach((fn) => fn(ctx, { toView, rect: r }));
    // zones des bancs marquées (en coordonnées terrain, redessinées avec le calibrage de l'instant)
    const zones = (a && a.benchZones) || [];
    const projZ = a && (zones.length || benchMark) ? projectionAt(t) : null;
    if (projZ) {
      const Hi = HG.invert(projZ);
      ctx.strokeStyle = "rgba(255,170,0,.95)"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      zones.forEach((z) => {
        ctx.beginPath();
        [[z.x1, z.y1], [z.x2, z.y1], [z.x2, z.y2], [z.x1, z.y2]].forEach((p, i) => { const q = HG.apply(Hi, p[0], p[1]); const v = toView(q[0], q[1]); if (i) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); });
        ctx.closePath(); ctx.stroke();
      });
      ctx.setLineDash([]);
      if (benchMark && benchMark.first) { const q = HG.apply(Hi, benchMark.first[0], benchMark.first[1]); const v = toView(q[0], q[1]); ctx.fillStyle = "rgba(255,170,0,.95)"; ctx.beginPath(); ctx.arc(v[0], v[1], 6, 0, Math.PI * 2); ctx.fill(); }
    }
    if (benchMark) {
      ctx.fillStyle = "rgba(11,18,32,.85)"; ctx.fillRect(8, 8, Math.min(560, boxSize().w - 16), 26);
      ctx.fillStyle = "#fff"; ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
      ctx.fillText(benchMark.first ? "Banc : cliquez le coin opposé (Échap : annuler)" : "Banc : cliquez un coin de la zone du banc (Échap : annuler)", 16, 26);
    }
    if (placing || pickRole || pip) {
      ctx.fillStyle = "rgba(11,18,32,.85)"; ctx.fillRect(8, 8, Math.min(560, boxSize().w - 16), 26);
      ctx.fillStyle = "#fff"; ctx.font = "600 13px 'Segoe UI',Arial,sans-serif";
      const label = placing ? "Cliquez sur : " + (HG.landmarks(L(), W()).find((l) => l.id === placing) || {}).label
        : pip ? "Pipette (" + (ROLES.find((q) => q[0] === pip.role) || [])[1] + ") : cliquez sur " + PARTS[pip.part] + " d'un joueur (Échap : annuler)"
        : "Cliquez sur la silhouette de : " + (ROLES.find((q) => q[0] === pickRole) || [])[1];
      ctx.fillText(label, 16, 26);
    }
  }

  function updateOverlayMode() {
    const c = $("overlay");
    c.hidden = !video.videoWidth || video.hidden;
    c.classList.toggle("pick", !!(placing || pickRole || pip || pointer || benchMark));
    drawOverlay();
  }

  /* ---------- mini-carte (vue de dessus) ---------- */
  function orient(f) {
    const flip = dirAt(f.t) < 0, l = L(), w = W();
    return { t: f.t, ball: f.ball ? (flip ? { x: l - f.ball.x, y: w - f.ball.y } : f.ball) : null,
      players: f.players.map((p) => Object.assign({}, p, flip ? { x: l - p.x, y: w - p.y } : {})) };
  }

  function drawMinimap() {
    const box = $("minimap-box");
    const a = state.project.ai;
    const has = frames.length || live;
    box.hidden = !has;
    if (!has) return;
    const t = video.currentTime || 0;
    const f = live || P.frameNear(frames, t, 1.2);
    $("mm-time").textContent = App.fmt(live ? live.t : t);
    const trails = {};
    if (!live && f && $("ov-trails").checked) {
      frames.forEach((g) => {
        if (g.t > f.t || g.t < f.t - 3) return;
        const o = orient(g);
        o.players.forEach((p) => { const arr = trails[p.id] || (trails[p.id] = Object.assign([], { team: p.team === "B" || p.team === "GKB" ? "B" : "A" })); arr.push([p.x, p.y]); });
      });
    }
    const canvas = $("minimap"), ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const heat = $("ov-heat").checked && a && a.stats ? a.stats.heat : null;
    E.drawOps(ctx, E.liveOps(f ? orient(f) : null, { showIds: $("ov-ids").checked, trails, heat }), canvas.width / E.COURT_VIEW.w, E.COURT_VIEW);
  }

  function refreshLive() {
    drawOverlay(); drawMinimap();
  }
  function loop() { refreshLive(); raf = !video.paused && !video.ended ? requestAnimationFrame(loop) : 0; }

  /* ---------- encadré « Prochaine étape » : dit à l'utilisateur quoi faire ---------- */
  function renderNext() {
    const box = $("ai-next"), a = state.project && state.project.ai;
    if (!box || !a) return;
    let title, steps = [], done = false;
    if (!App.isVideoReady()) {
      title = "Étape 0 — Charger la vidéo";
      steps = ["À gauche, cliquez sur « Choisir une vidéo… » et sélectionnez votre fichier de match."];
    } else if (!a.calibrations.length) {
      title = "Étape 1 — Montrer le terrain au programme";
      steps = [
        "Mettez la vidéo en pause (Espace) sur une image où l'on voit bien les lignes noires du terrain.",
        "Ci-dessous, dans « 1. Terrain », choisissez un repère dans la liste (ex. « Point de penalty gauche »).",
        "Cliquez « Placer sur l'image », puis cliquez à cet endroit sur la vidéo. Recommencez pour 4 repères ou plus, bien répartis.",
        "Cliquez « Valider le calibrage »."
      ];
    } else if (!(refs().A && refs().B)) {
      title = "Étape 2 — Apprendre les couleurs des équipes";
      steps = [
        "Mettez la vidéo en pause sur une image où vos joueurs et leurs adversaires sont bien visibles.",
        "Dans « 2. Tenues », ligne « Mon équipe », cliquez « Pipette », puis cliquez le maillot d'un de vos joueurs, puis son short, ses chaussettes et ses manches (« Passer » si inutile), puis « Terminer ».",
        "Faites la même chose sur la ligne « Adversaire ».",
        "Cliquez « Tester la reconnaissance sur cette image » pour vérifier."
      ];
    } else if (!(a.frames || frames.length)) {
      title = "Étape 3 — Lancer l'analyse";
      steps = [
        "Dans « 3. Analyse », réglez « De » et « À » (commencez par 1 à 2 minutes pour tester).",
        "Cliquez « Lancer l'analyse » et patientez (la durée estimée est affichée)."
      ];
    } else {
      done = true;
      title = "Analyse terminée ✔";
      steps = [
        "Dans « 4. Résultats », cochez Joueurs ou Trajectoires pour voir les joueurs sur la vidéo.",
        "Acceptez ou écartez les « Erreurs suggérées ».",
        "Ouvrez ensuite l'onglet « Rapport & solutions », puis « Corrections animées » pour obtenir les vidéos à partager."
      ];
    }
    box.className = "ai-next" + (done ? " done" : "");
    box.innerHTML = "<b class=\"t\">" + esc(title) + "</b>" + (steps.length === 1 ? esc(steps[0]) : "<ol>" + steps.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>");
  }

  /* ---------- volet de droite ---------- */
  function setChip(id, text, cls) { const e = $(id); e.textContent = text; e.className = "chip " + (cls || ""); }

  /* Repères en cours de pose : écart de chaque repère à la projection calculée avec les autres (dès 5 repères), repère suspect signalé,
     « Replacer » pour le reposer, flèches du clavier pour le décaler finement. */
  function renderPoints() {
    const l = $("ai-points");
    l.innerHTML = "";
    const lm = Object.fromEntries(HG.landmarks(L(), W()).map((q) => [q.id, q]));
    const errs = ACC ? ACC.pointErrors(pts, lm) : [];
    pts.forEach((p) => {
      const e = errs.find((x) => x.id === p.id) || {};
      p.sus = !!e.suspect;      // « à replacer » seulement pour le repère dont le retrait rend tous les autres cohérents ; un grand écart seul est affiché sans accusation
      const d = document.createElement("div"); d.className = "ai-item" + (p.sus ? " sus" : "") + (selPt === p.id ? " sel" : "");
      d.innerHTML = "<span class=\"grow\" style=\"cursor:pointer\" title=\"Cliquer pour choisir ce repère, puis les flèches du clavier le décalent d'un demi-pixel (Maj : 2 pixels)\">" + esc(p.label) + "</span>" +
        (e.err != null ? "<span class=\"pt-err\" title=\"Écart entre ce repère et la position calculée avec tous les autres repères\">" + (e.err < 0.1 ? Math.round(e.err * 100) + " cm" : e.err.toFixed(2) + " m") + (p.sus ? " ⚠ à replacer" : "") + "</span>" : "") +
        "<button data-a=\"re\" title=\"Replacer ce repère\">Replacer</button><button data-a=\"x\" title=\"Retirer\">×</button>";
      d.querySelector(".grow").addEventListener("click", () => { selPt = p.id; renderPoints(); drawOverlay(); });
      d.querySelector("[data-a=re]").addEventListener("click", () => { $("ai-landmark").value = p.id; startPlacing(); });
      d.querySelector("[data-a=x]").addEventListener("click", () => { pts = pts.filter((q) => q.id !== p.id); renderPoints(); refreshLive(); drawOverlay(); });
      l.appendChild(d);
    });
    if (pts.length === 4) { const m = document.createElement("p"); m.className = "hint"; m.textContent = "Avec 4 repères, l'erreur de chaque repère ne peut pas être mesurée : ajoutez un 5e repère pour la voir."; l.appendChild(m); }
  }

  /* ---------- accrochage et loupe (calibrage) ---------- */
  const SNAP_H = ACC ? ACC.RAYON + ACC.MARGE : 24;      // demi-côté (pixels vidéo) de la zone lue pour chercher un croisement
  function cropGray(cx, cy, h) {
    if (!video.videoWidth) return null;
    const x0 = Math.round(cx) - h, y0 = Math.round(cy) - h, n = 2 * h + 1;
    if (x0 < 0 || y0 < 0 || x0 + n > video.videoWidth || y0 + n > video.videoHeight) return null;
    const c = document.createElement("canvas"); c.width = n; c.height = n;
    const g = c.getContext("2d", { willReadFrequently: true });
    try {
      g.drawImage(video, x0, y0, n, n, 0, 0, n, n);
      const px = g.getImageData(0, 0, n, n).data, d = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) d[i] = 0.299 * px[4 * i] + 0.587 * px[4 * i + 1] + 0.114 * px[4 * i + 2];
      return { data: d, width: n, height: n, x0, y0 };
    } catch (_e) { return null; }
  }
  /* Croisement de lignes le plus proche du clic (null si l'accrochage est coupé ou si rien de net n'est trouvé : le clic reste tel quel). */
  function snapAt(ix, iy) {
    if (!ACC || !$("ai-snap") || !$("ai-snap").checked) return null;
    const g = cropGray(ix, iy, SNAP_H); if (!g) return null;
    const r = ACC.snap(g, ix - g.x0, iy - g.y0);
    return r.ok ? { x: r.x + g.x0, y: r.y + g.y0, dx: r.dx, dy: r.dy } : null;
  }
  function drawLoupe(ox, oy) {
    const lp = $("loupe"); if (!lp) return;
    if (!(placing || linePick) || ox == null) { lp.hidden = true; return; }
    const [ix, iy] = toVideo(ox, oy), half = 14;
    if (ix < 0 || iy < 0 || ix > video.videoWidth || iy > video.videoHeight) { lp.hidden = true; return; }
    const k = lp.width / (2 * half + 1), g = lp.getContext("2d"), s = snapAt(ix, iy);
    g.imageSmoothingEnabled = false; g.fillStyle = "#000"; g.fillRect(0, 0, lp.width, lp.height);
    try { g.drawImage(video, Math.round(ix) - half, Math.round(iy) - half, 2 * half + 1, 2 * half + 1, 0, 0, lp.width, lp.height); } catch (_e) { /* image pas prête */ }
    g.strokeStyle = "#00e6ff"; g.lineWidth = 1; g.beginPath(); g.moveTo(lp.width / 2, 0); g.lineTo(lp.width / 2, lp.height); g.moveTo(0, lp.height / 2); g.lineTo(lp.width, lp.height / 2); g.stroke();
    if (s) { const sx = (s.x - Math.round(ix) + half + 0.5) * k, sy = (s.y - Math.round(iy) + half + 0.5) * k; g.strokeStyle = "#3ddc84"; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.stroke(); }
    const bw = boxSize();
    lp.style.left = Math.max(4, Math.min(bw.w - lp.width - 4, ox + 26 + lp.width > bw.w ? ox - 26 - lp.width : ox + 26)) + "px";
    lp.style.top = Math.max(4, Math.min(bw.h - lp.height - 4, oy - lp.height / 2)) + "px";
    lp.hidden = false;
  }

  /* ---------- suivi de la caméra seul (arrière-plan, sans joueurs ni ballon) ----------
     Lancé automatiquement après un calibrage, refait quand un calibrage est ajouté ou supprimé. Le terrain est tracé partout où ce suivi est fiable,
     sans attendre l'analyse complète ; l'analyse complète le réutilise. */
  let suiviFr = [];                    // images du suivi gardé dans le projet : [{ t, h }]
  let suiviRun = null;                 // suivi en cours : { ctrl, pct }
  let suiviTimer = null;
  const fmtDur = (s) => s >= 90 ? Math.round(s / 60) + " min" : Math.round(s) + " s";
  function suiviMsg(txt, pct) {
    const box = $("ai-suivi-box"); if (!box) return;
    box.hidden = !txt; $("ai-suivi").textContent = txt || "";
    const b = $("ai-suivi-bar"); b.hidden = pct == null; if (pct != null) b.value = pct;
  }
  function chargeSuivi() {
    const s = ai() && ai().camSuivi;
    suiviFr = s && Array.isArray(s.frames) ? s.frames.filter((c) => Array.isArray(c) && Array.isArray(c[1]) && c[1].length === 9).map((c) => ({ t: c[0], h: c[1], q: c[2] })) : [];
  }
  /* Phrase de bilan du suivi (part de la vidéo où la caméra est suivie, passages perdus). */
  function suiviBilan(s) {
    const lost = s.lost || [], span = Math.max(0.1, s.t1 - s.t0), ls = lost.reduce((x, r) => x + (r[1] - r[0]), 0), pct = Math.round(1000 * (1 - ls / span)) / 10;
    let m = "Suivi de la caméra terminé : caméra suivie sur " + String(pct).replace(".", ",") + " % de la vidéo (" + App.fmt(s.t0) + " à " + App.fmt(s.t1) + "), en " + fmtDur(s.seconds || 0) + ".";
    if (s.lignes) {
      const fr = (s.frames || []), n = fr.length, ok = fr.filter((c) => c[2] === 2 || c[2] === 1).length, couleur = s.lignes.couleur === "custom" ? "de la couleur que vous avez montrée" : LIGNES_NOM[s.lignes.couleur] || "";
      m += " Tracé vérifié sur les lignes" + (couleur ? " " + couleur : "") + " : " + String(n ? Math.round((1000 * ok) / n) / 10 : 0).replace(".", ",") + " % des positions (" + s.lignes.acceptes + " images où les lignes sont retrouvées) ; ailleurs « recalage incertain » : le tracé vient du suivi seul." +
        (typeof s.lignes.confusion === "number" ? " Confusion mesurée : " + String(Math.round(s.lignes.confusion * 100)) + " % des pixels de cette couleur vus sur le terrain ne sont sur aucune ligne attendue (joueurs, autres marquages) : ils ne servent pas au recalage." : "");
    } else if (!s.sansLignes) m += " Tracé non vérifié sur les lignes (couleur des lignes non indiquée).";
    if (lost.length) m += " Perdue : " + lost.slice(0, 4).map((r) => App.fmt(r[0]) + "–" + App.fmt(r[1])).join(", ") + (lost.length > 4 ? "…" : "") + " (ajoutez un calibrage là).";
    return m;
  }
  /* Le suivi gardé n'est réutilisable que pour les calibrages actuels et la caméra mobile. */
  /* Couleur des lignes telle qu'elle entre dans la clé du suivi : préréglage, ou nuance apprise (empreinte du profil) ; + dimensions si elles ne sont pas 40 x 20. */
  function couleurCle(a) {
    if (!a || !a.lineColor) return null;
    let c = a.lineColor;
    if (c === "custom") { const p = a.lineProfile || {}; c = "custom" + [p.L, p.a, p.b, p.tol, p.tolL].join(","); }
    const l = Number(a.L) || 40, w = Number(a.W) || 20;
    return l === 40 && w === 20 ? c : c + "@" + l + "x" + w;
  }
  const suiviValide = (a) => !!(a && (a.camera || $("ai-camera").value) === "mobile" && a.camSuivi && suiviFr.length > 1 && a.camSuivi.cle === P.cleSuivi(a.calibrations, video.duration, couleurCle(a)));
  function planSuivi(delay) {
    clearTimeout(suiviTimer);
    suiviTimer = setTimeout(lanceSuivi, delay == null ? 1500 : delay);
  }
  async function lanceSuivi() {
    const a = ai();
    if (!a || !P.suiviCamera) return;
    if (suiviRun) { suiviRun.ctrl.abort(); suiviRun = null; }
    const cam = a.camera || $("ai-camera").value;
    if (cam !== "mobile" || !a.calibrations.length || !App.isVideoReady() || !(video.duration > 0)) { if (cam !== "mobile" || !a.calibrations.length) { suiviFr = []; suiviMsg(""); } return; }
    if (running) { planSuivi(5000); return; }              // l'analyse complète fait déjà son propre suivi
    const cle = P.cleSuivi(a.calibrations, video.duration, couleurCle(a));
    if (a.camSuivi && a.camSuivi.cle === cle) { chargeSuivi(); suiviMsg(suiviBilan(a.camSuivi)); renderSuiviQ(); refreshLive(); return; }
    suiviFr = []; a.camSuivi = null; refreshLive();
    const ctrl = new AbortController(), run = { ctrl, pct: 0 }; suiviRun = run;
    suiviMsg("Suivi de la caméra en cours (en arrière-plan, vous pouvez continuer)…", 0);
    try {
      const r = await P.suiviCamera({
        url: App.getVideoUrl(), calibrations: a.calibrations.map((c) => ({ t: c.t, H: c.H })), signal: ctrl.signal,
        lineColor: a.lineColor || null, lineProfile: a.lineColor === "custom" ? a.lineProfile : null, L: L(), W: W(), prio: prioLignes(a),
        onProgress: (p) => {
          run.pct = Math.round((100 * p.done) / p.total); run.t = p.t;
          suiviMsg("Suivi de la caméra : " + run.pct + " % — le terrain se trace déjà jusqu'à " + App.fmt(p.t) + " — reste environ " + fmtEta(p.eta), run.pct);
          suiviFr = p.frames.map((q) => ({ t: q.t, h: q.h }));          // le terrain se trace au fur et à mesure, sans attendre la fin
          refreshLive();
        }
      });
      if (suiviRun !== run) return;
      suiviRun = null;
      a.camSuivi = { cle, t0: r.t0, t1: r.t1, seconds: r.seconds, lost: r.lost.map((x) => [Math.round(x[0] * 100) / 100, Math.round(x[1] * 100) / 100]), frames: r.frames.map((q) => (q.q == null ? [q.t, q.h] : [q.t, q.h, q.q])) };
      if (r.lignes) a.camSuivi.lignes = { couleur: r.lignes.couleur, essais: r.lignes.essais, acceptes: r.lignes.acceptes, confusion: r.lignes.confusion };
      if (r.dims) a.camSuivi.dims = r.dims;
      else if (!a.lineColor) a.camSuivi.sansLignes = false; else a.camSuivi.sansLignes = true;
      chargeSuivi(); suiviMsg(suiviBilan(a.camSuivi)); renderSuiviQ(); App.changed(); refreshLive();
    } catch (e) {
      if (suiviRun === run) { suiviRun = null; suiviMsg(ctrl.signal.aborted ? "" : "Suivi de la caméra interrompu : il sera repris au prochain chargement de la vidéo."); }
    }
  }

  const LIGNES_NOM = { black: "noires", white: "blanches", yellow: "jaunes", red: "rouges" };
  /* Éléments choisis au calibrage (groupes du modèle prioritaires pour le recalage) ; par défaut le cercle central. */
  function prioLignes(a) {
    const c = a && a.calibrations && a.calibrations[0], g = window.FutsalLignes && c && c.choisis ? window.FutsalLignes.groupesDepuisRepères(c.choisis) : [];
    return g.indexOf("cercle") >= 0 ? g : g.concat(["cercle"]);
  }
  const confirme = (a, t) => !!(a && a.camSuivi && (a.camSuivi.confirmes || []).some((c) => t >= c[0] - 1e-6 && t <= c[1] + 1e-6));
  /* Qualité du tracé à l'instant t d'après le suivi : 2 / 1 = vérifié sur les lignes, 0 = « recalage incertain », null = pas de suivi recalé. */
  function qualiteAt(a, t) {
    if (!a || !a.camSuivi || !a.camSuivi.lignes || !suiviFr.length) return null;
    let lo = 0, hi = suiviFr.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (suiviFr[m].t < t) lo = m + 1; else hi = m; }
    const f = suiviFr[lo], g = lo > 0 ? suiviFr[lo - 1] : null, b = g && Math.abs(g.t - t) < Math.abs(f.t - t) ? g : f;
    if (!b || Math.abs(b.t - t) > 1 || b.q == null) return null;
    return b.q === 0 && confirme(a, t) ? 1 : b.q;
  }
  /* Questions du suivi, jamais bloquantes : couleur des lignes (si elle n'a pas été donnée), et UN passage où les lignes ne sont pas retrouvées. */
  /* Ligne « Couleur des lignes » toujours visible (préréglage ou ligne montrée) + dimensions du terrain de ce projet. */
  function renderSuiviCouleur() {
    const box = $("ai-suivi-couleur"); if (!box) return;
    box.innerHTML = ""; box.hidden = true;
    const a = ai(); if (!a || !a.calibrations.length || !a.lineColor || !window.FutsalCourtFit) return;
    box.hidden = false;
    const mk = (tag, txt) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; return e; };
    box.appendChild(mk("span", "Couleur des lignes : "));
    const sel = mk("select");
    Object.keys(window.FutsalCourtFit.COLORS).forEach((k) => { const o = new Option(window.FutsalCourtFit.COLORS[k].name, k); sel.appendChild(o); });
    if (a.lineColor === "custom") { const o = new Option("Montrée par vous", "custom"); sel.appendChild(o); }
    sel.value = a.lineColor;
    sel.addEventListener("change", () => choisirCouleur(sel.value));
    box.appendChild(sel);
    const b = mk("button", "Montrer une ligne en cliquant dessus"); b.addEventListener("click", startLinePick); box.appendChild(b);
    box.appendChild(mk("span", " — terrain de ce projet : " + (Number(a.L) || 40) + " × " + (Number(a.W) || 20) + " m (modifiable à l'étape 1)."));
  }
  /* Choix d'un préréglage : gardé dans le projet ; si une autre couleur lui ressemble sur l'image affichée, une question (jamais bloquante). */
  function choisirCouleur(key) {
    const a = ai(); if (!a) return;
    a.lineColor = key; if (key !== "custom") a.lineProfile = null; a.ambiguite = null;
    mesureAmbiguite(a);
    App.changed(); renderSuiviQ(); renderSuiviCouleur(); planSuivi(300);
  }
  /* Deux nuances proches : part (intersection / union) des pixels de la couleur choisie qui sont aussi d'une autre couleur prédéfinie, sur l'image affichée. */
  function mesureAmbiguite(a) {
    try {
      if (!video.videoWidth || !window.FutsalLignes || a.lineColor === "custom") return;
      const w = 480, h = Math.round((video.videoHeight * w) / video.videoWidth), cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(video, 0, 0, w, h);
      const img = g.getImageData(0, 0, w, h), CFx = window.FutsalCourtFit, work = CFx.prepare(img, w), mine = CFx.ridgeMap(work, a.lineColor).mask;
      let best = null;
      Object.keys(CFx.COLORS).forEach((k) => {
        if (k === a.lineColor) return;
        const o = CFx.ridgeMap(work, k).mask; let inter = 0, uni = 0, no = 0;
        for (let i = 0; i < o.length; i++) { const x = mine[i], y = o[i]; if (x && y) inter++; if (x || y) uni++; no += y; }
        const part = uni ? inter / uni : 0;
        if (no >= 0.004 * o.length && part >= 0.25 && (!best || part > best.part)) best = { cle: a.lineColor, autre: k, part: Math.round(part * 100) / 100 };
      });
      a.ambiguite = best;
    } catch (_e) { a.ambiguite = null; }
  }
  /* « Montrer la ligne » : un clic sur la ligne (loupe), je lis sa nuance et la tolérance sur CE projet ; jamais de couleur devinée. */
  function startLinePick() {
    if (!App.isVideoReady()) return;
    video.pause(); placing = null; pickRole = null; pip = null; benchMark = null; linePick = true;
    pointer = {
      click: (ix, iy, ok) => { if (ok) finLinePick(ix, iy); },
      move: (_ix, _iy, _ok, e) => { if (e) drawLoupe(e.offsetX, e.offsetY); }
    };
    updateOverlayMode();
    const b = $("ai-suivi-couleur"); if (b) { b.hidden = false; b.textContent = "Cliquez sur un morceau de la ligne (la loupe vous aide, Échap : annuler)."; }
  }
  function stopLinePick() { linePick = false; pointer = null; $("loupe").hidden = true; updateOverlayMode(); renderSuiviCouleur(); }
  function finLinePick(ix, iy) {
    const a = ai(), LGx = window.FutsalLignes; if (!a || !LGx) return stopLinePick();
    const n = 41, x0 = Math.round(ix) - 20, y0 = Math.round(iy) - 20, b = $("ai-suivi-couleur");
    if (x0 < 0 || y0 < 0 || x0 + n > video.videoWidth || y0 + n > video.videoHeight) { if (b) b.textContent = "Cliquez un peu plus loin du bord de l'image."; return; }
    const cv = document.createElement("canvas"); cv.width = n; cv.height = n;
    const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(video, x0, y0, n, n, 0, 0, n, n);
    const r = LGx.profilDepuisClic(g.getImageData(0, 0, n, n), 20, 20);
    if (!r.ok) { if (b) b.textContent = "Je ne vois pas de ligne nette à cet endroit : cliquez au milieu de la ligne (Échap : annuler)."; return; }
    a.lineColor = "custom"; a.lineProfile = r.profil; a.ambiguite = null; a.ambiguiteOk = null;
    linePick = false; pointer = null; $("loupe").hidden = true;
    updateOverlayMode(); App.changed(); renderSuiviQ(); renderSuiviCouleur(); planSuivi(300);
    App.toast("Couleur apprise sur ce projet (écart toléré " + r.profil.tol + ").");
  }
  function renderSuiviQ() {
    renderSuiviCouleur();
    const box = $("ai-suivi-q"); if (!box || !window.FutsalCourtFit) return;
    box.innerHTML = ""; box.hidden = true;
    const a = ai(); if (!a || !a.calibrations.length || (a.camera || $("ai-camera").value) !== "mobile") return;
    const mk = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
    if (!a.lineColor) {
      box.hidden = false;
      box.appendChild(mk("p", "Quelle est la couleur des lignes de votre terrain de futsal ? Je m'en sers pour vérifier le tracé sur les vraies lignes (sans elle, le tracé vient du suivi seul et peut dériver)."));
      Object.keys(window.FutsalCourtFit.COLORS).forEach((key) => {
        const b = mk("button", window.FutsalCourtFit.COLORS[key].name); b.dataset.couleur = key;
        b.addEventListener("click", () => { choisirCouleur(key); });
        box.appendChild(b);
      });
      const cl = mk("button", "Montrer la ligne en cliquant dessus"); cl.dataset.couleur = "clic"; cl.title = "Pour une couleur qui n'est pas dans la liste, ou si plusieurs couleurs de lignes se ressemblent : je lis la nuance exacte sur la ligne que vous montrez.";
      cl.addEventListener("click", startLinePick); box.appendChild(cl);
      return;
    }
    if (a.ambiguite && a.ambiguiteOk !== couleurCle(a)) {
      box.hidden = false;
      box.appendChild(mk("p", "Sur cette image, les lignes " + (LIGNES_NOM[a.ambiguite.cle] || "choisies") + " et les lignes " + (LIGNES_NOM[a.ambiguite.autre] || "d'une autre couleur") + " se ressemblent (" + Math.round(a.ambiguite.part * 100) + " % de pixels en commun). Les lignes du futsal sont-elles bien " + (LIGNES_NOM[a.ambiguite.cle] || "de cette couleur") + " ?"));
      const oui = mk("button", "Oui, c'est bien cette couleur"); oui.addEventListener("click", () => { a.ambiguiteOk = couleurCle(a); App.changed(); renderSuiviQ(); }); box.appendChild(oui);
      const non = mk("button", "Non : je montre la bonne ligne en cliquant dessus"); non.addEventListener("click", startLinePick); box.appendChild(non);
      return;
    }
    const dm = a.camSuivi && a.camSuivi.dims;
    if (dm && dm.propose && !suiviRun && !(a.dimsAvis && a.dimsAvis.refus === (Number(a.L) || 40) + "x" + (Number(a.W) || 20))) {
      box.hidden = false;
      box.appendChild(mk("p", "Les lignes que je retrouve collent mieux avec un terrain de " + dm.L + " × " + dm.W + " m qu'avec " + (Number(a.L) || 40) + " × " + (Number(a.W) || 20) + " m (+" + Math.round(dm.gain * 100) + " % de lignes retrouvées, " + dm.images + " images). Quelles sont les dimensions de ce terrain ?"));
      const ok = mk("button", "Oui, " + dm.L + " × " + dm.W + " m"); ok.addEventListener("click", () => { $("ai-L").value = String(dm.L); $("ai-W").value = String(dm.W); $("ai-L").dispatchEvent(new Event("change")); a.dimsAvis = { choix: dm.L + "x" + dm.W }; App.changed(); renderSuiviQ(); planSuivi(300); }); box.appendChild(ok);
      const non = mk("button", "Non, garder " + (Number(a.L) || 40) + " × " + (Number(a.W) || 20) + " m"); non.addEventListener("click", () => { a.dimsAvis = { refus: (Number(a.L) || 40) + "x" + (Number(a.W) || 20) }; App.changed(); renderSuiviQ(); }); box.appendChild(non);
      const sa = mk("button", "Je les saisis moi-même"); sa.addEventListener("click", () => { const d1 = $("ai-d1"); if (d1) d1.open = true; $("ai-L").focus(); }); box.appendChild(sa);
      return;
    }
    if (!a.camSuivi || !a.camSuivi.lignes || suiviRun) return;
    const p = P.passagesDouteux(suiviFr, a.camSuivi.confirmes, 60)[0];
    if (!p) return;
    box.hidden = false;
    const nm = LIGNES_NOM[a.lineColor] || "";
    box.appendChild(mk("p", "Je ne retrouve pas les lignes " + nm + " de " + App.fmt(p.de) + " à " + App.fmt(p.a) + " : le tracé y vient seulement du suivi de la caméra. Est-il juste ?"));
    const go = mk("button", "Voir ce passage"); go.addEventListener("click", () => { $("ov-court").checked = true; App.seek((p.de + p.a) / 2); }); box.appendChild(go);
    const ok = mk("button", "Oui, le tracé est juste"); ok.addEventListener("click", () => { a.camSuivi.confirmes = (a.camSuivi.confirmes || []).concat([[p.de, p.a]]); App.changed(); renderSuiviQ(); drawOverlay(); }); box.appendChild(ok);
    const no = mk("button", "Non, il est décalé : j'ajoute un calibrage"); no.addEventListener("click", () => { $("ov-court").checked = true; App.seek((p.de + p.a) / 2); const d1 = $("ai-d1"); if (d1) d1.open = true; App.toast("Placez les repères sur cette image : le suivi repartira de là."); }); box.appendChild(no);
  }

  function renderCalibs() {
    const a = ai(), l = $("ai-calibs");
    l.innerHTML = "";
    a.calibrations.forEach((c, i) => {
      const d = document.createElement("div"); d.className = "ai-item";
      d.innerHTML = "<span class=\"grow\">Calibrage à " + App.fmt(c.t) + " — erreur " + c.err.toFixed(2) + " m (" + c.points.length + " repères)</span><button data-a=\"go\" title=\"Aller à ce moment\">⏵</button><button data-a=\"del\" title=\"Supprimer\">×</button>";
      d.querySelector("[data-a=go]").addEventListener("click", () => App.seek(c.t));
      d.querySelector("[data-a=del]").addEventListener("click", () => { a.calibrations.splice(i, 1); renderCalibs(); App.changed(); refreshLive(); planSuivi(); });
      l.appendChild(d);
    });
    setChip("ai-s1-state", a.calibrations.length ? a.calibrations.length + " calibrage(s)" : "À faire", a.calibrations.length ? "ok" : "warn");
    renderNext();
  }

  function fillLandmarks() {
    const sel = $("ai-landmark"), cur = sel.value;
    sel.innerHTML = "";
    HG.landmarks(L(), W()).forEach((l) => { const o = document.createElement("option"); o.value = l.id; o.textContent = l.label; sel.appendChild(o); });
    if (cur) sel.value = cur;
  }

  /* Tenues de référence trop proches : avertissements en clair (noms affichés dans l'interface). */
  function kitWarnings(r) {
    const m = K.ambiguityMessages(r || refs(), Object.fromEntries(ROLES.map(([key, label]) => [key, label])));
    return EX ? m.concat(EX.contradictions(ai().kits).map((c) => c.texte)) : m;
  }

  function renderKits() {
    const a = ai(), box = $("ai-kits"), r = refs();
    box.innerHTML = "";
    ROLES.forEach(([key, label, color]) => {
      const sw = r[key] ? K.swatches(r[key]) : null, n = (a.kits[key] || []).length;
      const row = document.createElement("div"); row.className = "kit-row";
      row.innerHTML = "<span><span class=\"sw\" style=\"background:" + color + ";width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px\"></span>" + esc(label) + (n ? " <span class=\"muted\">(" + n + " échantillon" + (n > 1 ? "s" : "") + ")</span>" : "") + "</span>" +
        "<span class=\"kit-sw\">" + (sw ? "<i class=\"sw\" style=\"background:" + sw.shirt + "\" title=\"Maillot\"></i><i class=\"sw\" style=\"background:" + sw.shorts + "\" title=\"Short\"></i><i class=\"sw\" style=\"background:" + sw.socks + "\" title=\"Chaussettes\"></i>" + (sw.trim ? "<i class=\"sw\" style=\"background:" + sw.trim + "\" title=\"Manches / liseré\"></i>" : "") : "") + "</span>" +
        "<span class=\"btns\"><button data-a=\"pip\" title=\"Cliquer vous-même le maillot, le short, les chaussettes\">Pipette</button><button data-a=\"pick\" title=\"Cliquer un joueur : couleurs lues automatiquement\">Auto</button>" + (n ? "<button data-a=\"clear\" class=\"ghost\" title=\"Effacer\">×</button>" : "") + "</span>";
      row.querySelector("[data-a=pick]").addEventListener("click", () => startPick(key));
      row.querySelector("[data-a=pip]").addEventListener("click", () => startPipette(key));
      const c = row.querySelector("[data-a=clear]");
      if (c) c.addEventListener("click", () => { delete a.kits[key]; renderKits(); App.changed(); });
      box.appendChild(row);
    });
    kitWarnings(r).forEach((m) => { const p = document.createElement("p"); p.className = "hint kit-warn"; p.textContent = "⚠ " + m; box.appendChild(p); });
    if (EX) box.appendChild(examplesPanel({ bench: false, nav: true, onMore: moreHere }));
    const ok = !!(r.A && r.B);
    setChip("ai-s2-state", ok ? "Équipes reconnues" : "Choisir au moins 2 équipes", ok ? "ok" : "warn");
    renderNext();
  }

  /* ---------- exemples d'identification : liste datée, navigation, indicateurs, demandes, banc ---------- */
  function exEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function exBtn(text, title, fn, cls) { const b = exEl("button", cls || "", text); b.type = "button"; if (title) b.title = title; b.addEventListener("click", (ev) => { if (/^(Reculer|Avancer)|avancer dans la vidéo/i.test(title || "") && !App.isVideoReady()) { App.toast("Choisissez d'abord une vidéo."); return; } fn(ev); }); return b; }
  const SRC_TXT = { silhouette: "silhouette", pipette: "pipette", auto: "clic sur le joueur" };
  /* opts : nav (boutons avancer / reculer et champ « aller à »), bench (partie banc, vrai par défaut), onMore(cat) (donner un autre exemple),
     onChange() (le parent se redessine après un changement). Aucun bouton ne bloque l'analyse. */
  function examplesPanel(opts) {
    const o = opts || {}, a = ai(), root = exEl("div", "ex-panel");
    if (!EX) return root;
    const msg = exEl("p", "hint ex-msg", "");
    const refresh = () => { renderKits(); renderBenchZones(); if (o.onChange) o.onChange(); };
    const dur = () => video.duration || state.project.duration || 0;
    const vnom = state.project.videoName || null;
    root.appendChild(exEl("h4", null, "Mes exemples (gardés dans ce projet)"));
    if (more && pickRole === more.key) {
      const cons = exEl("div", "ex-consigne");
      cons.appendChild(exEl("b", null, "Cliquez sur la silhouette de : " + (ROLES.find((q) => q[0] === more.key) || [])[1]));
      cons.appendChild(exEl("span", "hint", " Choisissez le bon moment avec les boutons ci-dessous, puis cliquez sur le joueur dans la vidéo. Je reviens ensuite à " + App.fmt(more.t) + "."));
      cons.appendChild(exBtn("Annuler", "Abandonner et revenir à l'instant de départ", () => cancelMore(true), "ghost"));
      root.appendChild(cons);
    }
    root.appendChild(exEl("p", "hint", "Donnez plusieurs exemples à des moments différents : l'IA les utilise tous ensemble. Ils restent dans ce projet et ne servent jamais à un autre match."));
    if (o.nav) {
      const nav = exEl("div", "ex-nav"), lab = exEl("span", "muted ex-time", App.fmt(video.currentTime || 0));
      [["−10 s", -10], ["−1 s", -1], ["+1 s", 1], ["+10 s", 10]].forEach(([txt, d]) => nav.appendChild(exBtn(txt, "Reculer / avancer dans la vidéo", () => App.seek(Math.max(0, Math.min(dur(), (video.currentTime || 0) + d))))));
      const inp = exEl("input"); inp.type = "text"; inp.placeholder = "mm:ss"; inp.size = 6; inp.setAttribute("aria-label", "Aller à l'instant (mm:ss)");
      const go = () => { if (!App.isVideoReady()) { msg.textContent = "Choisissez d'abord une vidéo."; return; } const t = App.parseTime(inp.value); if (t == null) { msg.textContent = "Écrivez l'instant sous la forme mm:ss, par exemple 2:30."; return; } App.seek(Math.max(0, Math.min(dur(), t))); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      nav.appendChild(lab); nav.appendChild(inp); nav.appendChild(exBtn("Aller", "Aller à cet instant", go));
      const upd = () => { if (!root.isConnected) { video.removeEventListener("timeupdate", upd); video.removeEventListener("seeked", upd); return; } lab.textContent = App.fmt(video.currentTime || 0); };
      video.addEventListener("timeupdate", upd); video.addEventListener("seeked", upd);
      root.appendChild(nav);
    }
    ROLES.forEach(([key, label, color]) => {
      const e = EX.etat(a.kits, key), box = exEl("div", "ex-cat");
      const head = exEl("div", "ex-head");
      const dot = exEl("span", "ex-dot"); dot.style.background = color;
      head.appendChild(dot); head.appendChild(exEl("b", null, label));
      head.appendChild(exEl("span", "ex-chip " + (e.etat === "assez" ? "assez" : e.etat === "insuffisant" ? "plus" : "fac"), e.etat === "assez" ? "assez d'exemples" : e.etat === "insuffisant" ? "il en faut plus" : "facultatif"));
      const btns = exEl("span", "ex-btns");
      btns.appendChild(exBtn("＋ Autre exemple", "Donner un exemple à un autre moment de la vidéo", () => { if (o.onMore) o.onMore(key); else startPick(key); }));
      const demandeInstant = () => { const r = exRot[key] || (exRot[key] = { n: 0, dernier: null }); return EX.prochainInstant({ kits: a.kits, cat: key, frames, duree: dur(), v: vnom, lost: a.lost || [], rotation: r.n, dernier: r.dernier }); };
      const p = e.etat === "insuffisant" || (e.etat === "facultatif" && e.n > 0) ? demandeInstant() : null;
      if (p) btns.appendChild(exBtn("Aller à un instant " + (p.probable ? "probable" : "éloigné"), p.raison, () => {
        const r = exRot[key] || (exRot[key] = { n: 0, dernier: null }), q = demandeInstant() || p;
        r.n++; r.dernier = q.t;
        App.seek(q.t); msg.textContent = label + " : " + App.fmt(q.t) + " — " + q.raison + ". (Un autre clic propose un autre instant.)";
      }));
      head.appendChild(btns);
      box.appendChild(head);
      box.appendChild(exEl("p", "hint", e.texte + "."));
      const ask = EX.demande(a.kits, key);
      if (ask) box.appendChild(exEl("p", "hint ex-ask", ask));
      EX.liste(a.kits, key).forEach((x) => {
        const row = exEl("div", "ex-row");
        row.appendChild(exEl("span", "ex-t", EX.fmtT(x.t)));
        row.appendChild(exEl("span", "muted", SRC_TXT[x.src] || "source inconnue"));
        const sw = K.swatches(x.feat), cs = exEl("span", "kit-sw");
        if (sw) ["shirt", "shorts", "socks", "trim"].forEach((part) => { if (sw[part]) { const i = exEl("i", "sw"); i.style.background = sw[part]; cs.appendChild(i); } });
        row.appendChild(cs);
        const autre = x.v && vnom && x.v !== vnom;
        if (autre) row.appendChild(exEl("span", "muted", "autre vidéo"));
        else if (x.t != null) row.appendChild(exBtn("Aller", "Aller à l'instant de cet exemple", () => App.seek(x.t)));
        row.appendChild(exBtn("✕", "Supprimer cet exemple", () => { EX.retirer(a.kits, key, x.id); App.changed(); refresh(); }, "ghost"));
        box.appendChild(row);
      });
      root.appendChild(box);
    });
    EX.contradictions(a.kits).forEach((c) => root.appendChild(exEl("p", "hint kit-warn", "⚠ " + c.texte)));
    if (o.bench !== false) {
      const zs = a.benchZones || [], info = EX.banc(zs, { camera: a.camera }), box = exEl("div", "ex-cat"), head = exEl("div", "ex-head");
      head.appendChild(exEl("b", null, "Banc des remplaçants"));
      head.appendChild(exEl("span", "ex-chip " + (info.etat === "ok" ? "assez" : info.etat === "aucune" ? "fac" : "plus"), info.etat === "ok" ? "marqué" : info.etat === "aucune" ? "facultatif" : "il en faut plus"));
      const btns = exEl("span", "ex-btns");
      btns.appendChild(exBtn("Marquer le banc à cet instant", "Cliquez deux coins opposés de la zone du banc, sur l'image affichée", () => {
        if (!startBenchMark()) { msg.textContent = "Le terrain n'est pas repéré à cet instant."; offreBanc(msg); }
        else { msg.textContent = "Cliquez un coin de la zone du banc, puis le coin opposé (Échap : annuler)."; }
      }));
      head.appendChild(btns); box.appendChild(head);
      box.appendChild(exEl("p", "hint", zs.length ? zs.length + " marque(s) à " + info.instants + " instant(s). La caméra fait dériver le banc : plusieurs marques à des moments différents aident ; elles servent à la prochaine analyse." : "Aucune marque. Sans marque, les remplaçants le long de la ligne de touche risquent d'être comptés comme joueurs."));
      zs.forEach((z, i) => {
        const row = exEl("div", "ex-row");
        row.appendChild(exEl("span", "ex-t", EX.fmtT(typeof z.t === "number" ? z.t : null)));
        row.appendChild(exEl("span", "muted", Math.round((z.x2 - z.x1) * 10) / 10 + " × " + Math.round((z.y2 - z.y1) * 10) / 10 + " m"));
        if (typeof z.t === "number" && !(z.v && vnom && z.v !== vnom)) row.appendChild(exBtn("Aller", "Aller à l'instant de cette marque", () => App.seek(z.t)));
        row.appendChild(exBtn("✕", "Supprimer cette marque", () => { zs.splice(i, 1); App.changed(); refresh(); }, "ghost"));
        box.appendChild(row);
      });
      info.messages.forEach((m) => box.appendChild(exEl("p", "hint kit-warn", "⚠ " + m)));
      root.appendChild(box);
    }
    root.appendChild(msg);
    return root;
  }

  /* ---------- contrôle qualité : ce qui rend l'analyse fragile, mesuré, avec le remède ---------- */
  function updateQuality(res) {
    const a = state.project.ai;
    if (!a || !Q) return;
    try {
      const oq = D.openQuestions({ doubts: a.doubts || [], subs: a.subs || [], uncertain: a.uncertain || [], memory: memory() }).length;
      a.quality = Q.evaluate({ res, ai: a, project: state.project, L: L(), videoWidth: video.videoWidth, openQuestions: oq, kitWarnings: kitWarnings(refs()), exemples: EX ? EX.etats(a.kits).filter((e) => e.etat === "insuffisant") : [] });
    } catch (_e) { /* le contrôle qualité ne doit jamais bloquer l'analyse */ }
  }
  /* Passage perdu le plus long dont on connaît le point de reprise (la caméra redevient stable) : { de, a, reprise } ou null. */
  function mainRecalage(a) {
    const list = (a && Array.isArray(a.recalage) ? a.recalage : []).filter((r) => r && typeof r.reprise === "number");
    return list.sort((x, y) => (y.a - y.de) - (x.a - x.de))[0] || null;
  }
  function recalageHint(a) {
    const r = mainRecalage(a);
    return r ? " Pour reprendre : ajoute un calibrage vers " + App.fmt(r.reprise) + " (la caméra y redevient stable), puis relance l'analyse." : "";
  }
  function renderQuality() {
    const box = $("ai-quality"), a = state.project.ai;
    if (!box) return;
    if (!a || !Q || !a.stats) { box.hidden = true; return; }
    if (!a.quality && frames.length) {                              // ancien projet : le contrôle est calculé une fois
      try {
        const s = a.settings || {};
        updateQuality(analyzeMatch(frames, { L: L(), W: W(), dirAt, lost: a.lost || [], span: [s.t0 || frames[0].t, s.t1 || frames[frames.length - 1].t], bench: benchSetting(), benchSeen: a.benchSeen || null, subAnswers: subAnswers() }));
      } catch (_e) { /* ignoré */ }
    }
    const q = a.quality;
    if (!q) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = "";
    const h = document.createElement("div"); h.className = "q-head " + q.level;
    h.textContent = q.level === "bon" ? "✔ Qualité de l'analyse : aucun problème repéré" : "⚠ Qualité de l'analyse : " + q.items.filter((i) => i.level === "attention").length + " point(s) à améliorer";
    box.appendChild(h);
    q.items.forEach((it) => {
      const row = document.createElement("div"); row.className = "q-item " + it.level;
      const t = document.createElement("b"); t.textContent = it.title; row.appendChild(t);
      const d = document.createElement("div"); d.textContent = it.detail; row.appendChild(d);
      const f = document.createElement("div"); f.className = "muted"; f.textContent = "À faire : " + it.fix; row.appendChild(f);
      const rc = it.blocking ? mainRecalage(a) : null;
      if (rc) {
        const surPlace = rc.reprise <= rc.de + 0.5;      // le point de reprise est le début du passage perdu : la caméra est stable juste après le décrochage
        const go = document.createElement("button"); go.type = "button"; go.textContent = "▶ Aller à " + App.fmt(rc.reprise) + (surPlace ? " (là où la caméra décroche)" : " (point de reprise)");
        go.addEventListener("click", () => {
          video.pause(); App.seek(rc.reprise);
          try { video.scrollIntoView({ block: "nearest" }); } catch (_e) { /* ignoré */ }
          App.toast("Vidéo placée à " + App.fmt(rc.reprise) + (surPlace ? " : c'est ici que le suivi de la caméra décroche (passage perdu jusqu'à " + App.fmt(rc.a) + ")." : " : la caméra y redevient stable."));
          drawOverlay();
        });
        row.appendChild(go);
      }
      box.appendChild(row);
    });
    if (q.good.length) { const g = document.createElement("div"); g.className = "muted q-good"; g.textContent = "Contrôles réussis : " + q.good.join(" · "); box.appendChild(g); }
  }

  function renderStats() {
    const a = state.project.ai, box = $("ai-stats");
    box.innerHTML = "";
    renderQuality();
    if (!a || !a.stats) { setChip("ai-s4-state", "Pas encore d'analyse", ""); renderNext(); return; }
    const st = a.stats;
    const cells = [
      ["Possession (moi)", st.possession && st.possession.known ? st.possession.A + " %" : "n.d."],
      ["Possession (adv.)", st.possession && st.possession.known ? st.possession.B + " %" : "n.d."],
      ["Ballon tenu déduit", st.possession && st.possession.known ? (st.possession.deduced || 0) + " % de la possession" : "n.d."],
      ["Durée analysée", App.fmt(st.duration)],
      ["Profondeur moy.", st.shape ? st.shape.depth + " m" : "n.d."],
      ["Largeur moy.", st.shape ? st.shape.width + " m" : "n.d."],
      ["Images", String(frames.length)]
    ];
    cells.forEach(([k, v]) => { const d = document.createElement("div"); d.className = "st"; d.innerHTML = esc(k) + "<b>" + esc(v) + "</b>"; box.appendChild(d); });
    setChip("ai-s4-state", frames.length + " images", "ok");
    renderNext();
  }

  /* ---------- analyse v2 (bêta) : validation des règles et couverture ---------- */
  function ruleDecision(id, decision) {
    const a = ai();
    a.regles = RG.valider(a.regles || {}, id, decision);
    reanalyzeSuggestions(); App.changed();
    App.toast(decision === "validee" ? "Règle " + id + " validée." : decision === "rejetee" ? "Règle " + id + " rejetée : elle n'affichera plus rien." : "Règle " + id + " remise à « non validée ».");
  }
  function ruleButtons(r) {
    const mk = (d, label) => "<button data-r=\"" + d + "\" class=\"ghost\">" + label + "</button>";
    return (r.etatRegle === "validee" ? "" : mk("validee", "Valider")) + (r.etatRegle === "rejetee" ? "" : mk("rejetee", "Rejeter")) + (r.etatRegle === "non_validee" ? "" : mk("non_validee", "Remettre à non validée"));
  }
  function renderCoverage() {
    const a = state.project.ai, box = $("ai-cov"), list = $("ai-cov-list"), rows = a && a.v2 && Array.isArray(a.couverture) ? a.couverture : null;
    box.hidden = !rows;
    if (!rows) return;
    const sum = RG.resumeCouverture(rows);
    $("ai-cov-sum").textContent = "— " + sum.evaluees + " règle(s) évaluée(s) sur " + sum.total + " (dont " + sum.nonValidees + " non validée(s)), " + sum.nonEvaluees + " non évaluée(s)";
    list.innerHTML = "";
    rows.forEach((r) => {
      const row = document.createElement("div"); row.className = "cov-row";
      const rule = RG.PAR_ID[r.id], state2 = r.statut === "evaluee"
        ? "<span class=\"cov-ok\">évaluée</span> — " + r.nb + " erreur(s) trouvée(s)" + (r.sur != null ? " (ballon fiable sur " + r.sur + " % du temps)" : "") + (r.etatRegle === "validee" ? " — règle validée" : " — <b>règle non validée</b>")
        : "<span class=\"" + (r.raison === "règle rejetée par le coach" ? "cov-rej" : "cov-no") + "\">non évalué</span> : " + esc(r.raison);
      row.innerHTML = "<b>" + r.id + "</b><div><div>" + esc(r.titre) + "</div><div class=\"muted\">" + state2 + "</div>" + (rule && rule.codee ? "<div class=\"muted\" style=\"font-size:12px\">Mesure : " + esc(rule.mesure) + "</div>" : "") + "</div><div class=\"v2rule\">" + (rule && rule.codee ? ruleButtons(r) : "") + "</div>";
      row.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => ruleDecision(r.id, b.dataset.r)));
      list.appendChild(row);
    });
  }
  function renderSuggestions() {
    renderCoverage();
    const a = state.project.ai, list = $("ai-sugg");
    list.innerHTML = "";
    const items = (a && a.suggestedEvents) || [];
    $("ai-sugg-count").textContent = "(" + items.length + ")";
    const unc = (a && a.uncertain) || [];
    const ctxInfo = a && a.context;
    const uncNote = () => {
      const add = (id, text) => { const p = document.createElement("p"); p.className = "muted"; p.id = id; p.style.padding = "6px"; p.textContent = text; list.appendChild(p); return p; };
      if (unc.length) add("ai-uncertain", unc.length + " situation(s) non signalée(s), contexte incertain : " + unc.map((u) => App.fmt(u.t) + " " + App.labelOf(u.type) + " (" + (u.reason || "ballon pas assez visible") + ")").join(", ") + ".");
      if (ctxInfo && ctxInfo.reliable && ctxInfo.reliable.total > 0) {
        const r = ctxInfo.reliable;
        add("ai-reliable", "Temps de jeu analysé de façon fiable : " + Math.round(r.ratio * 100) + " % (" + App.fmt(r.sec) + " sur " + App.fmt(r.total) + ").");
        const ps = (ctxInfo.passages || []).filter((x) => x.kind !== "tenu");
        if (ps.length) { const p = add("ai-passages", ""); p.innerHTML = ps.map((x) => esc(x.text)).join("<br>"); }
        add("ai-bench-info", ctxInfo.bench
          ? "Bancs des remplaçants : " + (ctxInfo.bench.side === "left" ? "à gauche" : "à droite") + " (" + ctxInfo.bench.source + ") ; les joueurs qui entrent ou sortent par la zone de remplacement ne sont pas comptés comme des erreurs."
          : "Côté des bancs non déduit (trop peu de remplaçants visibles) : choisissez-le dans les réglages ; en attendant, les remplacements volants ne sont pas distingués.");
      }
    };
    if (!items.length) { list.innerHTML = "<p class=\"muted\" style=\"padding:6px\">Aucune erreur en attente.</p>"; uncNote(); renderQuestions(); return; }
    items.forEach((e) => {
      const row = document.createElement("div"); row.className = "ev";
      row.innerHTML = "<button class=\"t\">" + App.fmt(e.t) + "</button><div><div class=\"lbl\"><span class=\"dot\" style=\"background:" + App.phaseColor(e.type) + "\"></span>" + esc(App.labelOf(e.type)) + "</div><div class=\"chips\">" + esc(e.note || "") + (typeof e.ballConf === "number" ? " · ballon vu sur " + Math.round(e.ballConf * 100) + " % des images" : "") + (e.statut && window.FutsalRegleOr ? " · statut : " + window.FutsalRegleOr.decrire(e.statut) : "") + "</div></div><div class=\"btns\"><button data-a=\"ok\" title=\"Ajouter aux événements\">✔</button><button data-a=\"no\" title=\"Écarter\">✖</button></div>";
      if (isV2() && e.regle) {
        const c = document.createElement("div"); c.className = "chips v2rule";
        c.innerHTML = "<span>Règle " + e.regle + " — " + (e.regleEtat === "validee" ? "règle validée" : "<b>règle non validée</b>") + "</span>" + ruleButtons({ etatRegle: e.regleEtat });
        c.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => ruleDecision(e.regle, b.dataset.r)));
        row.children[1].appendChild(c);
      }
      row.querySelector(".t").addEventListener("click", () => App.seek(Math.max(0, e.t - 3)));
      row.querySelector("[data-a=ok]").addEventListener("click", () => acceptSuggestion(e));
      row.querySelector("[data-a=no]").addEventListener("click", () => { D.reject(memory(), e); a.suggestedEvents = a.suggestedEvents.filter((x) => x.sid !== e.sid); a.suggested = a.suggestedEvents.length; renderSuggestions(); App.changed(); });
      list.appendChild(row);
    });
    uncNote();
    renderQuestions();
  }

  /* Ajoute des suggestions aux événements du projet, avec une vignette de la vidéo à l'instant de l'erreur. */
  async function acceptSuggestions(list) {
    const p = state.project, a = p.ai;
    const todo = list.filter((e) => !p.events.some((x) => x.type === e.type && Math.abs(x.t - e.t) < 2));
    let thumbs = [];
    if (todo.length && App.getVideoUrl() && App.isVideoReady()) {
      try { thumbs = await P.captureFrames(App.getVideoUrl(), todo.map((e) => e.t), 320); } catch (_e) { thumbs = []; }
    }
    todo.forEach((e, i) => {
      p.events.push({ id: App.uid(), t: Math.round(e.t * 10) / 10, type: e.type, zone: e.zone, side: e.side, outcome: e.outcome || "AUCUN", system: p.defaultSystem, note: e.note || "", auto: true, thumb: thumbs[i] || null });
    });
    p.events.sort((x, y) => x.t - y.t);
    const sids = new Set(list.map((e) => e.sid));
    a.suggestedEvents = a.suggestedEvents.filter((x) => !sids.has(x.sid));
    a.suggested = a.suggestedEvents.length;
    App.renderEvents(); App.renderTimeline(); App.renderPalette(); renderSuggestions(); App.changed();
  }
  const acceptSuggestion = (e) => acceptSuggestions([e]);

  /* ---------- calibrage ---------- */
  function startPlacing() {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    video.pause();
    pickRole = null; pip = null; renderPipette();
    placing = $("ai-landmark").value;
    updateOverlayMode();
    const opt = $("ai-landmark").selectedOptions && $("ai-landmark").selectedOptions[0];
    $("ai-calib-msg").textContent = "Cliquez sur la vidéo à cet endroit : " + (opt ? opt.textContent : "le repère choisi") + ".";
  }

  function validateCalibration() {
    const a = ai(), msg = $("ai-calib-msg");
    if (!App.isVideoReady()) { msg.textContent = "Chargez d'abord une vidéo."; return false; }
    if (pts.length < 4) { msg.textContent = "Placez au moins 4 repères (" + pts.length + " pour l'instant)."; return false; }
    const lm = Object.fromEntries(HG.landmarks(L(), W()).map((l) => [l.id, l]));
    const src = pts.map((p) => [p.ix, p.iy]), dst = pts.map((p) => [lm[p.id].x, lm[p.id].y]);
    const area = HG.spread(src) / (video.videoWidth * video.videoHeight);
    if (area < 0.04) { msg.textContent = "Les repères sont trop regroupés : répartissez-les sur tout le terrain visible."; return false; }
    let H, err;
    try { H = HG.solve(src, dst); err = HG.reprojectionError(H, src, dst); }
    catch (e) { msg.textContent = e.message; return false; }
    if (!isFinite(err) || err > 1.5) { msg.textContent = "Calibrage imprécis (erreur " + (isFinite(err) ? err.toFixed(2) : "?") + " m). Replacez les repères avec plus de précision ou ajoutez-en d'autres."; return false; }
    const t = Math.round(video.currentTime * 10) / 10;
    a.calibrations = a.calibrations.filter((c) => Math.abs(c.t - t) > 0.5).concat([{ t, points: pts.map((p) => ({ id: p.id, ix: p.ix, iy: p.iy })), H, err }]).sort((x, y) => x.t - y.t);
    pts = []; placing = null;
    msg.textContent = "Calibrage enregistré (erreur moyenne " + err.toFixed(2) + " m). Cochez « Terrain » pour vérifier le tracé sur l'image.";
    $("ov-court").checked = true;
    renderPoints(); renderCalibs(); updateOverlayMode(); App.changed(); planSuivi();
    return true;
  }

  /* ---------- choix des tenues ---------- */
  /* « ＋ Autre exemple » dans la liste des équipes : mêmes consignes et même navigation que dans l'assistant, retour à l'instant de départ après validation. */
  function moreHere(key) {
    if (!App.isVideoReady()) { App.toast("La vidéo n'est pas encore prête : attendez qu'elle s'affiche, puis recommencez.", true); return; }
    if (!api) { App.toast("Fonction disponible dans l'application uniquement.", true); return; }
    more = { key, t: video.currentTime || 0 };
    startPick(key);
    renderKits();
    const c = $("ai-kits"); if (c && c.scrollIntoView) c.scrollIntoView({ block: "nearest" });
    App.toast("Cliquez sur la silhouette de : " + (ROLES.find((q) => q[0] === key) || [])[1] + ". Utilisez −10 s / −1 s / +1 s / +10 s ou « Aller à » pour choisir le moment.");
  }
  function cancelMore(back) {
    const m = more; more = null; pickRole = null;
    if (back && m) App.seek(m.t);
    updateOverlayMode(); renderKits();
  }
  function finishMore() { const m = more; more = null; if (m) App.seek(m.t); }

  async function startPick(role) {
    if (more && more.key !== role) more = null;
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    if (!api) { App.toast("Fonction disponible dans l'application uniquement.", true); return; }
    video.pause();
    placing = null; pickRole = role; pip = null; preview = null; renderPipette();
    updateOverlayMode();
  }

  async function handlePick(ix, iy) {
    const role = pickRole;
    const rearm = () => { if (more && more.key === role) { pickRole = role; updateOverlayMode(); renderKits(); } };   // « Autre exemple » : on reste en attente d'un clic
    pickRole = null; updateOverlayMode();
    App.toast("Détection en cours…");
    try {
      const res = await P.detectAt(video, api, 1);
      const cx = ix * res.scale, cy = iy * res.scale;
      const persons = res.dets.filter((d) => d.cls === 0);
      let best = null, bs = Infinity;
      persons.forEach((d) => {
        const inside = cx >= d.x1 && cx <= d.x2 && cy >= d.y1 && cy <= d.y2;
        const dist = inside ? (d.x2 - d.x1) * (d.y2 - d.y1) : Infinity;
        if (dist < bs) { bs = dist; best = d; }
      });
      if (!best) {
        let md = 80 * res.scale + 1;
        persons.forEach((d) => { const dd = Math.hypot((d.x1 + d.x2) / 2 - cx, (d.y1 + d.y2) / 2 - cy); if (dd < md) { md = dd; best = d; } });
      }
      if (!best) { App.toast("Aucun joueur détecté à cet endroit. Cliquez sur le joueur lui-même.", true); rearm(); return; }
      const feat = K.sample(res.img, [best.x1, best.y1, best.x2, best.y2]);
      if (!feat) { App.toast("Joueur trop petit pour lire la tenue : choisissez une image où il est plus grand.", true); rearm(); return; }
      const a = ai();
      (a.kits[role] = a.kits[role] || []).push(marque(feat, "auto"));
      renderKits(); App.changed();
      App.toast("Tenue enregistrée.");
      if (more && more.key === role) { finishMore(); renderKits(); }
    } catch (e) { App.toast("Détection impossible : " + e.message, true); rearm(); }
  }

  /* ---------- pipette ---------- */
  function grabFrame() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.min(1, 1280 / Math.max(vw, vh * (16 / 9)));
    const w = Math.max(2, Math.round(vw * scale)), h = Math.max(2, Math.round(vh * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    return { img: ctx.getImageData(0, 0, w, h), scale };
  }

  function startPipette(role) {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    video.pause();
    placing = null; pickRole = null; preview = null;
    pip = { role, parts: { shirt: null, shorts: null, socks: null, trim: null }, part: "shirt", points: [] };
    renderPipette(); updateOverlayMode();
  }

  function renderPipette() {
    const box = $("ai-pipette");
    box.hidden = !pip;
    if (!pip) return;
    $("pp-title").textContent = "Pipette — " + (ROLES.find((q) => q[0] === pip.role) || [])[1];
    box.querySelectorAll("button[data-part]").forEach((b) => {
      const part = b.dataset.part, lab = pip.parts[part];
      b.classList.toggle("cur", part === pip.part);
      b.innerHTML = esc(b.textContent.replace(/\s*$/, "")) + (lab ? "<i class=\"sw\" style=\"background:" + K.toHex(lab) + "\"></i>" : "");
    });
    $("pp-hint").textContent = "Cliquez sur " + PARTS[pip.part] + " d'un joueur de l'image. Short, chaussettes et manches/liseré sont facultatifs (les manches aident quand les deux maillots sont sombres) : « Passer » ou « Terminer ». Plusieurs joueurs possibles : relancez la pipette.";
  }

  function nextPart() {
    const order = ["shirt", "shorts", "socks", "trim"], i = order.indexOf(pip.part);
    if (i >= order.length - 1) finishPipette(); else { pip.part = order[i + 1]; renderPipette(); drawOverlay(); }
  }

  function pipetteClick(ix, iy) {
    const g = grabFrame();
    const lab = K.pipette(g.img, ix * g.scale, iy * g.scale, 3);
    if (!lab) { App.toast("Impossible de lire la couleur ici.", true); return; }
    pip.parts[pip.part] = lab;
    pip.points.push({ ix, iy });
    nextPart();
  }

  function finishPipette() {
    if (!pip) return;
    if (!pip.parts.shirt) { App.toast("Cliquez d'abord sur le maillot (partie obligatoire).", true); return; }
    const a = ai(), f = K.fromParts(pip.parts.shirt, pip.parts.shorts, pip.parts.socks, pip.parts.trim);
    (a.kits[pip.role] = a.kits[pip.role] || []).push(marque(f, "pipette"));
    pip = null; renderPipette(); renderKits(); updateOverlayMode(); App.changed();
    App.toast("Tenue enregistrée.");
    if (lastTest) renderPreview();
  }

  function cancelPipette() { pip = null; renderPipette(); updateOverlayMode(); }

  /* ---------- test de la reconnaissance sur l'image en pause ---------- */
  function tol() { return Number($("ai-tol").value) || 42; }
  function floorMarks() { return $("ai-marks").checked; }
  function benchSetting() { return $("ai-bench").value; }

  /* ---------- zones des bancs ---------- */
  /* ---------- bancs reconnus par le programme, fiches des remplaçants, changements ---------- */
  const bcEl = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const fmtM = (v) => String(v).replace(".", ",");
  function bancsFrom(a, decisions) {
    if (!BCH || !frames.length) return null;
    return BCH.analyser(frames, { L: L(), W: W(), decisions: decisions || a.bancsDecisions || [], anciennes: (a.bancs && a.bancs.fiches) || [] });
  }
  function decide(b, oui) {
    const a = ai(); a.bancsDecisions = (a.bancsDecisions || []).filter((d) => !(d.cote === b.cote && Math.abs(d.x - (b.x0 + b.x1) / 2) <= 3)).concat([{ cote: b.cote, x: Math.round(((b.x0 + b.x1) / 2) * 10) / 10, oui }]);
    a.bancs = bancsFrom(a) || a.bancs; renderBancs(); App.changed();
  }
  function renderBancs() {
    const box = $("ai-bancs"); if (!box) return;
    const a = ai(), r = a && a.bancs;
    box.innerHTML = "";
    if (!r) { box.appendChild(bcEl("p", "muted", "Les bancs de remplaçants seront reconnus pendant l'analyse (personnes assises hors du terrain, présentes longtemps au même endroit).")); return; }
    box.appendChild(bcEl("h5", null, "Bancs reconnus par le programme"));
    r.notes.forEach((n) => box.appendChild(bcEl("p", "muted", n)));
    r.bancs.forEach((b) => {
      const it = bcEl("div", "bc-item" + (b.sur || b.confirme ? "" : " q"));
      it.appendChild(bcEl("span", null, "Banc " + b.id.slice(1) + " — ligne de touche " + (b.cote === "y0" ? "1" : "2") + ", de " + fmtM(b.x0) + " à " + fmtM(b.x1) + " m le long du terrain, à " + fmtM(b.d0) + "–" + fmtM(b.d1) + " m de la ligne ; " + b.presence + " créneaux de 5 s avec des personnes assises, vu à " + b.instants.length + " moment(s)"));
      if (b.confirme) it.appendChild(bcEl("b", null, "✔ confirmé par vous"));
      else if (b.sur) it.appendChild(bcEl("b", null, "✔ reconnu"));
      else { it.appendChild(bcEl("b", null, "Est-ce un banc ? " + b.raison)); const y = bcEl("button", null, "Oui, c'est un banc"); y.addEventListener("click", () => decide(b, true)); it.appendChild(y); }
      const n = bcEl("button", null, "Ce n'est pas un banc"); n.addEventListener("click", () => decide(b, false)); it.appendChild(n);
      if (b.sur || b.confirme) {
        const u = bcEl("button", null, "Ne plus compter ces personnes comme joueurs");
        u.title = "Ajoute cette zone aux zones de banc : à la prochaine analyse, les personnes assises dedans ne sont plus comptées comme des joueurs.";
        u.addEventListener("click", () => {
          const sy = b.cote === "y0" ? [-b.d1 - 0.5, -Math.max(0, b.d0 - 0.5)] : [W() + Math.max(0, b.d0 - 0.5), W() + b.d1 + 0.5];
          const nz = { x1: b.x0, y1: sy[0], x2: b.x1, y2: sy[1] };
          a.benchZones = ((a.benchZones || []).concat([EX ? EX.marquerBanc(nz, { t: video.currentTime || 0, v: state.project.videoName || null }) : nz])).slice(EX ? -EX.LIMITES.BANC_MAX : -3);
          renderBenchZones(); drawOverlay(); App.changed(); App.toast("Zone de banc ajoutée : elle servira à la prochaine analyse.");
        });
        it.appendChild(u);
      }
      box.appendChild(it);
    });
    if (r.fiches.length) {
      box.appendChild(bcEl("h5", null, "Personnes vues au banc (fiches d'apparence : tenue, jamais d'identité devinée)"));
      r.fiches.forEach((fi) => {
        const it = bcEl("div", "bc-item" + (fi.proches.length ? " q" : ""));
        it.appendChild(bcEl("b", null, fi.libelle));
        const inp = bcEl("input"); inp.type = "text"; inp.placeholder = "Nommer"; inp.value = fi.nom || "";
        inp.addEventListener("change", () => { fi.nom = inp.value.trim() || null; fi.libelle = fi.nom || "remplaçant " + String.fromCharCode(65 + ((Number(fi.id.slice(1)) - 1) % 26)); renderBancs(); App.changed(); });
        it.appendChild(inp);
        it.appendChild(bcEl("span", "muted", "vue " + fi.n + " fois, de " + App.fmt(fi.t0) + " à " + App.fmt(fi.t1) + (fi.proches.length ? " — ressemble à " + fi.proches.map((id) => (r.fiches.find((q) => q.id === id) || {}).libelle).join(", ") + " : je demanderai en cas de doute" : "")));
        box.appendChild(it);
      });
    }
    box.appendChild(bcEl("h5", null, "Changements repérés (entrées au banc)"));
    // seuls les passages assez sûrs sont listés (entrant reconnu ou choisi par vous, ou sortie vue) ; les autres, trop incertains, sont comptés mais pas affichés
    const sur = (c) => c.entrant.statut === "reconnu" || !!c.entrant.choix || c.sortant.statut === "observée";
    const montres = r.changements.filter(sur);
    if (!r.changements.length) box.appendChild(bcEl("p", "muted", "Aucune entrée de remplaçant repérée près d'un banc reconnu."));
    else if (r.changements.length > montres.length) box.appendChild(bcEl("p", "muted", (r.changements.length - montres.length) + " autre(s) passage(s) près du banc trop incertain(s) (personne illisible ou ressemblant à plusieurs fiches) : non listés, rien n'est deviné."));
    montres.forEach((c) => {
      const e = c.entrant, s = c.sortant, qui = e.fiche ? (r.fiches.find((q) => q.id === (e.choix || e.fiche)) || {}).libelle : null;
      const it = bcEl("div", "bc-item" + (e.statut === "reconnu" || e.choix ? "" : " q"));
      const go = bcEl("button", null, "⏵ " + App.fmt(c.t)); go.addEventListener("click", () => App.seek(Math.max(0, c.t - 1)));
      it.appendChild(go);
      const nom = e.choix ? (r.fiches.find((q) => q.id === e.choix) || {}).libelle + " (choisi par vous)" : qui ? qui + " (reconnu)" : e.statut === "ambigu" ? "deux personnes se ressemblent" : e.statut === "inconnu" ? "personne inconnue du banc" : "apparence illisible";
      it.appendChild(bcEl("span", null, "Entre : " + nom + " (équipe " + (c.equipe || "?") + ") — Sort : " + (s.statut === "observée" ? "joueur " + s.piste + " (vu quitter le terrain)" : s.statut === "ambigu" ? "plusieurs joueurs possibles" : "sortie non vue (peut-être hors du champ de la caméra)")));
      if ((e.statut === "ambigu" || e.statut === "inconnu") && !e.choix) {
        const sel = bcEl("select"); sel.appendChild(new Option("Qui est-ce ?", ""));
        r.fiches.forEach((fi) => sel.appendChild(new Option(fi.libelle, fi.id)));
        sel.addEventListener("change", () => { if (sel.value) { e.choix = sel.value; renderBancs(); App.changed(); } });
        it.appendChild(sel);
      }
      box.appendChild(it);
    });
    box.appendChild(bcEl("p", "muted", "Limites : un banc hors du champ de la caméra n'est pas vu ; deux personnes en tenues proches sont rangées ensemble ou signalées ; la caméra à la main déplace le banc dans l'image (je vérifie qu'il reste au même endroit du terrain)."));
  }

  function renderBenchZones() {
    const z = (state.project.ai && state.project.ai.benchZones) || [];
    const c = EX ? EX.banc(z, { camera: state.project.ai && state.project.ai.camera }) : null;
    $("ai-bench-zones").textContent = z.length ? z.length + " zone(s) de banc marquée(s)" + (c && c.instants > 1 ? " à " + c.instants + " instants" : "") + (c && c.messages.length ? " — " + c.messages[0] : "") : "aucune zone de banc marquée";
  }
  /* Projection image (pixels vidéo) -> terrain à l'instant t : celle de l'image analysée la plus proche (la caméra a pu
     bouger depuis le calibrage), sinon le calibrage s'il a été fait à cet instant. */
  function projectionAt(t) {
    const a = state.project.ai;
    if (!a || !video.videoWidth) return null;
    // image analysée, calibrage OU suivi de la caméra (le terrain est connu à tout instant suivi) ; un suivi « recalage incertain » ne compte pas
    const ch = P.courtH(frames, a.calibrations || [], a.camera || $("ai-camera").value, t, video.videoWidth, video.videoHeight, suiviFr);
    if (!ch || !ch.H) return null;
    if (/suivi/.test(ch.source) && qualiteAt(a, t) === 0) return null;
    return ch.H;
  }
  /* Instant le plus proche de t où le terrain est connu (calibrage, image analysée, suivi de la caméra hors « recalage incertain »), ou null. */
  function instantConnu(t) {
    const a = state.project.ai; if (!a) return null;
    if ((a.camera || $("ai-camera").value) === "fixed" && a.calibrations && a.calibrations.length) return t;
    const c = [];
    suiviFr.forEach((q) => { if (qualiteAt(a, q.t) !== 0) c.push(q.t); });
    frames.forEach((q) => { if (Array.isArray(q.h)) c.push(q.t); });
    (a.calibrations || []).forEach((q) => c.push(q.t));
    let best = null;
    c.forEach((x) => { if (best == null || Math.abs(x - t) < Math.abs(best - t)) best = x; });
    return best;
  }
  /* Quand le terrain est inconnu à l'instant affiché : un seul geste utile (aller à l'instant connu le plus proche, puis marquer), jamais un message d'erreur. */
  function offreBanc(host) {
    host.textContent = ""; host.hidden = false;
    const n = instantConnu(video.currentTime || 0), b = document.createElement("button");
    b.type = "button";
    if (n == null) {
      b.textContent = "Repérer d'abord le terrain (étape 1)";
      b.addEventListener("click", () => { const d1 = $("ai-d1"); if (d1) d1.open = true; host.hidden = true; });
    } else {
      b.textContent = "Aller à l'instant le plus proche où le terrain est connu (" + App.fmt(n) + ") et marquer le banc";
      b.addEventListener("click", () => {
        host.hidden = true;
        const go = () => { video.removeEventListener("seeked", go); startBenchMark(); };
        video.addEventListener("seeked", go); App.seek(n);
        setTimeout(() => { video.removeEventListener("seeked", go); if (!benchMark) startBenchMark(); }, 3000);
      });
    }
    host.appendChild(b);
  }
  function startBenchMark() {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    const H = projectionAt(video.currentTime || 0);
    if (!H) return false;
    video.pause();
    placing = null; pickRole = null; if (pip) cancelPipette();
    benchMark = { H, first: null, t: video.currentTime || 0 };
    const hg = $("ai-bench-go"); if (hg) hg.hidden = true;
    updateOverlayMode();
    return true;
  }
  /* Le banc peut-il être marqué à l'instant affiché ? (il faut une projection image -> terrain à cet instant) */
  const benchMarkable = () => App.isVideoReady() && !!projectionAt(video.currentTime || 0);
  function benchClick(ix, iy) {
    const p = HG.apply(benchMark.H, ix, iy);
    if (!isFinite(p[0]) || !isFinite(p[1])) return;
    if (!benchMark.first) { benchMark.first = p; drawOverlay(); return; }
    const a = ai(), f = benchMark.first;
    const z = { x1: Math.min(f[0], p[0]), y1: Math.min(f[1], p[1]), x2: Math.max(f[0], p[0]), y2: Math.max(f[1], p[1]) };
    benchMark = null;
    if (z.x2 - z.x1 < 0.3 || z.y2 - z.y1 < 0.3) { App.toast("Zone trop petite : cliquez deux coins opposés autour du banc.", true); updateOverlayMode(); return; }
    const nz = Object.fromEntries(Object.entries(z).map(([k, v]) => [k, Math.round(v * 100) / 100]));
    a.benchZones = ((a.benchZones || []).concat([EX ? EX.marquerBanc(nz, { t: video.currentTime || 0, v: state.project.videoName || null }) : nz])).slice(EX ? -EX.LIMITES.BANC_MAX : -3);
    renderBenchZones(); updateOverlayMode(); App.changed();
    if (FSAI.hooks.examplesChanged) FSAI.hooks.examplesChanged();
  }

  /* La mémoire du projet filtre un résultat d'analyse : les erreurs que le coach a écartées ne reviennent pas. */
  const subAnswers = () => memory().answers.filter((x) => x.kind === "sub" || x.kind === "team");
  /* Analyse v2 (bêta) : case cochée dans l'étape d'analyse ; sinon l'analyse habituelle (match.js), inchangée. */
  const isV2 = () => !!(state.project.ai && state.project.ai.v2 && V2);
  function analyzeMatch(fr, o) { return isV2() ? V2.analyze(fr, Object.assign({}, o, { validations: state.project.ai.regles || {} })) : M.analyze(fr, o); }
  function applyMemory(res) {
    const mem = memory();
    if (state.project.ai) state.project.ai.subs = res.subs || [];
    res.events = D.filterRejected(res.events, mem);
    res.uncertain = (res.uncertain || []).filter((u) => !D.isRejected(mem, u));
    return res;
  }

  /* ---------- questions du programme ---------- */
  const qThumbs = new Map();
  /* Zones de banc d'une question (terrain, en m) -> polygones en coordonnées d'image normalisées (0..1), via la projection mesurée à cet instant. */
  function benchPolys(q) {
    const f = frames.length ? P.frameNear(frames, q.t, 0.6) : null;
    if (!f || !Array.isArray(f.h) || f.h.length !== 9 || !Array.isArray(q.zones)) return null;
    const Hi = HG.invert(f.h);
    return q.zones.map((z) => [[z.x1, z.y1], [z.x2, z.y1], [z.x2, z.y2], [z.x1, z.y2]].map((p) => HG.apply(Hi, p[0], p[1])));
  }
  const markBox = (url, b, polys) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      if (polys) { g.strokeStyle = "#f97316"; g.lineWidth = 3; g.setLineDash([8, 5]); polys.forEach((pl) => { g.beginPath(); pl.forEach((p, k) => { if (k) g.lineTo(p[0] * c.width, p[1] * c.height); else g.moveTo(p[0] * c.width, p[1] * c.height); }); g.closePath(); g.stroke(); }); }
      if (b) { g.strokeStyle = "#f97316"; g.lineWidth = 3; g.strokeRect((b[0] / 1000) * c.width, (b[1] / 1000) * c.height, ((b[2] - b[0]) / 1000) * c.width, ((b[3] - b[1]) / 1000) * c.height); }
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
  let thumbBusy = false, thumbAgain = false;
  async function loadQuestionThumbs(qs) {
    if (thumbBusy) { thumbAgain = true; return; }                 // une seule capture à la fois (chacune ouvre la vidéo)
    const todo = qs.filter((q) => !qThumbs.has(q.key));
    if (!todo.length || !App.getVideoUrl() || !App.isVideoReady()) return;
    thumbBusy = true;
    let shots = [];
    try { shots = await P.captureFrames(App.getVideoUrl(), todo.map((q) => q.t), 480); } catch (_e) { thumbBusy = false; return; }
    for (let i = 0; i < todo.length; i++) if (shots[i]) qThumbs.set(todo[i].key, await markBox(shots[i], todo[i].kind === "team" || todo[i].kind === "sub" ? todo[i].b : null, todo[i].kind === "bench" ? benchPolys(todo[i]) : null));
    document.querySelectorAll("#ai-q img[data-k]").forEach((im) => { const u = qThumbs.get(im.dataset.k); if (u) im.src = u; });
    thumbBusy = false;
    if (thumbAgain) { thumbAgain = false; renderQuestions(); }
  }
  function renderQuestions() {
    const box = $("ai-q");
    if (!box) return;
    const a = state.project.ai;
    renderAnswers(); renderBallLabels();
    const qs = a ? D.openQuestions({ doubts: a.doubts || [], subs: a.subs || [], uncertain: a.uncertain || [], memory: memory() }) : [];
    $("ai-q-count").textContent = "(" + qs.length + ")";
    box.innerHTML = "";
    if (qGroup) {
      const open = qGroup.group.filter((g) => qs.some((x) => x.kind === "team" && x.id === g.id));
      if (open.length) {
        const ban = document.createElement("div"); ban.className = "q"; ban.style.gridTemplateColumns = "1fr";
        const tx = document.createElement("div"); tx.className = "qt";
        tx.textContent = open.length + " autre(s) question(s) concernent peut-être la même personne (une piste qui commence juste après ou finit juste avant, au même endroit, avec la même équipe retenue)" + (qGroup.look ? " ou une personne qui porte la même allure (pantalon ou survêtement, sans peau visible aux jambes)" : "") + ". Appliquer la même réponse (« " + (D.TEAM_LABEL[qGroup.team] || qGroup.team) + " ») ?" + (qGroup.look ? " La tenue seule ne suffit pas à reconnaître un gardien : vérifie avant d'accepter." : "");
        const bt = document.createElement("div"); bt.className = "qb";
        const yes = document.createElement("button"); yes.className = "primary"; yes.textContent = "Oui, appliquer aux " + open.length; yes.addEventListener("click", () => applyGroup(open));
        const no = document.createElement("button"); no.textContent = "Non, une par une"; no.addEventListener("click", () => { qGroup = null; renderQuestions(); });
        bt.appendChild(yes); bt.appendChild(no); ban.appendChild(tx); ban.appendChild(bt); box.appendChild(ban);
      } else qGroup = null;
    }
    if (!qs.length) { const p = document.createElement("p"); p.className = "muted"; p.style.padding = "6px"; p.textContent = "Aucune question en attente."; box.appendChild(p); return; }
    qs.forEach((q) => {
      const row = document.createElement("div"); row.className = "q";
      const im = document.createElement("img"); im.dataset.k = q.key; im.alt = ""; if (qThumbs.has(q.key)) im.src = qThumbs.get(q.key);
      im.title = "Voir cette image dans la vidéo"; im.style.cursor = "pointer";
      im.addEventListener("click", () => showQuestion(q));
      const col = document.createElement("div");
      const tx = document.createElement("div"); tx.className = "qt";
      const bt = document.createElement("div"); bt.className = "qb";
      const add = (label, fn, cls) => { const b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls; b.addEventListener("click", fn); bt.appendChild(b); };
      add("▶ Voir dans la vidéo", () => showQuestion(q), "primary");
      if (q.kind === "team") {
        tx.textContent = App.fmt(q.t) + " — Qui est la personne marquée en orange ? (" + q.why + ")";
        add("Mon équipe", () => answerTeam(q, "A")); add("Adversaire", () => answerTeam(q, "B"));
        add("Gardien (nous)", () => answerTeam(q, "GKA")); add("Gardien adverse", () => answerTeam(q, "GKB"));
        Object.keys(D.ROLE_LABEL).forEach((k) => add(D.ROLE_LABEL[k][0].toUpperCase() + D.ROLE_LABEL[k].slice(1) + " (ne pas compter)", () => answerTeam(q, "NONE", k)));
      } else if (q.kind === "sub") {
        tx.textContent = App.fmt(q.t) + " — Cette personne passe par la zone de remplacement : remplaçant qui entre ou sort, ou joueur sur le terrain ? (je ne la compte pas comme joueur pendant 3 s)";
        add("Remplaçant (entre / sort)", () => answerSub(q, "remplacant")); add("Joueur sur le terrain", () => answerSub(q, "joueur"));
      } else if (q.kind === "bench") {
        tx.textContent = App.fmt(q.t) + " — La zone du banc (en pointillé) a suivi la caméra sur " + String(q.d).replace(".", ",") + " m. Est-elle encore sur le banc ?";
        add("Oui, sur le banc", () => answerBench(true)); add("Non, elle a dérivé", () => answerBench(false));
      } else {
        tx.textContent = App.fmt(q.t) + " — « " + App.labelOf(q.type) + " » a-t-elle eu lieu ? Je n'ai pas pu le confirmer (" + (q.reason || "ballon pas assez visible") + ").";
        add("Oui, c'est arrivé", () => answerEvent(q, "oui")); add("Non", () => answerEvent(q, "non"));
      }
      col.appendChild(tx); col.appendChild(bt);
      row.appendChild(im); row.appendChild(col); box.appendChild(row);
    });
    loadQuestionThumbs(qs);
  }
  /* Montre la question dans la vraie vidéo : image exacte (en pause) avec le cadre orange sur la personne concernée ;
     pour une erreur incertaine, 2 s avant le moment, pour le voir se produire. */
  function showQuestion(q) {
    video.pause();
    qHighlight = q.kind === "team" || q.kind === "sub" ? { t: q.t, b: q.b, id: q.id, label: q.kind === "sub" ? "Remplaçant ?" : "Question : qui est-ce ?" } : q.kind === "bench" ? { t: q.t, polys: benchPolys(q), label: "Zone du banc" } : null;
    App.seek(q.kind === "team" || q.kind === "sub" || q.kind === "bench" ? q.t : Math.max(0, q.t - 2));
    if (q.kind === "team" || q.kind === "sub") prefetchContours(q.t);
    drawOverlay();
  }
  function answerTeam(q, team, role) {
    const a = state.project.ai;
    qHighlight = null;
    const ans = D.answerTeam(memory(), q, team, undefined, role), r = D.applyOne(frames, ans, { id: q.id });
    if (r.ok) { ans.undo = r.undo; a.frames = P.compactFrames(frames); }
    else App.toast("Je ne retrouve pas cette personne dans les images : votre réponse est retenue pour la prochaine analyse.", true);
    const rest = D.openQuestions({ doubts: a.doubts || [], memory: memory() }).filter((x) => x.kind === "team");
    const dq = (a.doubts || []).find((d) => d.kind === "team" && d.id === q.id);          // un clic sur un cadre n'a pas la mesure des jambes : on la reprend de la question de cette personne
    const qq = dq ? Object.assign({}, q, { leg: q.leg != null ? q.leg : dq.leg, cur: q.cur != null ? q.cur : dq.cur }) : q;
    const cont = D.sameTrackHint(q, rest), look = team === "GKA" || team === "GKB" ? D.sameLookHint(qq, rest) : [];
    const group = cont.concat(look.filter((d) => !cont.some((c) => c.id === d.id)));
    qGroup = group.length ? { team, q, group, look: look.length > 0 } : null;
    reanalyzeSuggestions(); refreshLive(); App.changed(true);
  }
  /* Applique la réponse du coach aux pistes proposées (chacune reste une réponse distincte, annulable dans « Mes réponses »). */
  function applyGroup(list) {
    const a = state.project.ai, g = qGroup;
    if (!g) return;
    list.forEach((d) => {
      const ans = D.answerTeam(memory(), d, g.team, App.fmt(g.q.t)), r = D.applyOne(frames, ans, { id: d.id });
      if (r.ok) ans.undo = r.undo;
    });
    a.frames = P.compactFrames(frames);
    qGroup = null;
    reanalyzeSuggestions(); refreshLive(); App.changed(true);
  }
  /* ---------- corriger une personne ou le ballon en un clic sur la vidéo ---------- */
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function showMenu(e, title, items) {
    closeMenu();
    const m = document.createElement("div"); m.className = "person-menu";
    const h = document.createElement("div"); h.className = "pm-title"; h.textContent = title; m.appendChild(h);
    items.forEach((it) => { const b = document.createElement("button"); b.textContent = it.label; b.addEventListener("click", () => { closeMenu(); it.fn(); }); m.appendChild(b); });
    const x = document.createElement("button"); x.className = "ghost"; x.textContent = "Annuler"; x.addEventListener("click", closeMenu); m.appendChild(x);
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, e.clientX + 8)) + "px";
    m.style.top = Math.max(8, Math.min(window.innerHeight - r.height - 8, e.clientY + 8)) + "px";
    menuEl = m;
  }
  /* Clic sur un cadre : « qui est cette personne ? » ; clic ailleurs : « le ballon est ici ? ». Rien n'est changé sans ta réponse ; tout est annulable. */
  let clickBusy = false;
  /* Un clic sur la vidéo : dans la silhouette d'une personne = « qui est-ce ? » ; en dehors = « le ballon est ici ? ». Si la silhouette n'est pas
     disponible (découpe en échec), on retombe sur la zone de la détection (jamais affichée), comme avant. */
  async function personClick(e, ix, iy) {
    if (!frames.length || !state.project.ai || clickBusy) return;
    const t = video.currentTime || 0, f = P.frameNear(frames, t, 0.8), vw = video.videoWidth, vh = video.videoHeight;
    if (f && !bs) {
      let best = null, area = Infinity;
      let ce = contoursReady(f);
      if (!ce && CT) {
        clickBusy = true; App.toast("Je cherche les silhouettes de cette image (1 à 2 s)…");
        try { const r = await getContours(f); ce = r && r.state === "ready" ? r : null; } catch (_e) { ce = null; }
        clickBusy = false;
      }
      if (ce) {
        const hit = CT.pick(ce.items, ix * ce.k, iy * ce.k);
        if (hit) best = f.players.find((p) => p.id === hit.id) || null;
      }
      const withSil = new Set(ce ? ce.items.map((it) => it.id) : []);
      if (!best) {      // seules les personnes SANS silhouette fiable se retrouvent par leur zone (un clic hors d'une silhouette dessinée = le ballon)
        f.players.forEach((p) => {
          if (!p.b || p.b.length < 4 || withSil.has(p.id)) return;
          const x1 = (p.b[0] / 1000) * vw, y1 = (p.b[1] / 1000) * vh, x2 = (p.b[2] / 1000) * vw, y2 = (p.b[3] / 1000) * vh;
          if (ix >= x1 - 6 && ix <= x2 + 6 && iy >= y1 - 6 && iy <= y2 + 6 && (x2 - x1) * (y2 - y1) < area) { area = (x2 - x1) * (y2 - y1); best = p; }
        });
      }
      if (best) {
        const q = { kind: "team", id: best.id, t: f.t, x: best.x, y: best.y, b: best.b };
        qHighlight = { t: f.t, b: best.b, id: best.id, label: "Qui est-ce ?" }; drawOverlay();
        const lab = (k) => D.TEAM_LABEL[k] || k;
        showMenu(e, "Qui est cette personne ? (lue : " + (best.team === "A" ? "mon équipe" : best.team === "B" ? "adversaire" : lab(best.team)) + ")", [
          { label: "Mon équipe", fn: () => answerTeam(q, "A") }, { label: "Adversaire", fn: () => answerTeam(q, "B") },
          { label: "Mon gardien", fn: () => answerTeam(q, "GKA") }, { label: "Gardien adverse", fn: () => answerTeam(q, "GKB") },
        ].concat(Object.keys(D.ROLE_LABEL).map((k) => ({ label: D.ROLE_LABEL[k][0].toUpperCase() + D.ROLE_LABEL[k].slice(1) + " (ne pas compter)", fn: () => answerTeam(q, "NONE", k) })), ballItems(t, f, ix, iy).slice(0, 1).map((it) => Object.assign({}, it, { label: "Ce n'est pas une personne : le ballon est ici" }))));
        return;
      }
    }
    showMenu(e, "Le ballon est ici ?", ballItems(t, f, ix, iy));
  }
  /* Choix proposés pour un clic qui désigne le ballon : [le ballon est ici, aucun ballon visible]. */
  function ballItems(t, f, ix, iy) {
    const H = projectionAt(t), p = H && f ? HG.apply(H, ix, iy) : null, items = [];
    if (p && isFinite(p[0]) && isFinite(p[1])) items.push({ label: "Oui, le ballon est ici (image de " + App.fmt(f.t) + ")", fn: () => { saveBallLabel(t, ix, iy, H); answerBallAt({ t: f.t, x: Math.round(p[0] * 100) / 100, y: Math.round(p[1] * 100) / 100 }); } });
    else items.push({ label: "Le ballon est ici (sert seulement à l'entraînement : terrain non repéré à cet instant)", fn: () => saveBallLabel(t, ix, iy, null) });
    items.push({ label: "Aucun ballon visible sur cette image", fn: () => saveBallLabel(t, null, null, null) });
    return items;
  }
  /* Étiquette exacte du ballon (pixel cliqué) pour mesurer puis entraîner le détecteur ; jamais déduite par le programme. */
  function saveBallLabel(t, ix, iy, H, src, unsure) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const origin = bs ? (bsBlind(t) ? "aveugle" : src || "clic") : undefined;      // d'où vient l'étiquette (mesure du biais des propositions)
    const lab = unsure ? { t, unsure: true, vw, vh, src: origin } : ix == null ? { t, none: true, vw, vh, src: origin } : Object.assign({ t, u: ix, v: iy, vw, vh, src: origin }, BL.ballSize(ix, iy, vw, H, HG));
    if (!BL.add(memory(), lab)) { App.toast("Étiquette refusée : le clic est en dehors de l'image.", true); return; }
    renderBallLabels(); App.changed();
    App.toast(unsure ? "Noté : incertain (cette image ne compte ni pour ni contre)." : ix == null ? "Noté : aucun ballon visible sur cette image." : "Étiquette du ballon enregistrée.");
    if (bs && bs.list[bs.i] != null && Math.abs(bs.list[bs.i] - t) < 0.5) bsMove(1);
  }
  /* ---------- session d'étiquetage : des images une à une, le ballon proposé par le programme, la réponse est la tienne ---------- */
  let bs = null;                 // { list: [t…], i, n } ; null = pas de session
  const BS_MAX = 150;
  /* Image de contrôle (session complète seulement) : environ 1 image sur 15, tirée de façon fixe, sans proposition, pour mesurer si les propositions guident la réponse. */
  const bsBlind = (t) => !!(bs && bs.all) && (Math.imul(Math.round(t * 1000), 2654435761) >>> 0) % 10 === 0;
  function bsBox(show) { const b = $("ai-bs-box"); if (b) b.hidden = !show; }
  function startBallSession(all) {
    if (!App.isVideoReady() || !frames.length) { App.toast("Chargez la vidéo et lancez d'abord l'analyse : les images à étiqueter viennent de l'analyse.", true); return; }
    const done = BL.list(memory()), step = Math.max(1, Math.floor(frames.length / BS_MAX)), list = [];
    if (all) {      // session complète : toutes les images de la plage analysée (grille de l'analyse), pour mesurer sur un match entier
      const st = state.project.ai.settings || {}, tEnd = Math.min(st.t1 != null ? st.t1 : video.duration, video.duration - 0.05);
      P.sampleTimes(st.t0 || 0, tEnd, 3).forEach((t) => { if (!done.some((l) => Math.abs(l.t - t) < BL.T_SAME)) list.push(t); });
    } else for (let k = 0; k < frames.length && list.length < BS_MAX; k += step) { const t = frames[k].t; if (!done.some((l) => Math.abs(l.t - t) < BL.T_SAME)) list.push(t); }
    if (!list.length) { App.toast("Toutes les images proposées sont déjà étiquetées."); return; }
    bs = { list, i: 0, all: !!all }; bsBox(true); bsShow();
    try { $("ai-bs-box").scrollIntoView({ block: "nearest" }); } catch (_e) { /* défilement indisponible */ }
  }
  function bsEnd(msg) { bs = null; qHighlight = null; bsBox(false); setZoom({ k: 1, tx: 0, ty: 0 }); if (msg) App.toast(msg); }
  function bsMove(d) {
    if (!bs) return;
    const j = bs.i + d;
    if (j >= bs.list.length) { bsEnd("Session terminée : " + BL.counts(memory()).total + " étiquette(s) au total dans ce projet."); return; }
    bs.i = Math.max(0, j); bsShow();
  }
  function bsShow() {
    const t = bs.list[bs.i], f = P.frameNear(frames, t, 0.3), H = projectionAt(t);
    let pt = null;
    if (f && f.ball && H && !bsBlind(t)) {
      try { const q = HG.apply(HG.invert(H), f.ball.x, f.ball.y); if (isFinite(q[0]) && isFinite(q[1]) && q[0] >= 0 && q[1] >= 0 && q[0] <= video.videoWidth && q[1] <= video.videoHeight) pt = { u: q[0], v: q[1] }; } catch (_e) { pt = null; }
    }
    bs.pt = pt; bs.H = H;
    video.pause();
    qHighlight = { t, ballPt: pt, label: "Ballon proposé" };
    $("ai-bs-text").textContent = "Image " + (bs.i + 1) + " sur " + bs.list.length + " (" + App.fmt(t) + ") — " + (bsBlind(t) ? "image de contrôle : le programme ne propose rien. Vois-tu le ballon (au moins la moitié visible) ? " : pt ? "le programme propose le ballon dans le cercle orange. Est-ce bien le ballon ?" : "le programme ne propose aucun ballon. Vois-tu le ballon ?") + "  [Entrée = oui, N = aucun ballon visible, ? = incertain, S = passer]";
    $("ai-bs-ok").disabled = !pt; $("ai-bs-ok").title = pt ? "" : "Aucun ballon proposé sur cette image : cliquez sur le ballon dans la vidéo, ou choisissez « Aucun ballon visible ».";
    App.seek(t);
    if (pt) zoomOnPoint(pt.u, pt.v, 5); else setZoom({ k: 1, tx: 0, ty: 0 });      // agrandissement automatique autour du ballon proposé
    prefetchContours(t);
    if (bs.list[bs.i + 1] != null) prefetchContours(bs.list[bs.i + 1]);            // l'image suivante est préparée pendant que tu réponds
  }
  function bsOk() { if (bs && bs.pt) saveBallLabel(bs.list[bs.i], bs.pt.u, bs.pt.v, bs.H, "propose"); }
  function bsUnsure() { if (bs) saveBallLabel(bs.list[bs.i], undefined, undefined, null, undefined, true); }
  function bsNone() { if (bs) saveBallLabel(bs.list[bs.i], null, null, null); }
  function renderBallLabels() {
    const c = state.project.ai ? BL.counts(memory()) : { total: 0, positives: 0, negatives: 0 }, el = $("ai-bl-count");
    const un = state.project.ai ? BL.unsureCount(memory()) : 0;
    if (el) el.textContent = c.total || un ? c.positives + " avec ballon, " + c.negatives + " sans ballon" + (un ? ", " + un + " incertain(s)" : "") : "aucune étiquette";
    const b = $("ai-bl-export"); if (b) b.disabled = !c.total;
  }
  /* Exporte les images étiquetées (JPEG + fichier YOLO) dans un dossier choisi : rien ne part sur Internet. */
  async function exportBallLabels() {
    const labs = BL.list(memory()).filter(BL.exportable);      // les « incertain » ne servent pas à l'entraînement
    if (!labs.length || !App.isVideoReady()) { App.toast("Chargez la vidéo et étiquetez au moins une image.", true); return; }
    const cv = document.createElement("canvas"), items = [], wasPaused = video.paused, t0 = video.currentTime;
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    video.pause();
    for (const l of labs) {
      if (l.vw !== video.videoWidth || l.vh !== video.videoHeight) continue;      // étiquette d'une autre vidéo : ignorée
      await new Promise((res) => { const done = () => { video.removeEventListener("seeked", done); res(); }; video.addEventListener("seeked", done); video.currentTime = l.t; setTimeout(done, 4000); });
      cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.92));
      if (!blob) continue;
      items.push({ name: "balle_" + String(Math.round(l.t * 1000)).padStart(8, "0"), jpeg: await blob.arrayBuffer(), label: BL.yoloLine(l) });
    }
    video.currentTime = t0; if (!wasPaused) video.play();
    if (!items.length) { App.toast("Aucune étiquette ne correspond à cette vidéo.", true); return; }
    const r = await window.fsal.exportBallDataset(items);
    if (r && r.error) App.toast(r.error, true);
    else if (r && !r.canceled) App.toast(items.length + " image(s) exportée(s) dans : " + r.dir);
  }
  function answerBallAt(pt) {
    const a = state.project.ai, ans = D.answerBall(memory(), pt), r = D.applyOne(frames, ans);
    if (r.ok) { ans.undo = r.undo; a.frames = P.compactFrames(frames); }
    else App.toast("Ta réponse est retenue pour la prochaine analyse (cette image n'est pas encore analysée).");
    reanalyzeSuggestions(); refreshLive(); App.changed(true);
  }

  function answerSub(q, verdict) {
    D.answerSub(memory(), q, verdict);
    reanalyzeSuggestions(); App.changed();
    // la réponse est toujours retenue ; si elle ne peut pas être reliée à UNE personne, on le dit au lieu de laisser la question sans réaction
    const a = state.project.ai;
    if (a && (a.subs || []).some((x) => x.id === q.id && !x.answered)) App.toast("Ta réponse est retenue, mais je ne peux pas la relier avec certitude à une seule personne (plusieurs au même endroit). Relance l'analyse si besoin.", true);
  }
  function answerBench(ok) {
    D.answerBench(memory(), ok);
    App.toast(ok ? "Zone du banc confirmée." : "Noté : aux prochaines analyses, la zone du banc ne suivra plus la caméra. Relancez l'analyse pour l'appliquer.");
    renderQuestions(); App.changed();
  }

  /* ---------- écran « Mes réponses » : tout ce qui a été répondu ou écarté, avec Annuler ---------- */
  function renderAnswers() {
    const box = $("ai-ans");
    if (!box) return;
    const mem = state.project.ai ? memory() : { answers: [], rejected: [] }, rows = [];      // ne crée pas de projet IA vide juste pour afficher la liste
    mem.answers.slice().reverse().forEach((a) => rows.push({ text: D.describeAnswer(a, App.fmt, App.labelOf), label: "Annuler", fn: () => cancelAnswer(a) }));
    mem.rejected.slice().reverse().forEach((r) => rows.push({ text: App.fmt(r.t) + " — erreur écartée : " + App.labelOf(r.type), label: "Rétablir", fn: () => restoreRejected(r) }));
    $("ai-ans-count").textContent = "(" + rows.length + ")";
    box.innerHTML = "";
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted"; p.style.padding = "6px"; p.textContent = "Aucune réponse pour l'instant."; box.appendChild(p); return; }
    rows.forEach((x) => {
      const row = document.createElement("div"); row.className = "ev";
      const t = document.createElement("div"); t.className = "chips"; t.style.gridColumn = "1 / 3"; t.textContent = x.text;
      const b = document.createElement("button"); b.textContent = x.label; b.addEventListener("click", x.fn);
      row.appendChild(t); row.appendChild(b); box.appendChild(row);
    });
  }
  function cancelAnswer(a) {
    const p = state.project, ai = p.ai, mem = memory();
    if (a.kind === "team" || a.kind === "ball") {
      if (D.undoOne(frames, a)) ai.frames = P.compactFrames(frames);
      else App.toast("Cette réponse n'avait modifié aucune image (personne absente ou ambiguë) : rien à rétablir.");
    }
    if (a.kind === "event" && a.verdict === "oui") {
      const before = p.events.length;
      p.events = p.events.filter((e) => !(e.auto && e.type === a.type && Math.abs(e.t - a.t) < 2.5 && /confirmé par vous/.test(e.note || "")));
      if (p.events.length === before) App.toast("L'événement ajouté n'a pas été retrouvé (sa note a peut-être été modifiée) : supprime-le à la main dans la liste des événements.", true);
      App.renderEvents(); App.renderTimeline(); App.renderPalette();
    }
    D.removeAnswer(mem, a);
    reanalyzeSuggestions();
    // la question d'une erreur incertaine revient même si le recalcul ne la retrouve pas (elle est gardée avec la réponse)
    if (a.kind === "event" && a.event && !(ai.uncertain || []).some((u) => u.type === a.type && Math.abs(u.t - a.t) < 2)) {
      ai.uncertain = (ai.uncertain || []).concat([{ t: a.t, type: a.type, reason: a.reason || "ballon non visible", event: a.event }]);
      renderSuggestions();
    }
    refreshLive(); App.changed(true);
  }
  function restoreRejected(r) {
    D.unreject(memory(), r);
    reanalyzeSuggestions(); App.changed();
  }
  const evBusy = new Set();
  async function answerEvent(q, verdict) {
    if (evBusy.has(q.key)) return;                              // double clic : une seule réponse, un seul événement
    evBusy.add(q.key);
    try {
      const a = state.project.ai, mem = memory();
      D.answerEvent(mem, q, verdict);
      a.uncertain = (a.uncertain || []).filter((u) => !(u.type === q.type && Math.abs(u.t - q.t) < 2));
      renderSuggestions();                                      // la question disparaît tout de suite (la vignette de l'événement arrive ensuite)
      if (verdict === "oui") await acceptSuggestions([Object.assign({ sid: "q" + Date.now().toString(36) }, q.event, { note: ((q.event && q.event.note) || "") + " — confirmé par vous" })]);
      renderSuggestions(); App.changed();
    } finally { evBusy.delete(q.key); }
  }

  /* Recalcule les erreurs suggérées à partir des images déjà analysées (après un changement de réglage qui ne demande
     pas de nouvelle détection, comme le côté des bancs). */
  function reanalyzeSuggestions() {
    const a = state.project.ai;
    if (!a || !frames.length) return;
    const s = a.settings || {};
    const res = applyMemory(analyzeMatch(frames, { L: L(), W: W(), dirAt, lost: a.lost || [], span: [s.t0 || frames[0].t, s.t1 || frames[frames.length - 1].t], bench: benchSetting(), benchSeen: a.benchSeen || null, subAnswers: subAnswers() }));
    a.stats = Object.assign({}, res.stats); renderStats();
    a.suggestedEvents = res.events.filter((e) => !state.project.events.some((x) => x.type === e.type && Math.abs(x.t - e.t) < 2)).map((e, i) => Object.assign({ sid: "s" + Date.now().toString(36) + i }, e));
    a.suggested = a.suggestedEvents.length; a.uncertain = res.uncertain; a.context = res.context; a.couverture = res.couverture || null;
    updateQuality(res); renderQuality();
    renderSuggestions(); App.changed();
  }

  function renderPreview() {
    if (!lastTest) return;
    const r = refs(), res = lastTest;
    const counts = {};
    const players = res.dets.filter((d) => d.cls === 0).map((d) => {
      const feat = K.sample(res.img, [d.x1, d.y1, d.x2, d.y2]);
      K.addAccents(feat, res.img, [d.x1, d.y1, d.x2, d.y2], r);
      const cls = K.classify(feat, r, { reject: tol() });
      counts[cls.team] = (counts[cls.team] || 0) + 1;
      return { id: null, team: cls.team, b: [Math.round((d.x1 / res.width) * 1000), Math.round((d.y1 / res.height) * 1000), Math.round((d.x2 / res.width) * 1000), Math.round((d.y2 / res.height) * 1000)] };
    });
    preview = { t: video.currentTime, players, ball: null };
    const names = { A: "Mon équipe", B: "Adversaire", GKA: "Mon gardien", GKB: "Gardien adverse", REF: "Arbitre", UNK: "Non reconnus" };
    $("ai-test-msg").textContent = players.length ? Object.keys(counts).map((k) => names[k] + " : " + counts[k]).join(" · ") + " — ajustez la tolérance si besoin." : "Aucun joueur détecté sur cette image.";
    $("ov-boxes").checked = true;
    drawOverlay();
  }

  async function testRecognition() {
    if (!App.isVideoReady()) { App.toast("Chargez d'abord une vidéo.", true); return; }
    if (!api) { App.toast("Fonction disponible dans l'application uniquement.", true); return; }
    const r = refs();
    if (!r.A && !r.B) { $("ai-test-msg").textContent = "Choisissez d'abord au moins « Mon équipe » (pipette ou auto)."; return; }
    video.pause();
    $("ai-test-msg").textContent = "Détection en cours…";
    try {
      lastTest = await P.detectAt(video, api, Number($("ai-tiles").value));
      renderPreview();
    } catch (e) { $("ai-test-msg").textContent = "Détection impossible : " + e.message; }
  }

  /* ---------- analyse ---------- */
  function readRange() {
    const t0 = App.parseTime($("ai-t0").value), t1 = App.parseTime($("ai-t1").value);
    if (t0 == null || t1 == null || t1 <= t0) return null;
    return [t0, t1];
  }

  let engineKind = "cpu";        // moteur du détecteur (« dml » = carte graphique) : l'estimation de durée en dépend
  let engineBlocked = false;     // détecteur indisponible : le bouton d'analyse reste désactivé
  /* Correction apprise sur cet ordinateur (durée réelle / durée prévue), une par moteur. */
  const factorKey = () => "fsal.estFactor." + engineKind;
  function estFactor() {
    try { const v = Number(localStorage.getItem(factorKey())); return v >= P.FACTOR_MIN && v <= P.FACTOR_MAX ? v : 1; } catch (_e) { return 1; }
  }
  /* p : réglages de l'analyse { fps, tiles, camera } ; par défaut ceux affichés. */
  function estimate(range, withFactor, p) {
    p = p || (isV2() ? { fps: 3, tiles: 3, camera: $("ai-camera").value } : { fps: Number($("ai-fps").value), tiles: Number($("ai-tiles").value), camera: $("ai-camera").value });
    return P.estimateDuration({ t0: range[0], t1: range[1], fps: p.fps, tiles: p.tiles, camera: p.camera,
      calibrations: ai().calibrations, kind: engineKind, factor: withFactor ? estFactor() : 1 });
  }
  function learnDuration(range, p, realSeconds) {
    const plan = estimate(range, false, p);
    if (plan.images < 20 || !(plan.seconds > 0)) return;   // trop court pour être représentatif
    try { localStorage.setItem(factorKey(), String(P.learnFactor(estFactor(), plan.seconds, realSeconds))); } catch (_e) { /* stockage indisponible */ }
  }
  const CONT_FACTOR = 2.7;
  function updateEstimate() {
    const r = readRange(), e = $("ai-est");
    if (!r) { e.textContent = ""; return; }
    const est = estimate(r, true), cont = isV2() && $("ai-v2-cont").checked;
    if (cont) est.seconds *= CONT_FACTOR;      // mesuré : 534 s contre 199 s sur la même vidéo (voir la PR de l'analyse continue)
    e.textContent = (isV2() ? "Analyse v2 (bêta). " : "") + "Durée estimée : environ " + fmtEta(est.seconds) + " (" + est.images + " images, calcul sur " + (engineKind === "dml" ? "la carte graphique" : "le processeur") + "). Pour un match entier, analysez d'abord un extrait ou choisissez « Rapide ».";
  }

  function fmtEta(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s"; }

  async function runAnalysis(opts) {
    const a = ai(), msg = $("ai-run-msg");
    let okRun = false;
    if (running) return false;
    if (!App.isVideoReady()) { msg.textContent = "Chargez d'abord une vidéo."; return false; }
    if (!a.calibrations.length) { msg.textContent = "Calibrez d'abord le terrain (étape 1)."; return false; }
    const r = refs();
    if (!r.A || !r.B) { msg.textContent = "Choisissez au moins « Mon équipe » et « Adversaire » (étape 2)."; return false; }
    const range = readRange();
    if (!range) { msg.textContent = "Plage de temps invalide."; return false; }
    if (frames.length && !(opts && opts.noConfirm) && !confirm("Une analyse existe déjà : la remplacer ?")) return false;
    const v2 = isV2(), fps = v2 ? 3 : Number($("ai-fps").value), tiles = v2 ? 3 : Number($("ai-tiles").value);      // v2 : 3 images/s, zoom automatique
    running = true; abort = new AbortController(); live = null;
    if (suiviRun) { suiviRun.ctrl.abort(); suiviRun = null; suiviMsg("Suivi de la caméra interrompu : l'analyse complète suit la caméra elle-même."); }       // pas deux lectures de la vidéo en même temps
    const startedAt = Date.now();
    $("ai-run").disabled = true; $("ai-run").title = "Une analyse est en cours : utilisez « Annuler » pour l'arrêter."; $("ai-device").disabled = true; $("ai-device").title = "Le calcul ne peut pas être changé pendant une analyse."; $("ai-cancel").hidden = false; $("ai-progress").hidden = false; $("ai-bar").style.width = "0%";
    msg.textContent = "Chargement du modèle de détection…";
    try {
      const camera = $("ai-camera").value;
      const continuous = !!(opts && opts.continuous) || (v2 && $("ai-v2-cont").checked);        // analyse continue : chaque image de la vidéo (voir pipeline.js)
      const result = await (continuous ? P.analyseVideoContinuous : P.analyseVideo)({
        url: App.getVideoUrl(), t0: range[0], t1: range[1], fps, tiles, camera, tol: tol(), L: L(), W: W(), calibrations: a.calibrations, suivi: suiviValide(a) && ((a.camSuivi && a.camSuivi.lignes) || $("ai-reuse").checked) ? suiviFr : null, bancsDecisions: a.bancsDecisions || [], fiches: (a.bancs && a.bancs.fiches) || [], refs: r, floorMarks: floorMarks(), benchZones: a.benchZones || [], benchFollow: memory().benchFollow !== false, dirAt, signal: abort.signal, api, ballMargin: (opts && opts.extra && opts.extra.ballMargin) || (v2 ? 6 : undefined), fullRes: !!(opts && opts.extra && opts.extra.fullRes) || v2,
        onProgress: (p) => {
          $("ai-bar").style.width = Math.round((p.done / p.total) * 100) + "%";
          msg.textContent = "Image " + p.done + " / " + p.total + " — reste environ " + fmtEta(p.eta) + (p.lost ? " (caméra perdue sur cette image)" : "");
          if (FSAI.hooks.progress) FSAI.hooks.progress(p.done / p.total, msg.textContent);
          if (p.frame && p.done % 3 === 0) { live = p.frame; drawMinimap(); }
        }
      });
      live = null; preview = null;
      const out = result.frames;
      frames = out;
      a.doubts = result.doubts || [];
      qGroup = null; qThumbs.clear();                    // les numéros de pistes d'une nouvelle analyse n'ont rien à voir avec les anciens
      D.applyAnswers(frames, memory().answers);
      a.bancs = result.bancs || null; renderBancs();
      a.camera = camera; a.lost = result.lost; a.notes = result.notes; a.derive = result.derive || []; a.recalage = result.recalage || [];
      a.trace = result.trace ? P.compactFrames(result.trace) : null; a.continuous = result.continuous || null;        // trajectoires continues (~10 images/s) et preuve de la lecture (images dupliquées / sautées)
      a.frames = P.compactFrames(frames);
      a.benchSeen = result.bench || null;
      const res = applyMemory(analyzeMatch(frames, { L: L(), W: W(), dirAt, lost: result.lost, span: range, bench: benchSetting(), benchSeen: a.benchSeen, subAnswers: subAnswers() }));
      a.stats = Object.assign({}, res.stats);
      a.suggestedEvents = res.events.map((e, i) => Object.assign({ sid: "s" + Date.now().toString(36) + i }, e));
      a.suggested = a.suggestedEvents.length;
      a.uncertain = res.uncertain; a.couverture = res.couverture || null;
      a.context = res.context;
      a.settings = { fps: continuous ? 3.33 : fps, tiles, t0: range[0], t1: range[1], tol: tol(), floorMarks: floorMarks(), reuseSuivi: $("ai-reuse").checked, bench: benchSetting(), continuous, v2 };
      const lostTxt = result.lost.length ? " Caméra perdue : " + result.lost.map((l) => App.fmt(l[0]) + "–" + App.fmt(l[1])).join(", ") + "." : "";
      updateQuality(res);
      if (out.length && Q && Q.unusable(a.quality)) {
        // jamais « 0 erreur » en gros quand presque rien n'a été analysé : on dit que l'analyse est inutilisable
        msg.textContent = "⛔ Analyse inutilisable : seulement " + Math.round(res.context.reliable.ratio * 100) + " % du temps a pu être analysé de façon fiable. Aucune conclusion sur les erreurs n'est possible (« 0 erreur » ne veut pas dire « aucune erreur »)." + lostTxt + recalageHint(a);
      } else msg.textContent = (out.length ? "Analyse terminée : " + out.length + " images, " + a.suggestedEvents.length + " erreur(s) suggérée(s)" + (res.uncertain.length ? ", " + res.uncertain.length + " non signalée(s) (contexte incertain)" : "") + ". Temps de jeu analysé de façon fiable : " + Math.round(res.context.reliable.ratio * 100) + " %." : "Analyse terminée, mais aucun joueur n'a été retenu : vérifiez le calibrage et les tenues.") + (result.notes.length ? " " + result.notes.join(" ") : "") + lostTxt;
      if (out.length && !continuous) learnDuration(range, { fps, tiles, camera }, (Date.now() - startedAt) / 1000);
      renderStats(); renderSuggestions(); refreshLive(); updateEstimate(); App.changed(true);
      okRun = out.length > 0;
    } catch (e) {
      live = null;
      msg.textContent = "Analyse arrêtée : " + e.message;
    } finally {
      running = false; abort = null;
      $("ai-run").disabled = engineBlocked; $("ai-run").title = engineBlocked ? "Le détecteur n'est pas prêt : voir le message d'état en haut du panneau." : ""; $("ai-device").disabled = false; $("ai-device").title = ""; $("ai-cancel").hidden = true;
      setTimeout(() => { $("ai-progress").hidden = true; }, 600);
      if (api && api.aiStop) { /* le détecteur reste chargé pour la prochaine analyse */ }
      if (api && api.aiStatus) refreshEngine();   // la carte graphique a pu céder la place au processeur en cours de route
      if (FSAI.hooks.finished) FSAI.hooks.finished(okRun, msg.textContent);
    }
    return okRun;
  }

  /* ---------- moteur de calcul ---------- */
  const ENGINE_WHY = {
    choix: " (réglage « Processeur uniquement »)",
    "plus-rapide": " (la carte graphique n'est pas plus rapide sur cet ordinateur)",
    indisponible: " (aucune carte graphique utilisable)",
    "echec-precedent": " (la carte graphique a posé problème lors d'un essai précédent)",
    "erreur-gpu": " (la carte graphique a cessé de répondre ; l'analyse continue normalement)"
  };
  function engineText(s) {
    const b = s.backend;
    if (b && b.kind === "dml") {
      const gain = b.cpuMs && b.ms ? Math.round(b.cpuMs / b.ms) : 0;
      return "Détecteur prêt : calcul sur la carte graphique" + (b.model === "precis" ? " avec le modèle précis" : "") + (gain >= 2 ? " (environ " + gain + " fois plus rapide que le processeur)" : "") + ".";
    }
    return "Détecteur prêt : calcul sur le processeur, " + s.cpus + " cœurs" + ((b && ENGINE_WHY[b.reason]) || "") + ".";
  }
  function refreshEngine() {
    const e = $("ai-status");
    if (!e.textContent) e.textContent = "Préparation du détecteur… (au premier lancement, la carte graphique est testée : jusqu'à une minute)";
    return api.aiStatus().then((s) => {
      if (s.device) $("ai-device").value = s.device;
      if (!s.modelPresent) { e.className = "ai-status bad"; e.textContent = "Modèle de détection introuvable : l'analyse IA est indisponible. Réinstallez l'application."; engineBlocked = true; $("ai-run").disabled = true; $("ai-run").title = "Le détecteur n'est pas disponible : lisez le message d'état en haut du panneau."; }
      else if (s.engineError) { e.className = "ai-status bad"; e.textContent = "Le détecteur n'a pas pu démarrer : " + s.engineError + " (sous Windows, installez « Microsoft Visual C++ Redistributable 2015-2022 » puis relancez)."; engineBlocked = true; $("ai-run").disabled = true; $("ai-run").title = "Le détecteur n'est pas disponible : lisez le message d'état en haut du panneau."; }
      else {
        engineKind = s.backend && s.backend.kind === "dml" ? "dml" : "cpu";
        e.className = "ai-status"; e.textContent = engineText(s) + " Fonctionne hors ligne : la vidéo ne quitte pas votre ordinateur.";
        if (engineBlocked) { engineBlocked = false; $("ai-run").disabled = running; $("ai-run").title = running ? "Une analyse est en cours : utilisez « Annuler » pour l'arrêter." : ""; }
        updateEstimate();
      }
    }).catch(() => {});
  }

  /* ---------- liaison ---------- */
  function syncFromProject() {
    const a = state.project.ai;
    frames = a && a.frames ? P.expandFrames(a.frames) : [];
    live = null; pts = []; placing = null; pickRole = null;
    const d = a || { L: 40, W: 20, dir: 1, flip: true, settings: { fps: 3, tiles: 1, t0: 0, t1: 0 } };
    $("ai-L").value = d.L; $("ai-W").value = d.W; $("ai-dir").value = String(d.dir || 1); $("ai-flip").checked = d.flip !== false;
    $("ai-fps").value = String((d.settings && d.settings.fps) || 3); $("ai-tiles").value = String((d.settings && d.settings.tiles) || 1);
    $("ai-camera").value = d.camera || "mobile"; $("ai-tol").value = String((d.settings && d.settings.tol) || 42); $("ai-tol-v").textContent = "(" + $("ai-tol").value + ")";
    pip = null; preview = null; lastTest = null; renderPipette(); $("ai-test-msg").textContent = "";
    $("ai-v2").checked = !!d.v2; $("ai-v2-cont").checked = !!(d.settings && d.settings.continuous && d.v2); $("ai-v2-box").hidden = !d.v2;
    $("ai-marks").checked = !(d.settings && d.settings.floorMarks === false);
    $("ai-reuse").checked = !!(d.settings && d.settings.reuseSuivi);
    $("ai-bench").value = (d.settings && ["left", "right"].includes(d.settings.bench)) ? d.settings.bench : "auto";
    if (a && !a.bancs && frames.length && BCH && frames.some((q) => q.bn)) { try { a.bancs = bancsFrom(a); } catch (_e) { /* projet sans lectures de bancs */ } }
    benchMark = null; renderBenchZones(); renderBancs();
    qGroup = null; qHighlight = null; qThumbs.clear(); contours.clear(); bs = null; bsBox(false);
    $("ai-t0").value = App.fmt((d.settings && d.settings.t0) || 0);
    $("ai-t1").value = App.fmt((d.settings && d.settings.t1) || state.project.duration || 0);
    chargeSuivi(); suiviMsg(a && a.camSuivi && a.camSuivi.cle ? suiviBilan(a.camSuivi) : ""); renderSuiviQ();
    fillLandmarks(); renderPoints(); renderCalibs(); renderKits(); renderStats(); renderSuggestions(); updateEstimate();
    $("ai-run-msg").textContent = ""; $("ai-calib-msg").textContent = "";
    planSuivi(2500);
    updateOverlayMode(); drawMinimap();
  }

  function bindSettings() {
    const upd = () => {
      const a = ai();
      const l = Number($("ai-L").value), w = Number($("ai-W").value);
      if (l >= 25 && l <= 42) a.L = l;
      if (w >= 15 && w <= 25) a.W = w;
      a.dir = Number($("ai-dir").value); a.flip = $("ai-flip").checked; a.camera = $("ai-camera").value;
      a.settings = Object.assign({}, a.settings, { fps: Number($("ai-fps").value), tiles: Number($("ai-tiles").value), tol: tol(), floorMarks: floorMarks(), reuseSuivi: $("ai-reuse").checked, bench: benchSetting() });
      fillLandmarks(); App.changed();
    };
    ["ai-L", "ai-W", "ai-dir", "ai-flip", "ai-fps", "ai-tiles", "ai-camera", "ai-marks", "ai-reuse"].forEach((id) => $(id).addEventListener("change", upd));
    $("ai-bench").addEventListener("change", () => { upd(); reanalyzeSuggestions(); });
    $("ai-bench-mark").addEventListener("click", () => { const h = $("ai-bench-go"); if (h) h.hidden = true; const ok = startBenchMark(); if (!ok && h) offreBanc(h); else if (ok) App.toast("Cliquez deux coins opposés autour du banc, sur la vidéo."); });
    $("ai-bl-export").addEventListener("click", exportBallLabels);
    bindZoom();
    $("ai-v2").addEventListener("change", () => {
      const a = ai(); a.v2 = $("ai-v2").checked; $("ai-v2-box").hidden = !a.v2;
      if (!a.v2) a.couverture = null;
      updateEstimate();
      if (frames.length) reanalyzeSuggestions(); else renderSuggestions();
      App.changed();
    });
    $("ai-v2-cont").addEventListener("change", () => { updateEstimate(); });
    $("ai-bs-start").addEventListener("click", () => startBallSession(false));
    if ($("ai-bs-start-all")) $("ai-bs-start-all").addEventListener("click", () => startBallSession(true));
    $("ai-bs-unsure").addEventListener("click", bsUnsure);
    $("ai-bs-ok").addEventListener("click", bsOk); $("ai-bs-none").addEventListener("click", bsNone);
    $("ai-bs-skip").addEventListener("click", () => bsMove(1)); $("ai-bs-prev").addEventListener("click", () => bsMove(-1));
    $("ai-bs-stop").addEventListener("click", () => bsEnd());
    // raccourcis pendant une session : Entrée = oui, N = aucun ballon, S = passer (jamais pendant une saisie de texte)
    document.addEventListener("keydown", (e) => {
      if (!bs || e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target && e.target.tagName;
      if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT" || (e.target && e.target.isContentEditable)) return;
      if (e.key === "Enter") { e.preventDefault(); bsOk(); }
      else if (e.key === "n" || e.key === "N") { e.preventDefault(); bsNone(); }
      else if (e.key === "?") { e.preventDefault(); bsUnsure(); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); bsMove(1); }
    });
    $("ai-bench-clear").addEventListener("click", () => { const a = ai(); a.benchZones = []; renderBenchZones(); drawOverlay(); App.changed(); });
    $("ai-camera").addEventListener("change", updateEstimate);
    $("ai-tol").addEventListener("input", () => { $("ai-tol-v").textContent = "(" + tol() + ")"; if (lastTest) renderPreview(); });
    $("ai-tol").addEventListener("change", upd);
    $("ai-test").addEventListener("click", testRecognition);
    $("pp-cancel").addEventListener("click", cancelPipette);
    $("pp-skip").addEventListener("click", () => { if (pip) nextPart(); });
    $("pp-done").addEventListener("click", finishPipette);
    $("ai-pipette").querySelectorAll("button[data-part]").forEach((b) => b.addEventListener("click", () => { if (pip) { pip.part = b.dataset.part; renderPipette(); drawOverlay(); } }));
    ["ai-t0", "ai-t1", "ai-fps", "ai-tiles"].forEach((id) => $(id).addEventListener("input", updateEstimate));
    $("ai-t0").addEventListener("change", updateEstimate); $("ai-t1").addEventListener("change", updateEstimate);
    ["ov-boxes", "ov-ids", "ov-trails", "ov-heat", "ov-court"].forEach((id) => $(id).addEventListener("change", refreshLive));
  }

  function init() {
    // volets
    document.querySelectorAll("#seg button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#seg button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + b.dataset.pane));
    }));
    $("ai-place").addEventListener("click", startPlacing);
    $("ai-validate").addEventListener("click", validateCalibration);
    $("ai-run").addEventListener("click", runAnalysis);
    $("ai-cancel").addEventListener("click", () => { if (abort) abort.abort(); });
    $("ai-accept-all").addEventListener("click", () => {
      const a = state.project.ai; if (!a || !a.suggestedEvents.length) { App.toast("Aucune erreur suggérée à accepter pour le moment."); return; }
      acceptSuggestions(a.suggestedEvents.slice());
    });
    $("ai-clear-sugg").addEventListener("click", () => { const a = state.project.ai; if (!a) return; if (!a.suggestedEvents.length) { App.toast("Aucune erreur suggérée à écarter pour le moment."); return; } a.suggestedEvents.forEach((e) => D.reject(memory(), e)); a.suggestedEvents = []; a.suggested = 0; renderSuggestions(); App.changed(); });
    const inVideo = (e) => { const [ix, iy] = toVideo(e.offsetX, e.offsetY); return { ix, iy, ok: ix >= 0 && iy >= 0 && ix <= video.videoWidth && iy <= video.videoHeight }; };
    ["down", "move", "up"].forEach((n) => $("overlay").addEventListener("pointer" + n, (e) => {
      if (!pointer || !pointer[n]) return;
      const q = inVideo(e);
      pointer[n](q.ix, q.iy, q.ok, e);
    }));
    $("overlay").addEventListener("mousemove", (e) => { if (placing) drawLoupe(e.offsetX, e.offsetY); });
    $("overlay").addEventListener("mouseleave", () => { $("loupe").hidden = true; });
    document.addEventListener("keydown", (e) => {
      if (!selPt || placing || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      const tg = e.target; if (tg && /^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName)) return;
      const p = pts.find((q) => q.id === selPt); if (!p) return;
      const st = e.shiftKey ? 2 : 0.5;
      p.ix += e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0; p.iy += e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0;
      e.preventDefault(); renderPoints(); refreshLive(); drawOverlay();
    });
    $("overlay").addEventListener("click", (e) => {
      const [ix, iy] = toVideo(e.offsetX, e.offsetY);
      if (benchMark) { if (ix >= 0 && iy >= 0 && ix <= video.videoWidth && iy <= video.videoHeight) benchClick(ix, iy); return; }
      if (pointer && pointer.click) { pointer.click(ix, iy, ix >= 0 && iy >= 0 && ix <= video.videoWidth && iy <= video.videoHeight, e); return; }
      if (ix < 0 || iy < 0 || ix > video.videoWidth || iy > video.videoHeight) return;
      if (benchMark) { benchClick(ix, iy); return; }
      if (placing) {
        const lm = HG.landmarks(L(), W()).find((l) => l.id === placing);
        const sn = snapAt(ix, iy);
        pts = pts.filter((p) => p.id !== placing).concat([sn ? { id: placing, label: lm.label, ix: sn.x, iy: sn.y, snap: Math.hypot(sn.dx, sn.dy) } : { id: placing, label: lm.label, ix, iy }]);
        selPt = placing;
        $("loupe").hidden = true;
        const order = HG.landmarks(L(), W()).map((l) => l.id);
        const next = order.find((id) => !pts.some((p) => p.id === id));
        const placedId = placing;
        placing = null; renderPoints();
        if (next) $("ai-landmark").value = next;
        updateOverlayMode();
        if (FSAI.hooks.pointPlaced) FSAI.hooks.pointPlaced(placedId);
      } else if (pip) pipetteClick(ix, iy);
      else if (pickRole) handlePick(ix, iy);
      else personClick(e, ix, iy);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
    document.addEventListener("mousedown", (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && linePick) { stopLinePick(); return; } if (e.key === "Escape" && benchMark) { benchMark = null; updateOverlayMode(); return; } if (e.key === "Escape" && (placing || pickRole || pip)) { if (more) { cancelMore(true); return; } placing = null; pickRole = null; if (pip) cancelPipette(); else updateOverlayMode(); } });
    ["loadedmetadata", "seeked", "pause", "timeupdate", "emptied"].forEach((ev) => video.addEventListener(ev, () => {
      if (ev === "emptied") { setZoom({ k: 1, tx: 0, ty: 0 }); contours.clear(); if (shadow) { shadow.removeAttribute("src"); shadow.load(); shadow = null; shadowUrl = ""; } }
      if (preview && ev === "seeked" && lastTest && Math.abs(video.currentTime - preview.t) > 0.2) { preview = null; lastTest = null; $("ai-test-msg").textContent = ""; }
      if (ev === "loadedmetadata" || ev === "emptied") updateOverlayMode(); else refreshLive();
    }));
    ["loadedmetadata", "emptied", "error"].forEach((ev) => video.addEventListener(ev, () => setTimeout(renderNext, 0)));
    video.addEventListener("play", () => { preview = null; lastTest = null; $("ai-test-msg").textContent = ""; });
    video.addEventListener("play", () => { if (!raf) raf = requestAnimationFrame(loop); });
    window.addEventListener("resize", refreshLive);
    if (window.ResizeObserver) new ResizeObserver(refreshLive).observe($("video-box"));
    App.hooks.onLoad = syncFromProject;
    bindSettings();
    fillLandmarks(); renderCalibs(); renderKits(); renderStats(); renderSuggestions();
    $("ai-calib-go").addEventListener("click", () => {
      const t = Number($("ai-calib-go").dataset.t);
      if (isFinite(t)) App.seek(t);
      $("ai-d1").open = true; $("ai-d1").scrollIntoView({ block: "nearest" });
      App.toast("Placez les repères du terrain sur cette image, puis « Valider le calibrage ».");
    });
    $("ai-camera").addEventListener("change", () => planSuivi(500));
    video.addEventListener("loadedmetadata", () => {
      planSuivi(1500);
      const a = state.project.ai;
      if (!a || !a.settings || !a.settings.t1) {
        $("ai-t1").value = App.fmt(video.duration);
        if (video.videoHeight > video.videoWidth) { $("ai-tiles").value = "2"; $("ai-run-msg").textContent = "Vidéo verticale : précision « Renforcée » sélectionnée pour mieux voir les joueurs lointains."; }
      }
      updateEstimate();
    });
    if (api && api.aiStatus) {
      refreshEngine();
      $("ai-device").addEventListener("change", async () => {
        const sel = $("ai-device");
        if (running || !api.aiSetDevice) return;
        sel.disabled = true;
        const e = $("ai-status");
        e.className = "ai-status"; e.textContent = "Changement du moteur de calcul…";
        try { const r = await api.aiSetDevice(sel.value); if (r && r.error) $("ai-run-msg").textContent = r.error; } catch (_e) { /* l'état ci-dessous indique le moteur réel */ }
        await refreshEngine();
        sel.disabled = running;
      });
    } else { $("ai-status").textContent = "L'analyse IA est disponible dans l'application installée."; $("ai-device").disabled = true; }
    syncFromProject();
  }

  /* Image de la vidéo à l'instant courant, dont le plus grand côté vaut 1024 px (taille attendue par le modèle de découpe). */
  function grabSam() {
    const vw = video.videoWidth, vh = video.videoHeight, k = 1024 / Math.max(vw, vh);
    const w = Math.max(2, Math.round(vw * k)), h = Math.max(2, Math.round(vh * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    return { canvas: c, img: ctx.getImageData(0, 0, w, h), w, h, k, t: video.currentTime, id: "f" + Date.now().toString(36) };
  }

  /* Mémoire du projet : ce que le coach a montré ou répondu (couleurs de but apprises, erreurs écartées, réponses aux questions).
     Elle vit dans le projet seulement ; rien n'est réutilisé d'un autre projet. */
  function memory() {
    const a = ai();
    if (!a.memory) a.memory = { goalPalettes: [], rejected: [], answers: [] };
    ["goalPalettes", "rejected", "answers"].forEach((k) => { if (!Array.isArray(a.memory[k])) a.memory[k] = []; });
    return a.memory;
  }

  const FSAI = window.FSAI = {
    hooks: {}, segmentImpl: null, reanalyze: () => reanalyzeSuggestions(),
    ai, memory, refs, kitWarnings, examplesPanel, benchMarkable, quality: () => (state.project.ai ? state.project.ai.quality : null), grabSam, renderKits, renderStats, renderCalibs, renderPoints, validateCalibration, runAnalysis, updateEstimate,
    addLayer: (fn) => { layers.push(fn); }, setPointer: (p) => { pointer = p; updateOverlayMode(); }, redraw: refreshLive,
    beginPlacing: (id) => { if (!App.isVideoReady()) return false; video.pause(); pickRole = null; pip = null; renderPipette(); placing = id; $("ai-landmark").value = id; updateOverlayMode(); return true; },
    cancelPlacing: () => { placing = null; updateOverlayMode(); },
    getPoints: () => pts.slice(), clearPoints: () => { pts = []; placing = null; renderPoints(); updateOverlayMode(); },
    removePoint: (id) => { pts = pts.filter((q) => q.id !== id); renderPoints(); refreshLive(); },
    clearAnalysis: () => { frames = []; const a = ai(); a.frames = null; a.bancs = null; renderBancs(); a.stats = null; a.suggestedEvents = []; a.uncertain = []; a.context = null; a.couverture = null; a.suggested = 0; renderStats(); renderSuggestions(); refreshLive(); },
    setRange: (t0, t1) => { $("ai-t0").value = App.fmt(t0); $("ai-t1").value = App.fmt(t1); updateEstimate(); },
    setCamera: (v) => { $("ai-camera").value = v; $("ai-camera").dispatchEvent(new Event("change")); },
    setLineColor: (key) => { const a = ai(); if (a && window.FutsalCourtFit && window.FutsalCourtFit.COLORS[key]) { a.lineColor = key; a.lineProfile = null; renderSuiviQ(); App.changed(); } },
    setDirection: (v) => { $("ai-dir").value = String(v); $("ai-dir").dispatchEvent(new Event("change")); },
    setPrecision: (fps, tiles) => { $("ai-fps").value = String(fps); $("ai-tiles").value = String(tiles); $("ai-fps").dispatchEvent(new Event("change")); },
    hasAnalysis: () => frames.length > 0,
    /* Enregistre le calibrage trouvé par l'assistant (remplace les précédents). */
    setCalibration: (cal, t) => {
      const a = ai();
      a.calibrations = [{ t: Math.round(t * 10) / 10, points: cal.points, H: cal.H, err: cal.err }];
      if (Array.isArray(cal.choisis) && cal.choisis.length) a.calibrations[0].choisis = cal.choisis.slice();
      pts = []; placing = null;
      $("ov-court").checked = true;
      renderPoints(); renderCalibs(); updateOverlayMode(); App.changed();
    },
    videoSize: () => ({ w: video.videoWidth, h: video.videoHeight }),
    segment: (req) => (FSAI.segmentImpl ? FSAI.segmentImpl(req) : api.aiSegment(req)),
    detectPersons: async (canvas) => (await P.detectCanvas(canvas, 2, api, { minPerson: 0.3, minBall: 0.12 })).filter((d) => d.cls === 0),
    toggle: (id, on) => { const e = $(id); if (e) { e.checked = on; refreshLive(); } }
  };

  window.FSApp.ai = { syncFromProject, dirAt, refreshLive, getFrames: () => frames };
  init();
})();
