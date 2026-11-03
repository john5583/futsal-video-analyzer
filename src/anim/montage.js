/* Montage « vraie vidéo truquée » d'une correction : le joueur qui a mal joué est EFFACÉ de la vraie vidéo (le sol est reconstruit derrière lui) puis le même joueur,
   découpé image par image dans la vraie vidéo (vrai maillot, vraie course), est replacé là où il aurait dû être, avec la bonne taille (perspective), son ombre, et passe
   derrière les joueurs qui sont devant lui.
   Fond propre : on projette plusieurs images de la vidéo sur le plan du sol (la projection du terrain est connue image par image) ; pour chaque point du sol on prend la couleur
   MÉDIANE des images où aucun joueur ne le cache. Les joueurs bougent, le sol non : la médiane donne le sol nu. Limite dite franchement : ça ne vaut que pour ce qui est au sol
   (le sol derrière le joueur) ; si trop de points du sol restent cachés, le montage est refusé (repli sur la correction dessinée).
   Les fonctions ci-dessous travaillent sur des tampons RGBA (Node et navigateur) ; l'orchestration (lecture de la vidéo, découpe) est en bas, navigateur seulement. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../ai/homography.js"));
  else root.FutsalMontage = factory(root.FutsalHomography);
})(typeof self !== "undefined" ? self : this, function (HG) {
  "use strict";

  const PPM = 25, GX0 = -3, GY0 = -3, GW = 46, GH = 26;          // plan du sol : 25 points par mètre, de −3 à 43 m en x et de −3 à 23 m en y
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

  /* Matrice 3×3 -> fonction (x, y) -> [u, v] sans allocation superflue. */
  function mapper(M) { return (x, y) => { const w = M[6] * x + M[7] * y + M[8]; return [(M[0] * x + M[1] * y + M[2]) / w, (M[3] * x + M[4] * y + M[5]) / w]; }; }

  /* Fond propre.
     samples : [{ data, width, height, G (sol -> pixel de cette image, matrice 3×3), boxes: [[x0, y0, x1, y1]] à exclure (joueurs) }]
     -> { tw, th, ppm, gx0, gy0, rgba, valid, coverage } ; un point du sol n'est valide que s'il est vu dégagé sur au moins `min` images. */
  function buildPlate(samples, opt) {
    opt = opt || {};
    // plan du fond : par défaut le sol (mètres) ; ou l'image de référence (pixels, ppm = 1) pour reconstruire aussi le mur derrière le joueur
    const min = opt.min || 3, ppm = opt.ppm || PPM, gx0 = opt.gx0 != null ? opt.gx0 : GX0, gy0 = opt.gy0 != null ? opt.gy0 : GY0, tw = opt.tw || GW * PPM, th = opt.th || GH * PPM, n = tw * th;
    const stack = samples.map((s) => {
      const buf = new Uint8Array(n * 3), ok = new Uint8Array(n), G = s.G;
      // une homographie est définie au signe près : le « devant la caméra » est le signe de w au centre du terrain
      const sg = Math.sign(G[6] * (gx0 + tw / ppm / 2) + G[7] * (gy0 + th / ppm / 2) + G[8]) || 1;
      for (let gy = 0; gy < th; gy++) {
        const Y = gy0 + (gy + 0.5) / ppm;
        for (let gx = 0; gx < tw; gx++) {
          const X = gx0 + (gx + 0.5) / ppm, w = G[6] * X + G[7] * Y + G[8];
          if (!(w * sg > 1e-9)) continue;
          const px = Math.round((G[0] * X + G[1] * Y + G[2]) / w - 0.5), py = Math.round((G[3] * X + G[4] * Y + G[5]) / w - 0.5);
          if (px < 0 || py < 0 || px >= s.width || py >= s.height) continue;
          let hid = false;
          for (let b = 0; b < s.boxes.length; b++) { const q = s.boxes[b]; if (px >= q[0] && px <= q[2] && py >= q[1] && py <= q[3]) { hid = true; break; } }
          if (hid) continue;
          const o = (py * s.width + px) * 4, i = gy * tw + gx;
          buf[i * 3] = s.data[o]; buf[i * 3 + 1] = s.data[o + 1]; buf[i * 3 + 2] = s.data[o + 2]; ok[i] = 1;
        }
      }
      return { buf, ok };
    });
    const rgba = new Uint8ClampedArray(n * 4), valid = new Uint8Array(n), idx = new Int32Array(stack.length), vals = new Uint8Array(stack.length);
    let seen = 0;
    for (let i = 0; i < n; i++) {
      let c = 0; for (let k = 0; k < stack.length; k++) if (stack[k].ok[i]) idx[c++] = k;
      if (c < min) continue;
      for (let ch = 0; ch < 3; ch++) {
        for (let k = 0; k < c; k++) { const v = stack[idx[k]].buf[i * 3 + ch]; let j = k - 1; while (j >= 0 && vals[j] > v) { vals[j + 1] = vals[j]; j--; } vals[j + 1] = v; }
        rgba[i * 4 + ch] = vals[(c - 1) >> 1];
      }
      rgba[i * 4 + 3] = 255; valid[i] = 1; seen++;
    }
    const plate = { tw, th, ppm, gx0, gy0, rgba, valid, approx: new Uint8Array(n), coverage: seen / n, near: opt.near };
    if (opt.fill > 0) fillHoles(plate, Math.round(opt.fill * ppm));
    return plate;
  }

  /* Points du sol jamais vus dégagés (joueurs immobiles, ballon…) : prennent la couleur du point vu le plus proche, à moins de maxD points (propagation de proche en proche).
     Le sol d'une salle est presque uni : c'est une approximation honnête, marquée dans plate.approx pour pouvoir la compter et refuser si elle domine. */
  function fillHoles(plate, maxD) {
    const { tw, th, rgba, valid, approx } = plate, n = tw * th, src = new Int32Array(n).fill(-1), dist = new Uint16Array(n);
    let cur = [];
    for (let i = 0; i < n; i++) if (valid[i]) { src[i] = i; cur.push(i); }
    for (let d = 1; d <= maxD && cur.length; d++) {
      const next = [];
      for (const i of cur) {
        const x = i % tw, y = (i / tw) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= tw || yy >= th) continue;
          const j = yy * tw + xx; if (src[j] >= 0) continue;
          src[j] = src[i]; dist[j] = d; next.push(j);
        }
      }
      cur = next;
    }
    for (let i = 0; i < n; i++) if (!valid[i] && src[i] >= 0) { const o = src[i] * 4; rgba[i * 4] = rgba[o]; rgba[i * 4 + 1] = rgba[o + 1]; rgba[i * 4 + 2] = rgba[o + 2]; rgba[i * 4 + 3] = 255; valid[i] = 1; approx[i] = 1; }
    return plate;
  }

  /* Gonfle un masque (Uint8Array w × h) de r pixels. */
  function dilate(mask, w, h, r) {
    const out = new Uint8Array(w * h), tmp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!mask[y * w + x]) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) tmp[y * w + xx] = 1; } }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!tmp[y * w + x]) continue; for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) out[yy * w + x] = 1; } }
    return out;
  }

  /* Efface un joueur : chaque pixel du masque reçoit la couleur du sol propre derrière lui.
     img : { data, width, height } modifié sur place ; mask : Uint8Array (width × height) ; P : pixel -> sol (matrice 3×3) ; plate : fond propre.
     -> { filled, missed } ; un point sans fond propre prend le point valide le plus proche (≤ 0,6 m), sinon reste tel quel (compté « missed »). */
  function erase(img, mask, P, plate) {
    const w = img.width, h = img.height, d = img.data; let filled = 0, missed = 0, approx = 0;
    const near = plate.near != null ? plate.near : Math.round(0.6 * plate.ppm);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const q = P[6] * (x + 0.5) + P[7] * (y + 0.5) + P[8];
      if (!(Math.abs(q) > 1e-12)) { missed++; continue; }
      const X = (P[0] * (x + 0.5) + P[1] * (y + 0.5) + P[2]) / q, Y = (P[3] * (x + 0.5) + P[4] * (y + 0.5) + P[5]) / q;
      let gx = Math.floor((X - plate.gx0) * plate.ppm), gy = Math.floor((Y - plate.gy0) * plate.ppm), i = -1;
      if (gx >= 0 && gy >= 0 && gx < plate.tw && gy < plate.th) {
        if (plate.valid[gy * plate.tw + gx]) i = gy * plate.tw + gx;
        else for (let r = 1; r <= near && i < 0; r++) for (let dy = -r; dy <= r && i < 0; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const xx = gx + dx, yy = gy + dy; if (xx >= 0 && yy >= 0 && xx < plate.tw && yy < plate.th && plate.valid[yy * plate.tw + xx]) { i = yy * plate.tw + xx; break; } }
      }
      if (i < 0) { missed++; continue; }
      const o = (y * w + x) * 4; d[o] = plate.rgba[i * 4]; d[o + 1] = plate.rgba[i * 4 + 1]; d[o + 2] = plate.rgba[i * 4 + 2]; filled++; if (plate.approx && plate.approx[i]) approx++;
    }
    return { filled, missed, approx };
  }

  /* Translate un masque { x0, y0, w, h, data } de (dx, dy) pixels et le met en pleine image (width × height), en le gonflant de r pixels. */
  function fullMask(m, dx, dy, width, height, r) {
    const out = new Uint8Array(width * height), ox = Math.round(m.x0 + dx), oy = Math.round(m.y0 + dy);
    for (let y = 0; y < m.h; y++) { const yy = oy + y; if (yy < 0 || yy >= height) continue; for (let x = 0; x < m.w; x++) { if (!m.data[y * m.w + x]) continue; const xx = ox + x; if (xx >= 0 && xx < width) out[yy * width + xx] = 1; } }
    return r > 0 ? dilate(out, width, height, r) : out;
  }

  /* Échelle locale de la projection du sol en (X, Y) : racine de la surface (en pixels) d'un carré de 1 m. G : sol -> pixel. */
  function groundScale(G, X, Y) {
    const f = mapper(G), q = [f(X, Y), f(X + 1, Y), f(X + 1, Y + 1), f(X, Y + 1)];
    let a = 0; for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p[0] * n[1] - n[0] * p[1]; }
    return Math.sqrt(Math.abs(a) / 2);
  }

  /* ---- chronologie du montage ---- */
  const MOVE = 1.4, TAIL = 1.2;                       // le joueur rejoint sa place en MOVE s, puis continue sa course (décalé) pendant TAIL s
  function timeline(evT) { return { t0: evT, move: MOVE, tEnd: evT + MOVE, t1: evT + MOVE + TAIL }; }

  /* Position corrigée au sol à l'instant t : course réelle R(t) + décalage progressif vers la place voulue (D = place voulue − R(tEnd)). */
  function corrected(R, D, tl, t) { const u = ease((t - tl.t0) / tl.move); return [R[0] + u * D[0], R[1] + u * D[1]]; }

  return { PPM, buildPlate, fillHoles, dilate, erase, fullMask, groundScale, timeline, corrected, mapper, ease, clamp, MOVE, TAIL };
});
