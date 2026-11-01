// Terrain complet (repère du rond, grand axe = Y) projeté sur des images : node courtdraw.js outDir L W t1 t2 ...
const L=require("./lib.js");const {mul,inv,W:IW,H:IH}=L;const P=require("./pose1.js");
const S="C:/Users/xboxl/AppData/Local/Temp/claude/C--Users-xboxl-Desktop-futsal-video-analyzer/6bb1eadf-3e66-4261-a8ec-8e4e399e41cf/scratchpad/glob/sgfull6.json";
const {G,verdict}=L.chargeG(S);const [,, out,LL,WW,...ts]=process.argv;const Lm=+LL,Wm=+WW;
const REF=30,FOV=91;let best=null;for(let s=0;s<150;s++){const q0=[P.r(8,16),P.r(2,6),P.r(0,0.8),P.r(0.3,0.8),P.r(-0.05,0.1)];const o=P.nm(q=>P.cost(q,P.E[REF].e,FOV),q0,[3,1,0.2,0.1,0.03],200);if(!best||o.f<best.f)best=o;}
const q=best.x,Hr=L.poseH([20-q[0],10,q[1],q[2],q[3],q[4]],FOV),Gri=inv(G[16*REF]);
const arc=(cu,cv,r,a0,a1,n=30)=>Array.from({length:n+1},(_,i)=>{const t=(a0+(a1-a0)*i/n)*Math.PI/180;return [cu+r*Math.cos(t),cv+r*Math.sin(t)]});
const hl=Lm/2,hw=Wm/2;
const area=(s)=>[...arc(-1.5,s*hl,6,s>0?-90:90,s>0?-180:0,20).reverse(),[-7.5,s*hl]].length?[...arc(1.5,s*hl,6,s>0?270:90,s>0?180:0,20)]:[];
// surface (6 m) côté s (+1 : v=+hl) : arc autour du poteau u=+1.5, segment droit à v=s*(hl-6), arc autour du poteau u=-1.5
const surf=(s)=>{const a=[];const p1=arc(1.5,s*hl,6,0,s>0?-90:90,20);const p2=arc(-1.5,s*hl,6,s>0?-90:90,s>0?-180:-180+0,20);
  const pts=[[7.5,s*hl],...arc(1.5,s*hl,6,0,s>0?-90:90,20).slice(0),[-1.5,s*(hl-6)],...arc(-1.5,s*hl,6,s>0?-90:90,s>0?-180:180,20),[-7.5,s*hl]];return pts;};
const lines={contour:[[-hw,-hl],[hw,-hl],[hw,hl],[-hw,hl],[-hw,-hl]],mediane:[[-hw,0],[hw,0]],rond:arc(0,0,3,0,360,60),surfG:surf(-1),surfD:surf(1),
  butG:[[-1.5,-hl],[1.5,-hl]],butD:[[-1.5,hl],[1.5,hl]]};
const res=[];for(const t of ts.map(Number)){const k=Math.round(4*t);const rec={t,v:verdict[k],lines:{}};
  if(verdict[k]==="ok"||verdict[k]==="pont"){const Hk=mul(mul(G[k],Gri),Hr);
    for(const key in lines)rec.lines[key]=lines[key].map(([u,v])=>{const X=20+u,Y=10+v,w=Hk[6]*X+Hk[7]*Y+Hk[8];if(w<=1e-6)return [NaN,NaN];return [((Hk[0]*X+Hk[1]*Y+Hk[2])/w*L.F480+IW/2)*4,((Hk[3]*X+Hk[4]*Y+Hk[5])/w*L.F480+IH/2)*4];});}
  res.push(rec);}
L.fs.writeFileSync(out+"/lignes.json",JSON.stringify(res));
