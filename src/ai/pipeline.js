/* Chaîne d'analyse vidéo : découpage en vignettes, fusion des détections, projection sur le terrain,
   reconnaissance des équipes, suivi, et lecture de la vidéo image par image (navigateur). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./yolox"), require("./homography"), require("./kit"), require("./tracker"), require("./camera"));
  } else {
    root.FutsalPipeline = factory(root.FutsalYolox, root.FutsalHomography, root.FutsalKit, root.FutsalTracker, root.FutsalCamera);
  }
})(typeof self !== "undefined" ? self : this, function (Y, HG, K, T, Cam) {
  "use strict";

  const TEAM_CODE = { A: "A", B: "B", GKA: "a", GKB: "b" };
  const CODE_TEAM = { A: "A", B: "B", a: "GKA", b: "GKB" };

  /* Rectangles de détection : 1 = image entière ; 2 = deux moitiés qui se recouvrent (joueurs lointains plus nets). */
  function tileRects(w, h, mode) {
    if (mode !== 2) return [{ x: 0, y: 0, w, h }];
    if (w >= h) {
      const tw = Math.round(w * 0.6);
      return [{ x: 0, y: 0, w: tw, h }, { x: w - tw, y: 0, w: tw, h }];
    }
    const th = Math.round(h * 0.6);
    return [{ x: 0, y: 0, w, h: th }, { x: 0, y: h - th, w, h: th }];
  }

  /* Boîtes d'une vignette (espace 640x640 « letterbox ») -> espace de l'image.
     Une boîte collée à une limite intérieure de la vignette (pas au bord de l'image) est marquée « coupée » :
     le joueur y est partiel, il est ignoré s'il est déjà vu en entier ailleurs. */
  function tileToFrame(dets, rect, frameW, frameH) {
    const r = Y.letterboxRatio(rect.w, rect.h, Y.SIZE), eps = 6 / r;
    return dets.map((d) => {
      const o = { cls: d.cls, score: d.score, x1: d.x1 / r + rect.x, y1: d.y1 / r + rect.y, x2: d.x2 / r + rect.x, y2: d.y2 / r + rect.y };
      if (frameW != null) {
        o.cut = (rect.x > 0 && o.x1 <= rect.x + eps) || (rect.x + rect.w < frameW && o.x2 >= rect.x + rect.w - eps) ||
          (rect.y > 0 && o.y1 <= rect.y + eps) || (rect.y + rect.h < frameH && o.y2 >= rect.y + rect.h - eps);
      }
      return o;
    });
  }

  function overlapShare(a, b) {
    const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / Math.max(1, (a.x2 - a.x1) * (a.y2 - a.y1));
  }

  function mergeTiles(perTile, frameW, frameH) {
    const all = [];
    perTile.forEach((t) => tileToFrame(t.dets, t.rect, frameW, frameH).forEach((d) => all.push(d)));
    // 1) un joueur partiel (coupé par une limite de vignette) disparaît s'il est contenu dans une autre boîte
    const whole = all.filter((d) => !(d.cut && d.cls === Y.CLASS_PERSON && all.some((e) => e !== d && e.cls === Y.CLASS_PERSON && e.score >= 0.3 && overlapShare(d, e) >= 0.6 && (e.x2 - e.x1) * (e.y2 - e.y1) >= (d.x2 - d.x1) * (d.y2 - d.y1))));
    // 2) suppression des doublons classiques
    return Y.nms(whole, 0.5).map((d) => { const o = Object.assign({}, d); delete o.cut; return o; });
  }

  /* Étalonnage en vigueur à l'instant t (le plus récent déjà posé, sinon le premier). */
  function calibrationAt(calibs, t) {
    if (!calibs || !calibs.length) return null;
    const sorted = calibs.slice().sort((a, b) => a.t - b.t);
    let cur = sorted[0];
    sorted.forEach((c) => { if (c.t <= t) cur = c; });
    return cur;
  }

  /* Détections d'une image -> joueurs sur le terrain + ballon.
     ctx : { frameW, frameH, scale (px analysés / px vidéo), img ({data,width,height}), H, L, W, refs, tracker, t } */
  function processDetections(dets, ctx) {
    const persons = [], balls = [];
    dets.forEach((d) => {
      const w = d.x2 - d.x1, h = d.y2 - d.y1;
      if (d.cls === Y.CLASS_PERSON) {
        if (h < ctx.frameH * 0.035 || w < ctx.frameW * 0.008) return;
        const ar = h / Math.max(1, w);
        if (ar < 0.8 || ar > 6) return;
        persons.push(d);
      } else if (d.cls === Y.CLASS_BALL) {
        // un vrai ballon est à peu près carré, petit, et détecté avec une confiance suffisante (évite les marquages au sol)
        const ar = w / Math.max(1, h);
        if (d.score >= 0.2 && ar >= 0.5 && ar <= 2 && h >= ctx.frameH * 0.004 && h <= ctx.frameH * 0.06) balls.push(d);
      }
    });
    const margin = 1.5;
    const list = [];
    persons.forEach((d) => {
      const fx = (d.x1 + d.x2) / 2 / ctx.scale, fy = d.y2 / ctx.scale;
      const p = HG.apply(ctx.H, fx, fy);
      if (!isFinite(p[0]) || !isFinite(p[1])) return;
      if (p[0] < -margin || p[0] > ctx.L + margin || p[1] < -margin || p[1] > ctx.W + margin) return;
      const feat = ctx.img ? K.sample(ctx.img, [d.x1, d.y1, d.x2, d.y2]) : null;
      if (feat && ctx.refs) K.addAccents(feat, ctx.img, [d.x1, d.y1, d.x2, d.y2], ctx.refs);
      const cls = ctx.refs ? K.classify(feat, ctx.refs, { reject: ctx.reject }) : { team: "UNK" };
      list.push({ x: Math.round(p[0] * 100) / 100, y: Math.round(p[1] * 100) / 100, team: cls.team, box: [d.x1, d.y1, d.x2, d.y2], conf: d.score });
    });
    ctx.tracker.update(ctx.t, list);
    let ball = null;
    balls.sort((a, b) => b.score - a.score).some((d) => {
      const p = HG.apply(ctx.H, ((d.x1 + d.x2) / 2) / ctx.scale, ((d.y1 + d.y2) / 2) / ctx.scale);
      if (!isFinite(p[0]) || !isFinite(p[1]) || p[0] < -2 || p[0] > ctx.L + 2 || p[1] < -2 || p[1] > ctx.W + 2) return false;
      ball = { x: Math.round(p[0] * 100) / 100, y: Math.round(p[1] * 100) / 100 };
      return true;
    });
    return {
      t: ctx.t,
      players: list.map((p) => ({
        id: p.id, team: p.team, x: p.x, y: p.y,
        b: [Math.round((p.box[0] / ctx.frameW) * 1000), Math.round((p.box[1] / ctx.frameH) * 1000), Math.round((p.box[2] / ctx.frameW) * 1000), Math.round((p.box[3] / ctx.frameH) * 1000)]
      })),
      ball
    };
  }

  /* Fin d'analyse : équipe de chaque piste par vote, suppression des pistes éphémères et des joueurs non identifiés. */
  function finalizeFrames(frames) {
    const teams = T.finalTeams(frames);
    const counts = {};
    frames.forEach((f) => f.players.forEach((p) => { counts[p.id] = (counts[p.id] || 0) + 1; }));
    return frames.map((f) => ({
      t: f.t, ball: f.ball,
      players: f.players.filter((p) => counts[p.id] >= 3 && CODE_TEAM_OK(teams[p.id])).map((p) => Object.assign({}, p, { team: teams[p.id] }))
    }));
  }
  function CODE_TEAM_OK(team) { return team === "A" || team === "B" || team === "GKA" || team === "GKB"; }

  /* Stockage compact (projet / sauvegarde) et retour au format d'analyse. */
  function compactFrames(frames) {
    return frames.map((f) => [Math.round(f.t * 100) / 100, f.players.map((p) => [p.id, TEAM_CODE[p.team], p.x, p.y].concat(p.b || [])), f.ball ? [f.ball.x, f.ball.y] : null]);
  }
  function expandFrames(compact) {
    if (!Array.isArray(compact)) return [];
    return compact.map((c) => ({
      t: c[0], ball: c[2] ? { x: c[2][0], y: c[2][1] } : null,
      players: c[1].map((p) => ({ id: p[0], team: CODE_TEAM[p[1]], x: p[2], y: p[3], b: p.slice(4, 8) }))
    }));
  }

  /* Image la plus proche d'un instant (recherche dichotomique) ; null si trop éloignée. */
  function frameNear(frames, t, maxGap) {
    if (!frames.length) return null;
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < t) lo = m + 1; else hi = m; }
    let best = lo;
    if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) best = lo - 1;
    return Math.abs(frames[best].t - t) <= (maxGap == null ? 1 : maxGap) ? frames[best] : null;
  }

  /* Instants d'échantillonnage. */
  function sampleTimes(t0, t1, fps) {
    const out = [];
    const step = 1 / fps;
    for (let t = t0; t <= t1 + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
    return out;
  }

  /* ---- Lecture de la vidéo (navigateur uniquement) ---- */
  function seekTo(video, t) {
    return new Promise((resolve, reject) => {
      const done = () => { clearTimeout(to); video.removeEventListener("seeked", done); video.removeEventListener("error", fail); resolve(); };
      const fail = () => { clearTimeout(to); video.removeEventListener("seeked", done); video.removeEventListener("error", fail); reject(new Error("Lecture de la vidéo impossible")); };
      const to = setTimeout(() => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); reject(new Error("Délai dépassé pendant le positionnement dans la vidéo")); }, 15000);
      video.addEventListener("seeked", done);
      video.addEventListener("error", fail);
      video.currentTime = t;
    });
  }

  /* Détecte les personnes et le ballon sur une image déjà dessinée dans frameCanvas. */
  async function detectCanvas(frameCanvas, tilesMode, api, thresholds) {
    const w = frameCanvas.width, h = frameCanvas.height;
    const rects = tileRects(w, h, tilesMode);
    const work = document.createElement("canvas");
    work.width = Y.SIZE; work.height = Y.SIZE;
    const wctx = work.getContext("2d", { willReadFrequently: true });
    const perTile = [];
    for (const rect of rects) {
      const r = Y.letterboxRatio(rect.w, rect.h, Y.SIZE);
      wctx.fillStyle = "rgb(114,114,114)";
      wctx.fillRect(0, 0, Y.SIZE, Y.SIZE);
      wctx.drawImage(frameCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, Math.round(rect.w * r), Math.round(rect.h * r));
      const data = wctx.getImageData(0, 0, Y.SIZE, Y.SIZE).data;
      const res = await api.aiDetect(data.buffer.slice(0), thresholds || {});
      if (res.error) throw new Error(res.error);
      perTile.push({ rect, dets: res.dets });
    }
    return mergeTiles(perTile, w, h);
  }

  const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  /* Analyse complète d'une plage de la vidéo.
     opts : { url, t0, t1, fps, tiles, camera ("fixed" | "mobile"), tol, L, W, calibrations, refs, signal, onProgress, api }
     Caméra mobile : à chaque calibrage, le terrain est recalé ; entre deux calibrages, le mouvement de la caméra est suivi.
     Renvoie { frames, lost: [[t0, t1], ...], notes: [texte, ...] }. */
  async function analyseVideo(opts) {
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.crossOrigin = "anonymous";
    video.src = opts.url;
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error("Vidéo illisible")); });
    const vw = video.videoWidth, vh = video.videoHeight;
    const maxW = 1280;
    const scale = Math.min(1, maxW / Math.max(vw, vh * (16 / 9)));
    const cw = Math.max(2, Math.round(vw * scale)), ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const mobile = opts.camera === "mobile";
    const notes = [];
    const calibs = (opts.calibrations || []).slice().sort((a, b) => a.t - b.t);
    if (!calibs.length) throw new Error("Aucun calibrage du terrain");
    let t0 = opts.t0;
    if (mobile) {
      if (t0 < calibs[0].t - 0.01) { t0 = calibs[0].t; notes.push("L'analyse commence au premier calibrage (le terrain n'est pas connu avant)."); }
      else {
        const prior = calibs.filter((c) => c.t <= t0 + 0.01).pop();
        if (prior && t0 - prior.t > 1.5) { t0 = prior.t; notes.push("L'analyse commence au dernier calibrage avant la plage choisie, pour suivre la caméra sans interruption."); }
      }
    }
    const times = sampleTimes(t0, Math.min(opts.t1, video.duration - 0.05), opts.fps);
    // images réduites pour le suivi de la caméra
    const gw = Math.min(480, cw), gh = Math.max(2, Math.round((ch * gw) / cw)), gs = gw / vw;
    const gcanvas = document.createElement("canvas");
    gcanvas.width = gw; gcanvas.height = gh;
    const gctx = gcanvas.getContext("2d", { willReadFrequently: true });
    const tracker = new T.Tracker();
    const frames = [], lost = [];
    let anchor = null, M = IDENTITY, prev = null, lostStart = null;
    const started = Date.now();
    for (let i = 0; i < times.length; i++) {
      if (opts.signal && opts.signal.aborted) throw new Error("Analyse interrompue");
      const t = times[i];
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, cw, ch);
      const dets = await detectCanvas(canvas, opts.tiles, opts.api, { minPerson: 0.35, minBall: 0.12 });
      const calib = calibrationAt(calibs, t);
      let H = calib.H, reliable = true;
      if (mobile) {
        const boxes = dets.filter((d) => d.cls === Y.CLASS_PERSON).map((d) => [d.x1 * (gw / cw), d.y1 * (gh / ch), d.x2 * (gw / cw), d.y2 * (gh / ch)]);
        gctx.drawImage(video, 0, 0, gw, gh);
        const cur = Cam.prepare(gctx.getImageData(0, 0, gw, gh).data, gw, gh, boxes, 4);
        if (calib !== anchor) {
          anchor = calib; M = IDENTITY; prev = cur;
        } else {
          const r = Cam.estimateMotion(prev, cur, prev.mask, cur.mask, { maxCorners: 320 });
          if (r.ok) {
            M = HG.mul3(M, HG.invert(Cam.toNative(r.H, gs)));
            prev = cur;
          } else reliable = false;
        }
        H = HG.mul3(anchor.H, M);
      }
      if (!reliable) {
        if (lostStart == null) lostStart = t;
        if (opts.onProgress) opts.onProgress({ done: i + 1, total: times.length, eta: ((Date.now() - started) / 1000 / (i + 1)) * (times.length - i - 1), frame: null, lost: true });
        continue;
      }
      if (lostStart != null) { lost.push([lostStart, t]); lostStart = null; }
      const img = ctx.getImageData(0, 0, cw, ch);
      frames.push(processDetections(dets, { frameW: cw, frameH: ch, scale, img, H, L: opts.L, W: opts.W, refs: opts.refs, reject: opts.tol, tracker, t }));
      if (opts.onProgress) {
        const elapsed = (Date.now() - started) / 1000;
        opts.onProgress({ done: i + 1, total: times.length, eta: (elapsed / (i + 1)) * (times.length - i - 1), frame: frames[frames.length - 1] });
      }
    }
    if (lostStart != null) lost.push([lostStart, times[times.length - 1]]);
    video.removeAttribute("src"); video.load();
    if (lost.length) notes.push("Suivi de la caméra perdu sur " + lost.length + " passage(s) : ces images sont ignorées. Ajoutez un calibrage dans ces passages (flou, caméra trop rapide ou sol sans détails).");
    return { frames: finalizeFrames(frames), lost, notes };
  }

  /* Vignettes JPEG de la vidéo à des instants donnés (illustrations des erreurs acceptées). */
  async function captureFrames(url, times, width) {
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.crossOrigin = "anonymous"; video.src = url;
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error("Vidéo illisible")); });
    const w = width || 320, h = Math.max(2, Math.round((w * video.videoHeight) / video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const out = [];
    for (const t of times) {
      try {
        await seekTo(video, Math.max(0, Math.min(video.duration - 0.05, t)));
        ctx.drawImage(video, 0, 0, w, h);
        out.push(canvas.toDataURL("image/jpeg", 0.6));
      } catch (_e) { out.push(null); }
    }
    video.removeAttribute("src"); video.load();
    return out;
  }

  /* Détection ponctuelle sur l'image affichée (choix des tenues). Renvoie les personnes en pixels vidéo. */
  async function detectAt(video, api, tilesMode) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.min(1, 1280 / Math.max(vw, vh * (16 / 9)));
    const cw = Math.max(2, Math.round(vw * scale)), ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, cw, ch);
    const dets = await detectCanvas(canvas, tilesMode || 1, api, { minPerson: 0.3, minBall: 0.12 });
    return { dets, scale, img: ctx.getImageData(0, 0, cw, ch), width: cw, height: ch };
  }

  return { tileRects, tileToFrame, mergeTiles, calibrationAt, processDetections, finalizeFrames, compactFrames, expandFrames, frameNear, sampleTimes, analyseVideo, detectAt, detectCanvas, captureFrames, TEAM_CODE };
});
