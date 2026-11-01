// Affine la pose du rond (5 degrés) sur TOUTES les images « vérifiées » (via G), puis refait l'audit
const L=require("./lib.js");const {mul,inv,W,H}=L;const P=require("./pose1.js");
const Gf=process.argv[2]||"C:/Users/xboxl/AppData/Local/Temp/claude/C--Users-xboxl-Desktop-futsal-video-analyzer/6bb1eadf-3e66-4261-a8ec-8e4e399e41cf/scratchpad/glob/sgfull6.json";
const {G,verdict}=L.chargeG(Gf);const C=L.chargeCartes("m1",0.8);const REF=30,FOV=91;
const rows0=JSON.parse(L.fs.readFileSync("ringshift1_rows.json","utf8"));
let best=null;for(let s=0;s<150;s++){const q0=[P.r(8,16),P.r(2,6),P.r(0,0.8),P.r(0.3,0.8),P.r(-0.05,0.1)];const o=P.nm(q=>P.cost(q,P.E[REF].e,FOV),q0,[3,1,0.2,0.1,0.03],200);if(!best||o.f<best.f)best=o;}
const Gri=inv(G[16*REF]);
const use=rows0.filter(r=>r.cls==="vérifié"||(r.cls==="décalé"&&r.bs>=0.6)).map(r=>r.j);
console.log("images pour l'ajustement",use.length);
function ptsOf(q,j){const Hr=L.poseH([20-q[0],10,q[1],q[2],q[3],q[4]],FOV),k=4*j,Hk=mul(mul(G[k],Gri),Hr),out=[];for(let i=0;i<72;i++){const X=20+3*Math.cos(2*Math.PI*i/72),Y=10+3*Math.sin(2*Math.PI*i/72),w=Hk[6]*X+Hk[7]*Y+Hk[8];if(w<=1e-6)continue;out.push([(Hk[0]*X+Hk[1]*Y+Hk[2])/w*L.F480+W/2,(Hk[3]*X+Hk[4]*Y+Hk[5])/w*L.F480+H/2]);}return out;}
function cost(q,set){if(q[1]<1.5||q[1]>10||q[0]<4||q[0]>40||q[3]<0.02||q[3]>1.3)return 1e3;let tot=0,n=0;for(const j of set){const p=ptsOf(q,j);if(p.length<40)continue;for(const [x,y] of p){const d=L.sample(C.dts[j],x,y);if(d===null)continue;tot+=Math.min(d,6);n++;}}return n?tot/n:1e3;}
const sub=use.filter((_,i)=>i%2===0);
const r1=P.nm(q=>cost(q,sub),best.x,[0.5,0.2,0.03,0.02,0.01],250);
const r2=P.nm(q=>cost(q,use),r1.x,[0.2,0.1,0.015,0.01,0.005],200);
console.log("avant",best.x.map(v=>v.toFixed(3)).join(" "),"coût",cost(best.x,use).toFixed(3));
console.log("après",r2.x.map(v=>v.toFixed(3)).join(" "),"coût",r2.f.toFixed(3));
L.fs.writeFileSync("ringpose_refined.json",JSON.stringify({q:r2.x,FOV,REF}));
// audit avec la pose affinée
const q=r2.x;let cnt={v:0,sh:0,inc:0,hors:0};const rows=[];
function hitAt(j,p,dx,dy){let n=0,hit=0;for(const [x,y] of p){const d=L.sample(C.dts[j],x+dx,y+dy);if(d===null)continue;n++;if(d<=1.5)hit++;}return [n,hit];}
for(let j=0;j<C.meta.n;j++){const k=4*j;if(k>=G.length)break;const p=ptsOf(q,j);if(p.length<25){rows.push({j,cls:"hors"});cnt.hors++;continue;}
  const [n0,h0]=hitAt(j,p,0,0);const s0=n0?h0/n0:0;let bs=-1,bdx=0,bdy=0;
  if(s0<0.45)for(let dx=-320;dx<=320;dx+=2)for(let dy=-50;dy<=50;dy+=2){const [n,h]=hitAt(j,p,dx,dy);if(n<0.6*p.length)continue;const s=h/n;if(s>bs){bs=s;bdx=dx;bdy=dy;}}
  let cls=s0>=0.45?"vérifié":(bs>=0.5&&bs-s0>0.25?"décalé":"inconnu");rows.push({j,cls,s0,bs,dx:bdx,dy:bdy,v:verdict[k]});if(cls==="vérifié")cnt.v++;else if(cls==="décalé")cnt.sh++;else cnt.inc++;}
console.log("audit pose affinée",JSON.stringify(cnt),"sur",rows.length);
const sh=rows.filter(r=>r.cls==="décalé");const big=sh.filter(r=>Math.hypot(r.dx,r.dy)>30);console.log("décalées",sh.length,"dont >30 px (480):",big.length,big.map(r=>r.j).join(" "));
L.fs.writeFileSync("ringshift2_rows.json",JSON.stringify(rows));
