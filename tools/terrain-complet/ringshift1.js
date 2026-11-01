// Pour chaque image : appui du rond projeté par G (δ=0) et meilleur décalage δ* (translation image) -> vérifié / à corriger / inconnu
const L=require("./lib.js");const {mul,inv,W,H}=L;const P=require("./pose1.js");
const Gf=process.argv[2]||"C:/Users/xboxl/AppData/Local/Temp/claude/C--Users-xboxl-Desktop-futsal-video-analyzer/6bb1eadf-3e66-4261-a8ec-8e4e399e41cf/scratchpad/glob/sgfull6.json";
const {G,verdict}=L.chargeG(Gf);const C=L.chargeCartes("m1",0.8);const REF=30,FOV=91;
let best=null;for(let s=0;s<150;s++){const q0=[P.r(8,16),P.r(2,6),P.r(0,0.8),P.r(0.3,0.8),P.r(-0.05,0.1)];const o=P.nm(q=>P.cost(q,P.E[REF].e,FOV),q0,[3,1,0.2,0.1,0.03],200);if(!best||o.f<best.f)best=o;}
const q=best.x,Hr=L.poseH([20-q[0],10,q[1],q[2],q[3],q[4]],FOV),Gri=inv(G[16*REF]);
function pts(j){const k=4*j,Hk=mul(mul(G[k],Gri),Hr),out=[];for(let i=0;i<72;i++){const X=20+3*Math.cos(2*Math.PI*i/72),Y=10+3*Math.sin(2*Math.PI*i/72),w=Hk[6]*X+Hk[7]*Y+Hk[8];if(w<=1e-6)continue;out.push([(Hk[0]*X+Hk[1]*Y+Hk[2])/w*L.F480+W/2,(Hk[3]*X+Hk[4]*Y+Hk[5])/w*L.F480+H/2]);}return out;}
function hitAt(j,p,dx,dy){let n=0,hit=0;const dt=C.dts[j];for(const [x,y] of p){const x2=x+dx,y2=y+dy;const d=L.sample(dt,x2,y2);if(d===null)continue;n++;if(d<=1.5)hit++;}return [n,hit];}
const rows=[];
for(let j=0;j<C.meta.n;j++){const k=4*j;if(k>=G.length)break;const p=pts(j);if(p.length<25){rows.push({j,t:j,v:verdict[k],cls:"hors"});continue;}
  const [n0,h0]=hitAt(j,p,0,0);let bs=-1,bdx=0,bdy=0;
  for(let dx=-320;dx<=320;dx+=2)for(let dy=-50;dy<=50;dy+=2){const [n,h]=hitAt(j,p,dx,dy);if(n<0.6*p.length)continue;const s=h/n;if(s>bs){bs=s;bdx=dx;bdy=dy;}}
  const s0=n0?h0/n0:0;let cls;
  if(s0>=0.45)cls="vérifié";else if(bs>=0.5&&(Math.abs(bdx)>4||Math.abs(bdy)>4)&&bs-s0>0.25)cls="décalé";else cls="inconnu";
  rows.push({j,t:j,v:verdict[k],cls,s0:+s0.toFixed(2),bs:+bs.toFixed(2),dx:bdx,dy:bdy,inview:p.length/72});}
const cnt={};rows.forEach(r=>cnt[r.cls]=(cnt[r.cls]||0)+1);console.log(JSON.stringify(cnt),"sur",rows.length);
console.log("décalées :",rows.filter(r=>r.cls==="décalé").map(r=>`${r.t}s(${r.dx},${r.dy};${r.s0}→${r.bs})`).join(" "));
console.log("inconnues :",rows.filter(r=>r.cls==="inconnu").map(r=>`${r.t}(${r.s0}/${r.bs})`).join(" "));
L.fs.writeFileSync("ringshift1_rows.json",JSON.stringify(rows));
