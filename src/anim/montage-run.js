/* Montage « vraie vidéo truquée » (navigateur) : préparation (images de la vidéo, fond propre, découpe du joueur image par image) puis rendu d'une image du montage.
   Les calculs purs sont dans montage.js. Tout est refusé (raison dite) plutôt que montré faux : projection du terrain absente, découpes mauvaises, sol trop caché. */
(function (root) {
  "use strict";
  const M = root.FutsalMontage, HG = root.FutsalHomography;
  const REASONS = {
    "camera-perdue": "la caméra est perdue à ce moment",
    "projection": "le terrain n'est pas repéré assez sûrement sur ces images",
    "decoupe": "le joueur n'a pas pu être découpé proprement dans la vidéo",
    "sol": "le sol derrière le joueur n'a pas pu être reconstruit (trop caché)",
    "video": "la vidéo n'a pas pu être lue",
    "decalage": "la place voulue est trop éloignée pour un montage crédible",
    "hors-cadre": "la place voulue est en dehors de l'image"
  };
  const STEP_SPRITE = 0.1, STEP_PLATE = 0.4, BEFORE_PLATE = 2.5, AFTER_PLATE = 1.5, MAX_BAD = 0.25, MARGIN = 120;   // MARGIN : marge (pixels) du fond autour de l'image de référence

  const seek = (v, t) => new Promise((res) => {
    const target = Math.max(0, Math.min((v.duration || 1e9) - 0.05, t)); let done = false;
    const fin = (ok) => { if (done) return; done = true; v.removeEventListener("seeked", on); clearTimeout(to); res(ok); };
    const on = () => fin(true), to = setTimeout(() => fin(false), 8000);
    v.addEventListener("seeked", on);
    if (Math.abs(v.currentTime - target) < 0.001 && v.readyState >= 2) fin(true); else v.currentTime = target;
  });

  /* Sol (m) -> pixel de l'image W × H, à partir de H : sol -> image normalisée. */
  const toPixel = (Hn, W, H) => HG.mul3([W, 0, 0, 0, H, 0, 0, 0, 1], Hn);
  const iou = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = ix * iy; return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i || 1); };

  /* Découpe douce (bords adoucis) : renvoie un canvas RGBA de la taille du masque. */
  function makeSprite(img, m) {
    const c = document.createElement("canvas"); c.width = m.w; c.height = m.h;
    const g = c.getContext("2d"), out = g.createImageData(m.w, m.h), W = img.width;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      // alpha = moyenne locale du masque (3 × 3) : un bord de 1 pixel, doux, sans halo dur
      let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h) s += m.data[yy * m.w + xx]; }
      const a = m.data[y * m.w + x] ? Math.min(1, 0.35 + s / 9 * 0.75) : Math.max(0, (s / 9 - 0.35) * 0.5), o = (y * m.w + x) * 4, so = ((m.y0 + y) * W + m.x0 + x) * 4;
      out.data[o] = img.data[so]; out.data[o + 1] = img.data[so + 1]; out.data[o + 2] = img.data[so + 2]; out.data[o + 3] = Math.round(a * 255);
    }
    g.putImageData(out, 0, 0);
    return c;
  }

  /* Qualité d'un masque (mêmes exigences que la découpe du joueur fantôme) : renvoie null si bon, sinon la raison. */
  function maskProblem(img, m, box) {
    if (!m || !m.w || !m.h) return "vide";
    let area = 0, grad = 0, gn = 0; const d = img.data, W = img.width, lum = (x, y) => { const o = (y * W + x) * 4; return 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]; };
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) { area++; const X = m.x0 + x, Y = m.y0 + y; if (X > 0 && Y > 0 && X < W - 1 && Y < img.height - 1) { grad += Math.abs(lum(X + 1, Y) - lum(X - 1, Y)) + Math.abs(lum(X, Y + 1) - lum(X, Y - 1)); gn++; } }
    const bw = box[2] - box[0], bh = box[3] - box[1];
    if (m.h < bh * 0.6 || area < bw * bh * 0.2) return "incomplète";
    if (m.h > bh * 1.5 || m.w > bw * 2) return "trop grande";
    if (gn && grad / gn < 6) return "floue";
    return null;
  }

  /* o : { url, frames (images analysées), pr (Projector), ev, ghost { id, from, to }, segment(req), onProgress(p, texte), signal }
     -> { ok, reason, text } ou un montage { ok: true, render(ctx, video, t), tl, stats, ... } */
  async function prepare(o) {
    const fail = (reason, extra) => ({ ok: false, reason, text: REASONS[reason] + (extra ? " (" + extra + ")" : "") });
    const prog = (p, t) => { if (o.onProgress) o.onProgress(p, t); };
    const tl = M.timeline(o.ev.t), ghost = o.ghost;
    if (!o.url || !o.segment) return fail("video");
    // projection du terrain connue sur toute la durée utile
    for (let t = tl.t0 - BEFORE_PLATE; t <= tl.t1 + AFTER_PLATE; t += 0.25) { const at = o.pr.at(Math.max(0, t)); if (!at.ok) return fail(at.reason === "camera-perdue" ? "camera-perdue" : "projection"); }
    const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.src = o.url;
    await new Promise((r) => { if (v.readyState >= 1) r(); else { v.addEventListener("loadedmetadata", r, { once: true }); setTimeout(r, 8000); } });
    if (!v.videoWidth) return fail("video");
    const S = 1024 / Math.max(v.videoWidth, v.videoHeight), W = Math.round(v.videoWidth * S), H = Math.round(v.videoHeight * S);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const cx = cv.getContext("2d", { willReadFrequently: true });
    const grab = async (t) => { if (!(await seek(v, t))) return null; cx.drawImage(v, 0, 0, W, H); return cx.getImageData(0, 0, W, H); };
    const pxBoxes = (t, pad) => (root.FutsalOverlay.stateAt(o.frames, t).players || []).filter((p) => p.b).map((p) => [p.b[0] / 1000 * W - pad, p.b[1] / 1000 * H - pad, p.b[2] / 1000 * W + pad, p.b[3] / 1000 * H + pad]);
    const check = () => { if (o.signal && o.signal.aborted) throw new Error("Montage interrompu"); };
    try {
      // 1. fond propre
      const ts = []; for (let t = tl.t0 - BEFORE_PLATE; t <= tl.t1 + AFTER_PLATE + 1e-6; t += STEP_PLATE) ts.push(Math.max(0, t));
      const Gref = toPixel(o.pr.at(tl.t0).H, W, H), Grefi = HG.invert(Gref), samples = [];   // le fond est reconstruit dans l'image de référence (celle de l'erreur)
      for (let i = 0; i < ts.length; i++) {
        check(); prog(0.02 + 0.28 * (i / ts.length), "Lecture des images du sol (" + (i + 1) + "/" + ts.length + ")");
        const img = await grab(ts[i]); if (!img) return fail("video");
        samples.push({ data: img.data, width: W, height: H, G: HG.mul3(toPixel(o.pr.at(ts[i]).H, W, H), Grefi), boxes: pxBoxes(ts[i], 8) });   // pixel de référence -> pixel de cette image
      }
      prog(0.3, "Reconstruction du sol…");
      const plate = M.buildPlate(samples, { ppm: 1, gx0: -MARGIN, gy0: -MARGIN, tw: W + 2 * MARGIN, th: H + 2 * MARGIN, fill: 60, near: 3 }); samples.length = 0;
      // 2. le joueur, découpé image par image
      const tk = []; for (let t = tl.t0 - 0.2; t <= tl.t1 + 1e-6; t += STEP_SPRITE) tk.push(Math.round(t * 100) / 100);
      const spr = []; let bad = 0, last = null, firstProblem = null;
      for (let i = 0; i < tk.length; i++) {
        check(); prog(0.32 + 0.62 * (i / tk.length), "Découpe du joueur (" + (i + 1) + "/" + tk.length + ")");
        const img = await grab(tk[i]); if (!img) return fail("video");
        const st = root.FutsalOverlay.stateAt(o.frames, tk[i]), pls = st.players.filter((p) => p.b);
        let me = pls.find((p) => p.id === ghost.id);
        if (!me && last) me = pls.map((p) => ({ p, d: Math.hypot((p.b[0] + p.b[2]) / 2000 * W - last.foot[0], p.b[3] / 1000 * H - last.foot[1]) })).filter((q) => q.d < 70).sort((a, b) => a.d - b.d).map((q) => q.p)[0];
        if (!me) { bad++; spr.push(last ? Object.assign({}, last, { t: tk[i], copy: true }) : null); if (!firstProblem) firstProblem = "joueur introuvable"; continue; }
        const box = [me.b[0] / 1000 * W, me.b[1] / 1000 * H, me.b[2] / 1000 * W, me.b[3] / 1000 * H];
        const toBox = (p) => [p.b[0] / 1000 * W, p.b[1] / 1000 * H, p.b[2] / 1000 * W, p.b[3] / 1000 * H];
        const obox = pls.filter((p) => p !== me).map(toBox).filter((q) => q[0] < box[2] + 40 && q[2] > box[0] - 40 && q[1] < box[3] + 20 && q[3] > box[1] - 40);   // joueurs voisins : découpés aussi, pour repasser devant si besoin
        let res = null;
        try { res = await Promise.race([o.segment({ imgId: "mont" + Date.now().toString(36) + i, width: W, height: H, buffer: img.data.buffer.slice(0), boxes: [box].concat(obox) }), new Promise((r) => setTimeout(() => r({ error: "délai" }), 20000))]); } catch (_e) { res = null; }
        const m = res && !res.error && res.masks ? res.masks[0] : null;
        const pb = m ? maskProblem(img, m, box) : "absente";
        const crowded = pls.some((p) => p !== me && iou(me.b, p.b) > 0.3);
        if (pb || crowded) { bad++; if (!firstProblem) firstProblem = pb || "joueur collé à un autre"; spr.push(last ? Object.assign({}, last, { t: tk[i], copy: true }) : null); continue; }
        // pied : milieu du bas du masque
        let fx = 0, fn = 0; const yb = m.h - 1; for (let y = Math.max(0, yb - Math.round(m.h * 0.05)); y <= yb; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) { fx += x; fn++; }
        const foot = [m.x0 + (fn ? fx / fn : m.w / 2), m.y0 + m.h];
        const cur = { t: tk[i], mask: m, foot, sprite: makeSprite(img, m), others: res.masks.slice(1).map((mm, j) => ({ mask: mm, foot: [(obox[j][0] + obox[j][2]) / 2, obox[j][3]], box: obox[j] })).filter((q) => q.mask && q.mask.w), at: tk[i] };
        spr.push(cur); last = cur;
      }
      if (bad / tk.length > MAX_BAD || !spr[0] && !spr.find(Boolean)) return fail("decoupe", firstProblem);
      for (let i = 0; i < spr.length; i++) if (!spr[i]) spr[i] = spr.find(Boolean);
      // 3. place voulue : décalage au sol entre la course réelle à tEnd et la place indiquée
      const kEnd = spr.reduce((b, s, i) => (Math.abs(s.t - tl.tEnd) < Math.abs(spr[b].t - tl.tEnd) ? i : b), 0);
      const Pend = HG.invert(toPixel(o.pr.at(tl.tEnd).H, W, H)), Rend = HG.apply(Pend, spr[kEnd].foot[0], spr[kEnd].foot[1]);
      const D = [ghost.to[0] - Rend[0], ghost.to[1] - Rend[1]];
      if (!isFinite(D[0]) || Math.hypot(D[0], D[1]) > 14) return fail("decalage");
      const dest = HG.apply(toPixel(o.pr.at(tl.tEnd).H, W, H), ghost.to[0], ghost.to[1]);   // la place voulue doit être visible à l'écran
      if (!(dest[0] > W * 0.03 && dest[0] < W * 0.97 && dest[1] > H * 0.12 && dest[1] < H * 0.985)) return fail("hors-cadre");
      // le sol derrière le joueur est-il reconstruit ? (au point où il est effacé, sur l'image de l'erreur)
      const t0i = spr.reduce((b, s, i) => (Math.abs(s.t - tl.t0) < Math.abs(spr[b].t - tl.t0) ? i : b), 0);
      const probe = { data: new Uint8ClampedArray(W * H * 4), width: W, height: H };
      const er = M.erase(probe, M.fullMask(spr[t0i].mask, 0, 0, W, H, 4), HG.mul3(Gref, HG.invert(toPixel(o.pr.at(spr[t0i].t).H, W, H))), plate);
      if (er.filled < 20 || er.missed / (er.filled + er.missed) > 0.12 || er.approx / Math.max(1, er.filled) > 0.6) return fail("sol", Math.round(100 * er.missed / Math.max(1, er.filled + er.missed)) + " % du fond manquant, " + Math.round(100 * er.approx / Math.max(1, er.filled)) + " % approché");
      prog(1, "Montage prêt");
      return makeRenderer({ W, H, plate, spr, tl, D, pr: o.pr, Gref, stats: { samples: tk.length, bad, fond: Math.round(plate.coverage * 100), manque: Math.round(100 * er.missed / (er.filled + er.missed)), approche: Math.round(100 * er.approx / Math.max(1, er.filled)) } });
    } finally { v.removeAttribute("src"); v.load(); }
  }

  function makeRenderer(m) {
    const { W, H, plate, spr, tl, D, pr, Gref } = m;
    const work = document.createElement("canvas"); work.width = W; work.height = H; const wx = work.getContext("2d", { willReadFrequently: true });
    const near = (t) => { let b = 0; for (let i = 1; i < spr.length; i++) if (Math.abs(spr[i].t - t) < Math.abs(spr[b].t - t)) b = i; return b; };
    const footAt = (t) => {   // pied réel du joueur à t : interpolation entre les découpes voisines
      if (t <= spr[0].t) return spr[0].foot; if (t >= spr[spr.length - 1].t) return spr[spr.length - 1].foot;
      let i = 0; while (i < spr.length - 2 && spr[i + 1].t < t) i++;
      const a = spr[i], b = spr[i + 1], u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0; return [a.foot[0] + (b.foot[0] - a.foot[0]) * u, a.foot[1] + (b.foot[1] - a.foot[1]) * u];
    };
    /* Dessine l'image du montage à l'instant t (vidéo `video` positionnée à t) sur ctx (W × H). Avant l'erreur : la vraie image, rien de changé. */
    function render(ctx, video, t) {
      wx.drawImage(video, 0, 0, W, H);
      if (t < tl.t0 - 0.02) { ctx.drawImage(work, 0, 0); return { changed: false }; }
      const img = wx.getImageData(0, 0, W, H), orig = new Uint8ClampedArray(img.data), at = pr.at(t);
      if (!at.ok) { ctx.drawImage(work, 0, 0); return { changed: false }; }
      const G = toPixel(at.H, W, H), P = HG.invert(G), k = near(t), s = spr[k];
      const ft = footAt(t), dx = ft[0] - s.foot[0], dy = ft[1] - s.foot[1];
      // effacement : silhouette découpée (déplacée comme le joueur), gonflée, plus l'ombre au sol
      const mask = M.fullMask(s.mask, dx, dy, W, H, 5), R = HG.apply(P, ft[0], ft[1]), sc0 = M.groundScale(G, R[0], R[1]), rx = 0.62 * sc0, ry = rx * 0.5;
      for (let y = Math.max(0, Math.floor(ft[1] - ry)); y <= Math.min(H - 1, Math.ceil(ft[1] + ry)); y++) for (let x = Math.max(0, Math.floor(ft[0] - rx)); x <= Math.min(W - 1, Math.ceil(ft[0] + rx)); x++) { const ex = (x - ft[0]) / rx, ey = (y - ft[1]) / ry; if (ex * ex + ey * ey <= 1) mask[y * W + x] = 1; }
      const er = M.erase(img, mask, HG.mul3(Gref, P), plate);   // pixel de cette image -> pixel de l'image de référence, où est le fond propre
      wx.putImageData(img, 0, 0);
      // joueur corrigé : place = course réelle + décalage progressif ; taille selon la perspective ; ombre
      const C = M.corrected(R, D, tl, t), fp = HG.apply(G, C[0], C[1]);
      const R0 = HG.apply(HG.invert(toPixel(pr.at(s.t).H, W, H)), s.foot[0], s.foot[1]);
      const scale = M.clamp(M.groundScale(G, C[0], C[1]) / Math.max(1e-6, M.groundScale(toPixel(pr.at(s.t).H, W, H), R0[0], R0[1])), 0.4, 2.5);
      const sp = s.sprite, ax = s.foot[0] - s.mask.x0, ay = s.foot[1] - s.mask.y0;   // pied dans la découpe
      wx.save();
      const srx = 0.55 * M.groundScale(G, C[0], C[1]);
      wx.fillStyle = "rgba(0,0,0,.30)"; wx.beginPath(); wx.ellipse(fp[0], fp[1], srx, srx * 0.38, 0, 0, Math.PI * 2); wx.fill();
      wx.imageSmoothingQuality = "high";
      wx.drawImage(sp, fp[0] - ax * scale, fp[1] - ay * scale, sp.width * scale, sp.height * scale);
      wx.restore();
      // joueurs plus près de la caméra que lui : ils repassent devant (recopiés depuis l'image d'origine)
      const bx0 = fp[0] - ax * scale, by0 = fp[1] - ay * scale, bx1 = bx0 + sp.width * scale, by1 = by0 + sp.height * scale;
      s.others.forEach((q) => {
        const qf = q.foot; if (!(qf[1] > fp[1] + 2)) return;
        if (q.box[2] < bx0 || q.box[0] > bx1 || q.box[3] < by0 || q.box[1] > by1) return;
        const cur = wx.getImageData(0, 0, W, H), mm = q.mask, d = cur.data;
        for (let y = 0; y < mm.h; y++) for (let x = 0; x < mm.w; x++) { if (!mm.data[y * mm.w + x]) continue; const o = ((mm.y0 + y) * W + mm.x0 + x) * 4; d[o] = orig[o]; d[o + 1] = orig[o + 1]; d[o + 2] = orig[o + 2]; }
        wx.putImageData(cur, 0, 0);
      });
      ctx.drawImage(work, 0, 0);
      return { changed: true, filled: er.filled, missed: er.missed, scale, ground: C, fp, u: M.ease((t - tl.t0) / tl.move) };
    }
    return { ok: true, W, H, tl, D, stats: m.stats, render, feet: () => spr.map((q) => q.foot) };
  }

  root.FutsalMontageRun = { prepare, REASONS, makeSprite, maskProblem };
})(window);
