import numpy as np,cv2,sys,json,random
m=np.fromfile("m4_noir.bin",np.float32).reshape(-1,270,480)
def detect(k,thr=0.85,minpts=60):
    ys,xs=np.nonzero(m[k]>=thr);P=np.stack([xs,ys],1).astype(np.float32)
    if len(P)<minpts: return None
    best=None;rng=random.Random(k)
    for it in range(1500):
        S=P[rng.sample(range(len(P)),5)]
        try: (cx,cy),(a,b),ang=cv2.fitEllipse(S.reshape(-1,1,2))
        except: continue
        a,b=a/2,b/2
        if a<b: a,b,ang=b,a,ang+90
        if not(20<a<200 and 4<b<a): continue
        t=np.deg2rad(ang);c,s=np.cos(t),np.sin(t)
        dx=P[:,0]-cx;dy=P[:,1]-cy;u=c*dx+s*dy;v=-s*dx+c*dy
        r=np.sqrt((u/a)**2+(v/b)**2);d=np.abs(r-1)*np.sqrt(a*b)  # approx px
        inl=(d<1.5);n=inl.sum()
        if best is None or n>best[0]: best=(n,(cx,cy,a,b,ang),inl)
    if best is None: return None
    n,e,inl=best
    # raffinement sur les inliers
    (cx,cy),(a,b),ang=cv2.fitEllipse(P[inl].reshape(-1,1,2))
    return dict(k=k,n=int(n),tot=len(P),e=[float(cx),float(cy),float(a/2),float(b/2),float(ang)],frac=float(n)/len(P))
if __name__=="__main__":
    out=[]
    for k in [int(x) for x in sys.argv[1:]]:
        d=detect(k);print(d);out.append(d)
