/* Silhouette fiable ou cercle au sol : jamais de cadre, jamais de silhouette douteuse (pur, sans écran).
   - evaluate : une découpe MobileSAM est-elle FIABLE ? Elle doit être nette (qualité annoncée par le modèle), avoir la forme d'UNE personne
     (hauteur, largeur, remplissage de sa boîte, peu de débordement) et ne pas avoir absorbé une autre personne.
     Une découpe douteuse n'est jamais dessinée : à sa place, un cercle au sol.
   - groundCircle : cercle posé au sol sous la personne (0,35 m de rayon, projeté avec le terrain calibré quand il est fiable à cet instant,
     sinon petite ellipse sous les pieds tirée de la boîte) ; rien si les pieds ne sont pas dans l'image.
   Un masque : { x0, y0, w, h, data (0/1), area, iou } dans le repère de l'image de découpe ; une boîte : [x1, y1, x2, y2] dans ce même repère. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalSilhouette = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const LIM = { gapMin: 0.1, stab: 0.9, iou: 0.8, fillMin: 0.2, fillMax: 0.92, heightMin: 0.75, widthMin: 0.4, leakMax: 0.12, aspectMax: 0.75, areaMin: 60 };
  const COVER_MAX = 0.5;          // au-delà, la silhouette recouvre une autre personne
  const RADIUS = 0.35;            // rayon du cercle au sol (m)

  /* Mesures d'un masque par rapport à la boîte de la personne. */
  function measure(m, box) {
    let minx = Infinity, miny = Infinity, maxx = -1, maxy = -1, area = 0, out = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.data[y * m.w + x] !== 1) continue;
      area++;
      const X = m.x0 + x + 0.5, Y = m.y0 + y + 0.5;
      if (X < minx) minx = X; if (X > maxx) maxx = X; if (Y < miny) miny = Y; if (Y > maxy) maxy = Y;
      if (X < box[0] || X > box[2] || Y < box[1] || Y > box[3]) out++;
    }
    const bw = box[2] - box[0], bh = box[3] - box[1];
    if (!area || !(bw > 0) || !(bh > 0)) return null;
    const mw = maxx - minx, mh = maxy - miny;
    return { area, fill: area / (bw * bh), height: mh / bh, width: mw / bw, leak: out / area, aspect: mh > 0 ? mw / mh : 99 };
  }

  /* { ok, why, m } : why dit en mots simples pourquoi la découpe est écartée. */
  function evaluate(mask, box) {
    if (!mask || !(mask.w > 0) || !(mask.h > 0) || !mask.data || !Array.isArray(box) || box.length !== 4) return { ok: false, why: "pas de découpe" };
    const m = measure(mask, box);
    if (!m) return { ok: false, why: "découpe vide" };
    const bad = (why) => ({ ok: false, why, m });
    if (!(mask.stab >= LIM.stab)) return bad("découpe instable (elle change quand la boîte change un peu) : stabilité " + (mask.stab == null ? "inconnue" : Math.round(mask.stab * 100) + " %"));
    if (!(mask.iou >= LIM.iou)) return bad("découpe pas assez nette (qualité " + (mask.iou == null ? "inconnue" : Math.round(mask.iou * 100) + " %") + ")");
    if (m.area < LIM.areaMin) return bad("découpe trop petite");
    if (m.fill < LIM.fillMin) return bad("silhouette trop mince pour sa boîte");
    if (m.fill > LIM.fillMax) return bad("découpe qui remplit toute la boîte");
    if (m.height < LIM.heightMin) return bad("silhouette coupée en hauteur");
    if (m.width < LIM.widthMin) return bad("silhouette coupée en largeur");
    if (m.leak > LIM.leakMax) return bad("découpe qui déborde de la boîte");
    if (m.aspect > LIM.aspectMax) return bad("forme trop large pour une personne");
    return { ok: true, why: null, m };
  }
  /* Recouvrement (intersection sur union) de deux masques de repères différents ; 0 si l'un est inutilisable. */
  function maskIoU(a, b) {
    if (!a || !b || !(a.w > 0) || !(b.w > 0) || !a.data || !b.data) return 0;
    const x0 = Math.min(a.x0, b.x0), y0 = Math.min(a.y0, b.y0), x1 = Math.max(a.x0 + a.w, b.x0 + b.w), y1 = Math.max(a.y0 + a.h, b.y0 + b.h);
    let i = 0, u = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const pa = inMask(a, x, y), pb = inMask(b, x, y);
      if (pa || pb) u++;
      if (pa && pb) i++;
    }
    return u ? i / u : 0;
  }
  const inMask = (m, x, y) => { const px = x - m.x0, py = y - m.y0; return px >= 0 && py >= 0 && px < m.w && py < m.h && m.data[py * m.w + px] === 1; };
  /* Boîte réduite (f < 1) ou agrandie (f > 1) autour de son centre. */
  const scaleBox = (b, f) => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, hw = ((b[2] - b[0]) / 2) * f, hh = ((b[3] - b[1]) / 2) * f; return [cx - hw, cy - hh, cx + hw, cy + hh]; };
  const inside = (m, x, y) => { const px = Math.floor(x - m.x0), py = Math.floor(y - m.y0); return px >= 0 && py >= 0 && px < m.w && py < m.h && m.data[py * m.w + px] === 1; };

  /* Part du « cœur » d'une boîte (60 % de la largeur, de 15 % à 85 % de la hauteur) recouverte par un masque. */
  function coreCover(mask, box) {
    const w = box[2] - box[0], h = box[3] - box[1];
    let n = 0, c = 0;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 12; j++) {
      n++;
      if (inside(mask, box[0] + w * (0.2 + 0.6 * (i + 0.5) / 8), box[1] + h * (0.15 + 0.7 * (j + 0.5) / 12))) c++;
    }
    return c / n;
  }
  /* Points « ce n'est PAS cette personne » pour MobileSAM : le corps des voisins qui chevauchent sa boîte. Un voisin plus proche de la caméra
     (pieds plus bas) la cache : son torse et sa tête sont des points sûrs. Un voisin plus loin n'est utilisé que par sa tête, et seulement
     si elle est hors de la bande centrale de la personne (sinon le point pourrait tomber sur elle). */
  function negativesFor(i, items) {
    const a = items[i].box, aw = a[2] - a[0], ah = a[3] - a[1], out = [];
    const inA = (x, y) => x >= a[0] && x <= a[2] && y >= a[1] && y <= a[3];
    items.forEach((o, j) => {
      if (j === i || !o.box) return;
      const b = o.box, bw = b[2] - b[0], bh = b[3] - b[1];
      const ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (ix <= 0 || iy <= 0 || bw < aw * 0.25 || ix * iy < 0.04 * Math.min(aw * ah, bw * bh)) return;
      const cx = (b[0] + b[2]) / 2, near = b[3] > a[3] - ah * 0.03, head = [cx, b[1] + bh * 0.12], torso = [cx, b[1] + bh * 0.45];
      if (near) { [torso, head].forEach((p) => { if (inA(p[0], p[1])) out.push(p); }); }
      else if (inA(head[0], head[1]) && Math.abs(cx - (a[0] + a[2]) / 2) > aw * 0.3) out.push(head);
    });
    return out.slice(0, 8);
  }

  /* Liste [{ id, mask, box }] -> même liste avec { ok, why } ; une silhouette qui recouvre le cœur d'UNE AUTRE personne a fondu deux
     personnes en une : elle est écartée. */
  /* Écart entre deux boîtes, en tailles de la première (0 = elles se touchent ou se chevauchent). */
  function gap(a, b) {
    const gx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2])), gy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
    return Math.hypot(gx / (a[2] - a[0]), gy / (a[3] - a[1]));
  }
  function evaluateAll(items) {
    const res = items.map((it) => Object.assign({ id: it.id }, evaluate(it.mask, it.box)));
    items.forEach((a, i) => {
      if (!res[i].ok) return;
      items.forEach((b, j) => {
        if (i === j || !b.box) return;
        const bw = b.box[2] - b.box[0], aw = a.box[2] - a.box[0];
        if (bw < aw * 0.25) return;             // une toute petite boîte (ballon pris pour une personne, reflet) ne prouve rien
        if (coreCover(a.mask, b.box) >= COVER_MAX) { res[i] = { id: res[i].id, ok: false, why: "a absorbé une autre personne", m: res[i].m }; }
        else if (gap(a.box, b.box) <= LIM.gapMin) { res[i] = { id: res[i].id, ok: false, why: "une autre personne est collée à elle (la découpe pourrait la mélanger)", m: res[i].m }; }
      });
    });
    return res;
  }

  /* Cercle au sol d'une personne : liste de points [x, y] en pixels de la vidéo, ou null. p.b = boîte en millièmes ; p.x, p.y = terrain (m).
     hInv : projection terrain -> pixels (inverse de l'homographie pixels -> m), ou null ; apply(H, x, y) -> [x, y]. */
  function groundCircle(p, vw, vh, hInv, apply) {
    if (!p || !Array.isArray(p.b) || p.b.length < 4 || !(vw > 0) || !(vh > 0)) return null;
    const x1 = (p.b[0] / 1000) * vw, y2 = (p.b[3] / 1000) * vh, x2 = (p.b[2] / 1000) * vw, y1 = (p.b[1] / 1000) * vh;
    if (!(x2 > x1) || !(y2 > y1) || p.b[3] >= 985 || p.b[3] <= 0) return null;      // pieds hors de l'image : on ne devine pas où est le sol
    const cx = (x1 + x2) / 2, pts = [];
    if (hInv && apply && isFinite(p.x) && isFinite(p.y)) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, q = apply(hInv, p.x + RADIUS * Math.cos(a), p.y + RADIUS * Math.sin(a));
        if (!q || !isFinite(q[0]) || !isFinite(q[1]) || Math.abs(q[0]) > 3 * vw || Math.abs(q[1]) > 3 * vh) { pts.length = 0; break; }
        pts.push([q[0], q[1]]);
      }
      if (pts.length) {
        const c = apply(hInv, p.x, p.y);
        // le cercle projeté doit tomber sous les pieds détectés ; sinon la projection n'est pas fiable ici
        if (c && Math.hypot(c[0] - cx, c[1] - y2) <= Math.max(30, (x2 - x1) * 1.2)) return pts;
      }
      pts.length = 0;
    }
    const rx = Math.max(6, (x2 - x1) * 0.5), ry = rx * 0.38;
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; pts.push([cx + rx * Math.cos(a), y2 - ry * 0.4 + ry * Math.sin(a)]); }
    return pts;
  }
  return { LIM, RADIUS, gap, maskIoU, scaleBox, measure, evaluate, evaluateAll, negativesFor, coreCover, groundCircle };
});
