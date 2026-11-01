// Largeur et position des buts (cadres confirmés par John) dans le repère du terrain posé par le rond, pour plusieurs champs de vision
const L=require("./lib.js");const {mul,inv,W,H,Nm,Ni}=L;const P=require("./pose1.js");
const S="C:/Users/xboxl/AppData/Local/Temp/claude/C--Users-xboxl-Desktop-futsal-video-analyzer/6bb1eadf-3e66-4261-a8ec-8e4e399e41cf/scratchpad/glob/sgfull6.json";
const {G,verdict}=L.chargeG(S);const REF=30;const e0=P.E[REF].e;
const D="C:/Users/xboxl/futsal-entrainement/etiquetage-buts/images/";
const goals=[];for(const f of L.fs.readdirSync(D)){const m=f.match(/^V7_212111_(\d+)\.txt$/);if(!m)continue;const t=+m[1]/10;
  const txt=L.fs.readFileSync(D+f,"utf8").trim();if(!txt)continue;
  for(const line of txt.split(/\n/)){const [c,cx,cy,w,h]=line.trim().split(/\s+/).map(Number);if(!(w>0))continue;goals.push({t,x0:(cx-w/2)*1920,x1:(cx+w/2)*1920,y1:(cy+h/2)*1080,cy:cy*1080,h:h*1080,w:w*1920});}}
console.log("buts étiquetés",goals.length);
for(const fov of [60,70,80,85,91,95,100,110]){
  let best=null;for(let s=0;s<150;s++){const q0=[P.r(8,16),P.r(2,6),P.r(0,0.8),P.r(0.3,0.8),P.r(-0.05,0.1)];const o=P.nm(q=>P.cost(q,e0,fov),q0,[3,1,0.2,0.1,0.03],200);if(!best||o.f<best.f)best=o;}
  const q=best.x,Hr=L.poseH([20-q[0],10,q[1],q[2],q[3],q[4]],fov),Hri=inv(Hr),Gr=inv(G[16*REF]);
  const toCourt=(t,px,py)=>{const k=Math.round(4*t);if(k>=G.length||!(verdict[k]==="ok"||verdict[k]==="pont"))return null;
    const nk=L.pixN(px/4,py/4);const Gki=inv(G[k]);const nr=L.HG.apply(mul(Gr?inv(Gr):Gr,Gki)?mul(inv(Gr),Gki):Gki,nk[0],nk[1]);
    return L.HG.apply(Hri,nr[0],nr[1]);};
  const rows=[];for(const g of goals){const a=toCourt(g.t,g.x0,g.y1),b=toCourt(g.t,g.x1,g.y1);if(!a||!b)continue;
    const wd=Math.hypot(a[0]-b[0],a[1]-b[1]),cxm=(a[0]+b[0])/2,cym=(a[1]+b[1])/2;rows.push({t:g.t,wd,cx:cxm-20,cy:cym-10,r:Math.hypot(cxm-20,cym-10),ang:Math.atan2(cym-10,cxm-20)*180/Math.PI});}
  const w=rows.map(r=>r.wd).sort((x,y)=>x-y);
  console.log(`FOV ${fov}° : résidu rond ${best.f.toFixed(2)}, dist ${q[0].toFixed(1)} haut ${q[1].toFixed(1)}; ${rows.length} buts utilisables; largeur médiane ${w[w.length>>1].toFixed(2)} m, q25 ${w[w.length>>2].toFixed(2)} q75 ${w[3*w.length>>2].toFixed(2)}`);
  if(fov===91)for(const r of rows)console.log("  t",r.t,"largeur",r.wd.toFixed(2),"centre ΔX",r.cx.toFixed(1),"ΔY",r.cy.toFixed(1),"dist",r.r.toFixed(1),"angle",r.ang.toFixed(0));
}
