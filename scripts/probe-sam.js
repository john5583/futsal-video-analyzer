/* Sonde (CI uniquement) : télécharge MobileSAM (ONNX), affiche entrées/sorties, empreintes, et teste une découpe sur bus.jpg. */
"use strict";
const fs = require("fs"), path = require("path"), https = require("https"), crypto = require("crypto");
const ort = require("onnxruntime-node"), jpeg = require("jpeg-js");
const DIR = path.join(__dirname, "..", "tmp-probe");
const FILES = [
  ["enc", "https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx"],
  ["dec", "https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_single.onnx"]
];
function dl(url, dest, n) {
  return new Promise((res, rej) => {
    if ((n || 0) > 8) return rej(new Error("redirections"));
    https.get(url, { headers: { "User-Agent": "probe" } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return res(dl(new URL(r.headers.location, url).toString(), dest, (n || 0) + 1)); }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error("HTTP " + r.statusCode + " " + url)); }
      const o = fs.createWriteStream(dest); r.pipe(o); o.on("finish", () => o.close(res)); o.on("error", rej);
    }).on("error", rej);
  });
}
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const paths = {};
  for (const [k, u] of FILES) {
    const f = path.join(DIR, k + ".onnx"); paths[k] = f;
    await dl(u, f);
    console.log(k, "taille", fs.statSync(f).size, "sha256", sha(f));
  }
  const enc = await ort.InferenceSession.create(paths.enc), dec = await ort.InferenceSession.create(paths.dec);
  const meta = (s) => s.inputNames;
  console.log("ENC in", JSON.stringify(meta(enc)), "out", JSON.stringify(enc.outputNames));
  console.log("DEC in", JSON.stringify(meta(dec)), "out", JSON.stringify(dec.outputNames));
  // image : bus.jpg, grand côté -> 1024, remplissage en bas/droite
  const img = jpeg.decode(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "bus.jpg")), { useTArray: true });
  const s = 1024 / Math.max(img.width, img.height), w = Math.round(img.width * s), h = Math.round(img.height * s);
  for (const mode of ["raw255", "norm"]) {
    const t = new Float32Array(3 * 1024 * 1024);
    const mean = [123.675, 116.28, 103.53], std = [58.395, 57.12, 57.375];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / s)), sy = Math.min(img.height - 1, Math.floor(y / s)), i = (sy * img.width + sx) * 4;
      for (let c = 0; c < 3; c++) { const v = img.data[i + c]; t[c * 1048576 + y * 1024 + x] = mode === "raw255" ? v : (v - mean[c]) / std[c]; }
    }
    const name = enc.inputNames[0];
    const t0 = Date.now();
    const eo = await enc.run({ [name]: new ort.Tensor("float32", t, [1, 3, 1024, 1024]) });
    const emb = eo[enc.outputNames[0]];
    console.log(mode, "encodeur", Date.now() - t0, "ms, sortie", JSON.stringify(emb.dims));
    // clic au milieu de la personne de gauche du bus (~ x 0.12, y 0.62 de l'image)
    const px = 0.12 * img.width, py = 0.62 * img.height;
    const feeds = {
      image_embeddings: emb,
      point_coords: new ort.Tensor("float32", Float32Array.from([px * s, py * s, 0, 0]), [1, 2, 2]),
      point_labels: new ort.Tensor("float32", Float32Array.from([1, -1]), [1, 2]),
      mask_input: new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
      has_mask_input: new ort.Tensor("float32", Float32Array.from([0]), [1]),
      orig_im_size: new ort.Tensor("float32", Float32Array.from([img.height, img.width]), [2])
    };
    try {
      const out = await dec.run(feeds);
      for (const k of dec.outputNames) console.log("  sortie", k, JSON.stringify(out[k].dims), k === "iou_predictions" ? Array.from(out[k].data).join(",") : "");
      const m = out.masks, [, , mh, mw] = m.dims;
      let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (m.data[y * mw + x] > 0) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      console.log(mode, "masque", mw + "x" + mh, "pixels", n, "(" + (100 * n / (mw * mh)).toFixed(1) + " %) boîte", x0, y0, x1, y1);
      let art = "";
      for (let y = 0; y < mh; y += Math.ceil(mh / 36)) { let l = ""; for (let x = 0; x < mw; x += Math.ceil(mw / 72)) l += m.data[y * mw + x] > 0 ? "#" : "."; art += l + "\n"; }
      console.log(art);
    } catch (e) { console.log(mode, "ERREUR décodeur :", e.message); }
  }
})().catch((e) => { console.log("ECHEC", e.stack || e.message); process.exit(1); });
