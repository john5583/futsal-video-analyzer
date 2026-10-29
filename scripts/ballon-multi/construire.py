# Construit les piles de 3 images consécutives (t-2, t-1, t) autour de chaque image étiquetée par John.
# Entrée : etiq/<nom>.json (fichier d'étiquettes) + vidéo. Sortie : data/<nom>.npz (X uint8 N×9×360×640, positions, état).
# Les vidéos verticales sont tournées de 90° (transposées) pour avoir une forme unique 640×360 ; l'évaluation remet les positions dans l'image d'origine.
import json, sys, os, numpy as np, cv2
from commun import court, lire_image, ouvrir
W, H = 640, 360
def pile(cap, n, fps_pas=1):
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, n - 2))
    fr = []
    for _ in range(3):
        r, f = cap.read()
        if not r: return None
        fr.append(f)
    return fr
def petit(f, vertical):
    if vertical: f = cv2.transpose(f)
    return cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA)
def main(nom, video, etiq, jpgdir):
    E = json.load(open(etiq, encoding="utf8")); vw, vh = E["video"]["vw"], E["video"]["vh"]; vertical = vh > vw
    cap = ouvrir(video); fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    X, meta = [], []
    # décalage image/instant : on compare avec le jpg exporté par l'application pour quelques images (mode)
    deltas = []
    ms_list = sorted(int(k) for k in E["frames"])
    for ms in ms_list[:: max(1, len(ms_list) // 12)]:
        n0 = int(round(ms / 1000 * fps)); jpg = lire_image(os.path.join(jpgdir, "balle_%08d.jpg" % ms))
        if jpg is None: continue
        best = None
        for d in (-2, -1, 0, 1, 2):
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, n0 + d)); r, f = cap.read()
            if not r: continue
            e = float(np.mean(np.abs(cv2.resize(f, (96, 54)).astype(np.float32) - cv2.resize(jpg, (96, 54)).astype(np.float32))))
            if best is None or e < best[0]: best = (e, d)
        if best: deltas.append(best[1])
    delta = int(np.bincount(np.array(deltas) + 2).argmax() - 2) if deltas else 0
    print(nom, "fps", round(fps, 2), "vertical", vertical, "décalage image/instant (mode)", delta, "sur", len(deltas), "mesures", sorted(set(deltas)))
    for ms in ms_list:
        L = E["frames"][str(ms)].get("ball")
        if not L or L["state"] not in ("vu", "aucun"): continue
        n = int(round(ms / 1000 * fps)) + delta
        fr = pile(cap, n)
        if fr is None: continue
        x = np.concatenate([petit(f, vertical) for f in fr], axis=2).transpose(2, 0, 1)      # 9×H×W (BGR ×3)
        if L["state"] == "vu":
            u, v = (L["v"], L["u"]) if vertical else (L["u"], L["v"])                       # transposition
            sx = W / (vh if vertical else vw); sy = H / (vw if vertical else vh)
            pos = (u * sx, v * sy); etat = 1
        else: pos = (-1.0, -1.0); etat = 0
        X.append(x); meta.append([ms, etat, pos[0], pos[1]])
    X = np.stack(X).astype(np.uint8); meta = np.array(meta, dtype=np.float32)
    np.save("data/%s_X.npy" % nom, X); np.save("data/%s_meta.npy" % nom, meta)
    json.dump({"vertical": vertical, "vw": vw, "vh": vh, "fps": fps, "decalage": delta}, open("data/%s_info.json" % nom, "w"))
    print(nom, X.shape, "positifs", int(meta[:, 1].sum()), "négatifs", int((1 - meta[:, 1]).sum()))
if __name__ == "__main__":
    main(*sys.argv[1:5])
