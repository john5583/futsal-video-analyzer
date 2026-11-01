// Correction image par image : similitude 2D (tx,ty,échelle,angle) appliquée à la projection de G pour que le rond tombe sur le rond noir
const L=require("./lib.js");const {mul,inv,W,H}=L;const P=require("./pose1.js");
const Gf="C:/Users/xboxl/AppData/Local/Temp/claude/C--Users-xboxl-Desktop-futsal-video-analyzer/6bb1eadf-3e66-4261-a8ec-8e4e399e41cf/scratchpad/glob/sgfull6.json";
const {G,verdict}=L.chargeG(Gf);const C=L.chargeCartes("m1",0.8);
const {q,FOV,REF}=JSON.parse(L.fs.readFileSync("ringpose_refined.json","utf8"));
const Hr=L.poseH([20-q[0],10,q[1],q[2],q[3],q[4]],FOV),Gri=inv(G[16*REF]);
const rows0=JSON.parse(L.fs.readFileSync("ringshift2_rows.json","utf8"));
function basePts(j){const k=4*j,Hk=mul(mul(G[k],Gri),Hr),out=[];for(let i=0;i<72;i++){const X=20+3*Math.cos(2*Math.PI*i/72),Y=10+3*Math.sin(2*Math.PI*i/72),w=Hk[6]*X+Hk[7]*Y+Hk[8];if(w<=1e-6)continue;out.push([(Hk[0]*X+Hk[1]*Y+Hk[2])/w*L.F480+W/2,(Hk[3]*X+Hk[4]*Y+Hk[5])/w*L.F480+H/2]);}return out;}
function tf(p,x0,y0,s,a,tx,ty){const c=Math.cos(a),sn=Math.sin(a);return p.map(([x,y])=>{const u=x-x0,v=y-y0;return [x0+s*(c*u-sn*v)+tx,y0+s*(sn*u+c*v)+ty];});}
function score(j,p){let n=0,hit=0,tot=0;for(const [x,y] of p){const d=L.sample(C.dts[j],x,y);if(d===null)continue;n++;tot+=Math.min(d,6);if(d<=1.5)hit++;}return [n,hit,tot];}
const out=[];let cnt={};
for(const r of rows0){const j=r.j;if(r.cls==="hors"){out.push({j,cls:"hors"});continue;}
  const p=basePts(j);const cx=p.reduce((a,b)=>a+b[0],0)/p.length,cy=p.reduce((a,b)=>a+b[1],0)/p.length;
  let best={f:1e9};const f=(v)=>{const [s,a,tx,ty]=v;if(s<0.7||s>1.4||Math.abs(a)>0.4)return 1e3;const pp=tf(p,cx,cy,s,a,tx,ty);const [n,h,t]=score(j,pp);if(n<0.6*p.length)return 1e3;return t/n;};
  // départs : sans décalage, et décalage δ trouvé par l'audit
  const starts=[[1,0,0,0]];if(r.cls==="décalé")starts.push([1,0,r.dx,r.dy]);
  if(r.cls==="inconnu"&&r.bs>0.3)starts.push([1,0,r.dx,r.dy]);
  for(const s0 of starts){const o=P.nm(f,s0,[0.03,0.02,6,3],160);if(o.f<best.f)best={f:o.f,x:o.x};}
  const pp=tf(p,cx,cy,best.x[0],best.x[1],best.x[2],best.x[3]);const [n,h]=score(j,pp);const s1=n?h/n:0;
  const mv=Math.hypot(best.x[2],best.x[3]);
  const cls=s1>=0.5?(mv<=3&&Math.abs(best.x[0]-1)<0.02?"vérifié":"corrigé"):"inconnu";
  cnt[cls]=(cnt[cls]||0)+1;out.push({j,cls,s1:+s1.toFixed(2),corr:best.x.map(v=>+v.toFixed(3)),mv:+mv.toFixed(1),v:verdict[4*j]});}
console.log(JSON.stringify(cnt),"sur",out.length);
const c=out.filter(o=>o.cls==="corrigé");console.log("corrigées : décalage médian",c.map(o=>o.mv).sort((a,b)=>a-b)[c.length>>1],"px (480) ; >30 px :",c.filter(o=>o.mv>30).length);
L.fs.writeFileSync("ringfix_rows.json",JSON.stringify(out));
