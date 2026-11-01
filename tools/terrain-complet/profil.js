// Profil d'appui des traits noirs le long d'une droite parallèle à la médiane (ΔX = ±d), pour d de 6 à 14 m ; et le long d'une parallèle au grand axe
const L=require("./lib.js");const {mul,inv,W,H}=L;const P=require("./pose1.js");
const S="C:/Users/xboxl/AppData/Local/Temp/claude/C--Users-xboxl-Desktop-futsal-video-analyzer/6bb1eadf-3e66-4261-a8ec-8e4e399e41cf/scratchpad/glob/sgfull6.json";
const {G,verdict}=L.chargeG(S);const C=L.chargeCartes("m4",0.5);
const REF=30,FOV=91;let best=null;for(let s=0;s<150;s++){const q0=[P.r(8,16),P.r(2,6),P.r(0,0.8),P.r(0.3,0.8),P.r(-0.05,0.1)];const o=P.nm(q=>P.cost(q,P.E[REF].e,FOV),q0,[3,1,0.2,0.1,0.03],200);if(!best||o.f<best.f)best=o;}
const q=best.x,Hr=L.poseH([20-q[0],10,q[1],q[2],q[3],q[4]],FOV),Gri=inv(G[16*REF]);
function support(line,j){const k=16*j;if(k>=G.length||!(verdict[k]==="ok"||verdict[k]==="pont"))return null;
  const Hk=mul(mul(G[k],Gri),Hr),dt=C.dts[j];let vis=0,hit=0;
  for(const [dx,dy] of line){const X=20+dx,Y=10+dy,w=Hk[6]*X+Hk[7]*Y+Hk[8];if(w<=1e-6)continue;
    const px=(Hk[0]*X+Hk[1]*Y+Hk[2])/w*L.F480+W/2,py=(Hk[3]*X+Hk[4]*Y+Hk[5])/w*L.F480+H/2;
    const d=L.sample(dt,px,py);if(d===null)continue;
    // le point doit être sur le sol dans l'image (masque sol) pour compter
    const xi=Math.round(px),yi=Math.round(py);if(!C.sol[j*W*H+yi*W+xi])continue;
    vis++;if(d<=1.5)hit++;}
  return {vis,hit};}
const N=+process.argv[2]||0; // 0: parallèle à la médiane (ΔX = ±d, ΔY de -9 à 9) ; 1: ΔY=±d (ΔX de -9 à 9)
function prof(sign,dArr,axis){const out=[];for(const d of dArr){let vis=0,hit=0;const line=[];for(let u=-9;u<=9;u+=0.15)line.push(axis===0?[sign*d,u]:[u,sign*d]);
  for(let j=0;j<C.meta.n;j++){const s=support(line,j);if(s){vis+=s.vis;hit+=s.hit;}}out.push([d,vis,hit]);}return out;}
const ds=[];for(let d=5;d<=26;d+=0.25)ds.push(d);
for(const axis of [0,1])for(const sign of [-1,1]){const p=prof(sign,axis===0?ds.filter(d=>d<=14):ds.filter(d=>d>=14),axis);
  console.log(`axe ${axis===0?"ΔX (parallèles à la médiane...)":"ΔY (parallèles au grand axe)"}, signe ${sign}`);
  console.log(p.filter((_,i)=>i%2===0).map(([d,v,h])=>`${d.toFixed(2)}:${v?(h/v).toFixed(2):"-"}(${v})`).join("  "));}
