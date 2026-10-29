# Modèle de ballon à 3 images consécutives (type TrackNet/WASB, petit réseau en U), entraîné SEULEMENT sur les étiquettes de John.
# Usage : python entrainer.py <vidéos d'entraînement séparées par des virgules> <vidéo de test> <sortie.pt> [epoques]
# Sortie : modèle + tableau d'évaluation sur la vidéo de test entière (jamais vue à l'entraînement).
import sys, json, time, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
torch.backends.cudnn.benchmark = True
dev = "cuda" if torch.cuda.is_available() else "cpu"
H, W = 360, 640
def charge(nom):
    X = np.load("data/%s_X.npy" % nom, mmap_mode="r"); M = np.load("data/%s_meta.npy" % nom); I = json.load(open("data/%s_info.json" % nom))
    return np.ascontiguousarray(X), M, I
def bloc(i, o): return nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(True), nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(True))
class Reseau(nn.Module):
    def __init__(s, c=(24, 48, 96, 128)):
        super().__init__()
        s.e1, s.e2, s.e3, s.e4 = bloc(9, c[0]), bloc(c[0], c[1]), bloc(c[1], c[2]), bloc(c[2], c[3])
        s.d3, s.d2, s.d1 = bloc(c[3] + c[2], c[2]), bloc(c[2] + c[1], c[1]), bloc(c[1] + c[0], c[0])
        s.sortie = nn.Conv2d(c[0], 1, 1)
    def forward(s, x):
        e1 = s.e1(x); e2 = s.e2(F.max_pool2d(e1, 2)); e3 = s.e3(F.max_pool2d(e2, 2)); e4 = s.e4(F.max_pool2d(e3, 2))
        d3 = s.d3(torch.cat([F.interpolate(e4, size=e3.shape[2:], mode="bilinear", align_corners=False), e3], 1))
        d2 = s.d2(torch.cat([F.interpolate(d3, size=e2.shape[2:], mode="bilinear", align_corners=False), e2], 1))
        d1 = s.d1(torch.cat([F.interpolate(d2, size=e1.shape[2:], mode="bilinear", align_corners=False), e1], 1))
        return s.sortie(d1)
def cible(meta, dx, dy, flip, sig=2.0):
    t = np.zeros((H, W), np.float32)
    if meta[1] > 0:
        x, y = meta[2], meta[3]
        if flip: x = W - 1 - x
        x += dx; y += dy
        if 0 <= x < W and 0 <= y < H:
            xs = np.arange(W)[None, :]; ys = np.arange(H)[:, None]
            t = np.exp(-((xs - x) ** 2 + (ys - y) ** 2) / (2 * sig ** 2)).astype(np.float32)
    return t
def lot(X, M, idx, aug, rng):
    xs, ts = [], []
    for i in idx:
        x = X[i].astype(np.float32) / 255.0; dx = dy = 0; flip = False
        if aug:
            flip = rng.random() < 0.5
            if flip: x = x[:, :, ::-1]
            dx, dy = int(rng.integers(-48, 49)), int(rng.integers(-27, 28))
            x = np.roll(x, (dy, dx), axis=(1, 2))
            x = x * rng.uniform(0.75, 1.25) + rng.uniform(-0.08, 0.08)
        xs.append(np.ascontiguousarray(x)); ts.append(cible(M[i], dx, dy, flip))
    return torch.from_numpy(np.stack(xs)).to(dev), torch.from_numpy(np.stack(ts))[:, None].to(dev)
def evalue(net, X, M, I, tols):
    net.eval(); res = []
    with torch.no_grad():
        for i in range(0, len(X), 8):
            x = torch.from_numpy(X[i:i + 8].astype(np.float32) / 255.0).to(dev)
            p = torch.sigmoid(net(x))[:, 0].cpu().numpy()
            for k in range(len(p)):
                j = np.unravel_index(p[k].argmax(), p[k].shape); res.append((float(p[k][j]), float(j[1]), float(j[0])))
    res = np.array(res); echelle = (1920.0 / (H if I["vertical"] else W))      # pixels 640 -> pixels échelle 1920
    pos = M[:, 1] > 0
    d = np.hypot(res[:, 1] - M[:, 2], res[:, 2] - M[:, 3]) * echelle
    sortie = []
    for t in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
        aff = res[:, 0] >= t
        ok = int((aff & pos & (d <= 20)).sum()); faux_aff = int((aff & pos & (d > 20)).sum()) + int((aff & ~pos).sum())
        sortie.append({"seuil": t, "rappel": ok / max(1, int(pos.sum())), "trouves": ok, "positifs": int(pos.sum()), "fauxParmiAffiches": faux_aff / max(1, int(aff.sum())), "affiches": int(aff.sum()), "fauxSurSansBallon": int((aff & ~pos).sum()) / max(1, int((~pos).sum())), "negatifs": int((~pos).sum())})
    return sortie, res, d
def main():
    train = sys.argv[1].split(","); test = sys.argv[2]; out = sys.argv[3]; ep = int(sys.argv[4]) if len(sys.argv) > 4 else 120
    D = [charge(n) for n in train]; X = np.concatenate([d[0] for d in D]); M = np.concatenate([d[1] for d in D])
    Xt, Mt, It = charge(test)
    print("entraînement :", train, X.shape, "positifs", int(M[:, 1].sum()), "| test :", test, Xt.shape, "positifs", int(Mt[:, 1].sum()), flush=True)
    rng = np.random.default_rng(0); torch.manual_seed(0)
    net = Reseau().to(dev); opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    steps = ep * int(np.ceil(len(X) / 8)); sch = torch.optim.lr_scheduler.OneCycleLR(opt, 4e-3, total_steps=steps)
    scaler = torch.amp.GradScaler(); pw = torch.tensor(30.0, device=dev); t0 = time.time(); k = 0
    for e in range(ep):
        net.train(); perm = rng.permutation(len(X)); tot = 0
        for b in range(0, len(perm), 8):
            x, t = lot(X, M, perm[b:b + 8], True, rng)
            with torch.autocast("cuda", dtype=torch.float16):
                lo = net(x)
            loss = F.binary_cross_entropy_with_logits(lo.float(), t, pos_weight=pw)
            opt.zero_grad(set_to_none=True); scaler.scale(loss).backward(); scaler.step(opt); scaler.update(); sch.step(); tot += float(loss); k += 1
        if e % 10 == 0 or e == ep - 1: print("époque", e, "perte", round(tot / max(1, len(perm) / 8), 4), "temps", round(time.time() - t0), "s", flush=True)
    torch.save(net.state_dict(), out)
    tab, res, d = evalue(net, Xt, Mt, It, None)
    print("ÉVALUATION sur", test, "(vidéo entière jamais vue à l'entraînement)")
    for r in tab: print(json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()}, ensure_ascii=False))
    ps = int(sum(1 for r in range(len(Mt)) if Mt[r, 1] > 0))
    t1 = time.time(); evalue(net, Xt[:16], Mt[:16], It, None); print("temps par image (16 images) :", round((time.time() - t1) / 16 * 1000, 1), "ms")
    json.dump(tab, open(out.replace(".pt", "_eval.json"), "w"), ensure_ascii=False)
main()
