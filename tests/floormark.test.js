/* Marques au sol : le filtre « faux ballon jaune » ne vaut pas sur un sol lui-même jaune (parquet sous une lumière chaude). */
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/ai/pipeline");

function floor(w, h, rgb) { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255; } return { data: d, width: w, height: h }; }
function paint(img, x0, y0, x1, y1, rgb) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * img.width + x) * 4; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; } }
const BOX = { x1: 40, y1: 40, x2: 56, y2: 56 };
const YELLOW = [235, 205, 40], BLUE = [40, 90, 170], WOOD = [225, 190, 60], WHITE = [240, 240, 240];

test("marque au sol : un tiret jaune sur un sol bleu est écarté", () => {
  const img = floor(100, 100, BLUE); paint(img, 40, 40, 56, 56, YELLOW);
  assert.equal(P.isFloorMark(img, BOX), true);
});
test("ballon blanc sur un sol bleu ou jaune : jamais écarté", () => {
  const a = floor(100, 100, BLUE); paint(a, 42, 42, 54, 54, WHITE);
  assert.equal(P.isFloorMark(a, BOX), false);
  const b = floor(100, 100, WOOD); paint(b, 42, 42, 54, 54, WHITE);
  assert.equal(P.isFloorMark(b, BOX), false);
});
test("ballon éclairé en jaune sur un parquet jaune : n'est plus écarté à tort", () => {
  const img = floor(100, 100, WOOD); paint(img, 40, 40, 56, 56, YELLOW);
  assert.equal(P.isFloorMark(img, BOX), false, "le pourtour est jaune : le sol est jaune, ce n'est pas une marque");
});
test("dropFloorMarks : seuls les ballons « marque au sol » partent, les personnes et les autres ballons restent", () => {
  const img = floor(100, 100, BLUE); paint(img, 40, 40, 56, 56, YELLOW); paint(img, 10, 10, 22, 22, WHITE);
  const Y = require("../src/ai/yolox");
  const dets = [{ cls: Y.CLASS_BALL, score: 0.5, x1: 40, y1: 40, x2: 56, y2: 56 }, { cls: Y.CLASS_BALL, score: 0.5, x1: 10, y1: 10, x2: 22, y2: 22 }, { cls: Y.CLASS_PERSON, score: 0.9, x1: 40, y1: 40, x2: 56, y2: 56 }];
  const out = P.dropFloorMarks(dets, img, true);
  assert.equal(out.length, 2);
  assert.ok(out.some((d) => d.cls === Y.CLASS_PERSON) && out.some((d) => d.x1 === 10));
  assert.equal(P.dropFloorMarks(dets, img, false).length, 3, "filtre désactivé (ballon jaune) : rien n'est retiré");
});
