import json,sys,cv2,numpy as np
d=sys.argv[1];J=json.load(open(d+"/lignes.json"))
col={"contour":(255,255,0),"mediane":(0,255,255),"rond":(0,0,255),"surfG":(0,165,255),"surfD":(0,165,255),"butG":(255,0,255),"butD":(255,0,255)}
tiles=[]
for r in J:
    im=cv2.imread("%s/f_%d.png"%(d,r["t"]))
    for k,p in r["lines"].items():
        pts=np.array(p,np.float64);ok=np.isfinite(pts).all(1)&(abs(pts)<30000).all(1)
        pts=pts[ok].astype(np.int32)
        if len(pts)>1:cv2.polylines(im,[pts],False,col[k],2,cv2.LINE_AA)
    cv2.putText(im,"t=%ds %s"%(r["t"],r["v"]),(30,70),cv2.FONT_HERSHEY_SIMPLEX,2,(0,0,0),7);cv2.putText(im,"t=%ds %s"%(r["t"],r["v"]),(30,70),cv2.FONT_HERSHEY_SIMPLEX,2,(255,255,255),2)
    cv2.imwrite("%s/o_%d.jpg"%(d,r["t"]),cv2.resize(im,(1280,720)))
    tiles.append(cv2.resize(im,(960,540)))
for i in range(0,len(tiles),2):
    row=np.hstack(tiles[i:i+2] if i+1<len(tiles) else [tiles[i],tiles[i]*0]);cv2.imwrite("%s/pl_%d.jpg"%(d,i//2),row)
