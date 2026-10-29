# Outils communs : chemins avec accents (nom court Windows), lecture d'images et de vidéos. Lecture seule.
import ctypes, os, cv2, numpy as np
def court(p):
    n = ctypes.windll.kernel32.GetShortPathNameW(p, None, 0)
    if not n: return p
    buf = ctypes.create_unicode_buffer(n); ctypes.windll.kernel32.GetShortPathNameW(p, buf, n); return buf.value
def lire_image(p):
    return cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
def ouvrir(p): return cv2.VideoCapture(court(p))
