# Associe chaque dossier d'étiquettes du ballon à sa vidéo (comparaison de miniatures). Ne modifie rien.
import cv2, glob, os, sys, numpy as np
from commun import court, lire_image, ouvrir
ETQ = r"C:\Users\xboxl\OneDrive\Desktop\vidéo match\étiquetage"
VIDS = glob.glob(r"C:\Users\xboxl\OneDrive\Desktop\vidéo match\*\*.mp4")
def vignette(img): return cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (48, 27) if img.shape[1] >= img.shape[0] else (27, 48)).astype(np.float32)
res = {}
for d in sorted(glob.glob(os.path.join(ETQ, "etiquettes-ballon-*"))):
    imgs = sorted(glob.glob(os.path.join(d, "images", "*.jpg")))
    pick = [imgs[0], imgs[len(imgs)//2], imgs[-1]]
    best = None
    for v in VIDS:
        cap = ouvrir(v)
        if not cap.isOpened(): continue
        tot = 0; ok = True
        for p in pick:
            ms = int(os.path.basename(p).split("_")[1].split(".")[0])
            cap.set(cv2.CAP_PROP_POS_MSEC, ms)
            r, f = cap.read()
            im = lire_image(p)
            if not r or im is None: ok = False; break
            if (f.shape[1] > f.shape[0]) != (im.shape[1] > im.shape[0]): ok = False; break
            tot += float(np.mean(np.abs(vignette(f) - vignette(im))))
        cap.release()
        if ok and (best is None or tot < best[0]): best = (tot, v)
    n = len(imgs); pos = sum(1 for l in glob.glob(os.path.join(d, "labels", "*.txt")) if os.path.getsize(l) > 0)
    h, w = lire_image(imgs[0]).shape[:2]
    print(os.path.basename(d), n, "images", pos, "avec ballon", f"{w}x{h}", "->", best[1] if best else None, "écart", round(best[0], 1) if best else None)
