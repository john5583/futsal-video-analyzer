/* Détecteur de BUTS entraîné (YOLOX-m, un seul objet) : pré- et post-traitement purs, utilisables dans Node et le navigateur.
   Entrée du réseau : image BGR 0-255, 1024x576, redimensionnée en haut à gauche avec remplissage gris (114), comme à l'entraînement.
   Sortie brute : [1, 12096, 6] = (cx, cy, w, h, objectness, classe « but ») non décodés (grilles de pas 8/16/32).
   Une image verticale est parcourue par des fenêtres 16:9 qui se chevauchent. Les cadres rendus sont dans les pixels de l'image d'origine.
   Ce détecteur PROPOSE : le programme ne retient un but qu'avec l'accord du coach (Oui / Non), jamais sur la seule foi du détecteur. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalButIA = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const IW = 1024, IH = 576, STRIDES = [8, 16, 32];
  const SEUIL = 0.3, IOU_NMS = 0.45;

  /* Fenêtres 16:9 (x, y, w, h) qui couvrent l'image : une seule si l'image est horizontale. */
  function fenetres(W, H) {
    const hc = Math.round((W * IH) / IW);
    if (hc >= H) return [{ x: 0, y: 0, w: W, h: H }];
    const pas = Math.max(1, Math.floor(hc * 0.6)), ys = [];
    for (let y = 0; y + hc <= H; y += pas) ys.push(y);
    if (ys[ys.length - 1] !== H - hc) ys.push(H - hc);
    return ys.map((y) => ({ x: 0, y, w: W, h: hc }));
  }

  /* Fenêtre (RGBA) -> tenseur float32 NCHW BGR 1024x576, réduction par moyenne des surfaces (comme cv2.INTER_AREA), gris 114 au-delà. */
  function versTenseur(rgba, W, H, fen) {
    const k = Math.min(IW / fen.w, IH / fen.h), ow = Math.max(1, Math.round(fen.w * k)), oh = Math.max(1, Math.round(fen.h * k));
    const n = IW * IH, out = new Float32Array(3 * n).fill(114);
    const sx = fen.w / ow, sy = fen.h / oh;
    for (let y = 0; y < oh; y++) {
      const y0 = fen.y + y * sy, y1 = y0 + sy, iy0 = Math.floor(y0), iy1 = Math.min(H - 1, Math.ceil(y1) - 1);
      for (let x = 0; x < ow; x++) {
        const x0 = fen.x + x * sx, x1 = x0 + sx, ix0 = Math.floor(x0), ix1 = Math.min(W - 1, Math.ceil(x1) - 1);
        let r = 0, g = 0, b = 0, wsum = 0;
        for (let iy = iy0; iy <= iy1; iy++) {
          const wy = Math.min(y1, iy + 1) - Math.max(y0, iy);
          if (wy <= 0) continue;
          for (let ix = ix0; ix <= ix1; ix++) {
            const wx = Math.min(x1, ix + 1) - Math.max(x0, ix);
            if (wx <= 0) continue;
            const w = wx * wy, o = (iy * W + ix) * 4;
            r += rgba[o] * w; g += rgba[o + 1] * w; b += rgba[o + 2] * w; wsum += w;
          }
        }
        const i = y * IW + x;
        out[i] = b / wsum; out[n + i] = g / wsum; out[2 * n + i] = r / wsum;      // BGR
      }
    }
    return { tensor: out, k };
  }

  /* Sortie brute -> cadres (espace du réseau 1024x576), score = objectness × classe. */
  function decoder(sortie, seuil) {
    const dets = []; let idx = 0;
    for (const s of STRIDES) {
      const gw = IW / s, gh = IH / s;
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++, idx++) {
        const o = idx * 6, obj = sortie[o + 4];
        if (obj < 0.05) continue;
        const score = obj * sortie[o + 5];
        if (score < seuil) continue;
        const cx = (sortie[o] + gx) * s, cy = (sortie[o + 1] + gy) * s, w = Math.exp(sortie[o + 2]) * s, h = Math.exp(sortie[o + 3]) * s;
        dets.push({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, score });
      }
    }
    if (idx * 6 !== sortie.length) throw new Error("Sortie du détecteur de buts inattendue (" + sortie.length + ")");
    return dets;
  }

  function iou(a, b) {
    const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), i = ix * iy;
    const u = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i;
    return u > 0 ? i / u : 0;
  }
  function nms(dets, seuilIou) {
    const tri = dets.slice().sort((a, b) => b.score - a.score), gardes = [];
    for (const d of tri) if (!gardes.some((g) => iou(g, d) > seuilIou)) gardes.push(d);
    return gardes;
  }

  /* Détecte les buts d'une image RGBA W x H. runner(tenseur Float32Array) -> Promise<Float32Array> (sortie brute du réseau). */
  async function detecter(runner, rgba, W, H, opts) {
    const seuil = opts && opts.seuil != null ? opts.seuil : SEUIL, tous = [];
    for (const fen of fenetres(W, H)) {
      const { tensor, k } = versTenseur(rgba, W, H, fen);
      const sortie = await runner(tensor);
      for (const d of decoder(sortie, seuil)) {
        tous.push({ x0: Math.max(0, d.x0 / k + fen.x), y0: Math.max(0, d.y0 / k + fen.y), x1: Math.min(W, d.x1 / k + fen.x), y1: Math.min(H, d.y1 / k + fen.y), score: d.score });
      }
    }
    return nms(tous, IOU_NMS).filter((d) => d.x1 - d.x0 >= 4 && d.y1 - d.y0 >= 4);
  }

  /* Cadre (pixels de l'image d'origine) -> « but » au format de l'assistant (coordonnées de l'image de travail, facteur sc = travail / origine) :
     poteau gauche = côté gauche du cadre, poteau droit = côté droit, du haut du cadre à son pied. */
  function versBut(box, sc) {
    const post = (u) => ({ u: u * sc, v0: box.y0 * sc, v1: box.y1 * sc, width: 4, score: box.score || 0 });
    const hgt = (box.y1 - box.y0) * sc;
    return { left: post(box.x0), right: post(box.x1), score: hgt * (box.score || 0), palette: "détecteur entraîné", ia: true, box };
  }

  return { IW, IH, SEUIL, fenetres, versTenseur, decoder, nms, iou, detecter, versBut };
});
