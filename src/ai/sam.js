/* Découpe des joueurs (silhouettes) avec MobileSAM (Apache-2.0, ONNX, hors ligne).
   Principe : l'image est « encodée » une fois (≈1 s), puis chaque joueur est découpé à partir de sa boîte (≈0,1 s). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalSam = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SIZE = 1024;      // plus grand côté de l'image fournie à l'encodeur
  const PAD = 0.08;       // marge autour de la boîte pour la découpe renvoyée

  /* Dimensions de l'image pour l'encodeur : le plus grand côté vaut SIZE. */
  function fitSize(w, h) {
    const s = SIZE / Math.max(w, h);
    return { s, w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }

  /* RGBA -> tenseur HWC (float32, valeurs 0–255), l'image devant déjà avoir ses dimensions finales. */
  function toHWC(rgba, w, h) {
    const out = new Float32Array(w * h * 3);
    for (let i = 0, j = 0; i < w * h * 4; i += 4, j += 3) { out[j] = rgba[i]; out[j + 1] = rgba[i + 1]; out[j + 2] = rgba[i + 2]; }
    return out;
  }

  /* Plus grande zone connexe d'un masque binaire (w×h) : supprime les petits fragments parasites. */
  function largestComponent(data, w, h) {
    const lab = new Int32Array(w * h);
    const stack = [];
    let best = 0, bestSize = 0, next = 0;
    const sizes = [0];
    for (let i = 0; i < w * h; i++) {
      if (!data[i] || lab[i]) continue;
      next++; let size = 0;
      stack.push(i); lab[i] = next;
      while (stack.length) {
        const p = stack.pop(); size++;
        const x = p % w, y = (p - x) / w;
        if (x > 0 && data[p - 1] && !lab[p - 1]) { lab[p - 1] = next; stack.push(p - 1); }
        if (x < w - 1 && data[p + 1] && !lab[p + 1]) { lab[p + 1] = next; stack.push(p + 1); }
        if (y > 0 && data[p - w] && !lab[p - w]) { lab[p - w] = next; stack.push(p - w); }
        if (y < h - 1 && data[p + w] && !lab[p + w]) { lab[p + w] = next; stack.push(p + w); }
      }
      sizes[next] = size;
      if (size > bestSize) { bestSize = size; best = next; }
    }
    const out = new Uint8Array(w * h);
    if (best) for (let i = 0; i < w * h; i++) if (lab[i] === best) out[i] = 1;
    return { data: out, count: bestSize };
  }

  /* Découpe un masque complet (logits > 0, taille W×H) autour d'une boîte : { x0, y0, w, h, data (0/1), area }. */
  function cropMask(logits, W, H, box) {
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const x0 = Math.max(0, Math.floor(box[0] - bw * PAD)), y0 = Math.max(0, Math.floor(box[1] - bh * PAD));
    const x1 = Math.min(W, Math.ceil(box[2] + bw * PAD)), y1 = Math.min(H, Math.ceil(box[3] + bh * PAD));
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    if (!w || !h) return { x0, y0, w: 0, h: 0, data: new Uint8Array(0), area: 0 };
    const raw = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * w + x] = logits[(y0 + y) * W + (x0 + x)] > 0 ? 1 : 0;
    const lc = largestComponent(raw, w, h);
    return { x0, y0, w, h, data: lc.data, area: lc.count };
  }

  /* Crée le segmenteur à partir d'onnxruntime et des deux fichiers du modèle. */
  async function create(ort, encPath, decPath, threads) {
    const opts = { executionProviders: ["cpu"], intraOpNumThreads: Math.max(1, threads || 4), graphOptimizationLevel: "all" };
    const enc = await ort.InferenceSession.create(encPath, opts);
    const dec = await ort.InferenceSession.create(decPath, opts);
    let cache = null; // { imgId, emb, w, h }

    /* Encode une image (RGBA w×h, plus grand côté = SIZE). */
    async function embed(imgId, rgba, w, h) {
      if (cache && cache.imgId === imgId) return;
      const fit = fitSize(w, h);
      if (fit.w !== w || fit.h !== h) throw new Error("Image de taille inattendue pour la découpe (" + w + "×" + h + ")");
      const out = await enc.run({ [enc.inputNames[0]]: new ort.Tensor("float32", toHWC(rgba, w, h), [h, w, 3]) });
      cache = { imgId, emb: out[enc.outputNames[0]], w, h };
    }

    /* Découpe une personne à partir de sa boîte [x1,y1,x2,y2] (pixels de l'image encodée). */
    async function segmentBox(box, imgId) {
      if (!cache || (imgId !== undefined && cache.imgId !== imgId)) throw new Error("Image non encodée : renvoyez l'image avec la demande");
      const { emb, w, h } = cache;
      const feeds = {
        image_embeddings: emb,
        point_coords: new ort.Tensor("float32", Float32Array.from([box[0], box[1], box[2], box[3]]), [1, 2, 2]),
        point_labels: new ort.Tensor("float32", Float32Array.from([2, 3]), [1, 2]),
        mask_input: new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
        has_mask_input: new ort.Tensor("float32", Float32Array.from([0]), [1]),
        orig_im_size: new ort.Tensor("float32", Float32Array.from([h, w]), [2])
      };
      const out = await dec.run(feeds);
      const m = out.masks, mh = m.dims[2], mw = m.dims[3];
      const crop = cropMask(m.data, mw, mh, box);
      crop.iou = out.iou_predictions ? out.iou_predictions.data[0] : null;
      return crop;
    }

    return { embed, segmentBox };
  }

  return { SIZE, fitSize, toHWC, largestComponent, cropMask, create };
});
