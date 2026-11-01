// Pour chaque image (toutes les 4 s) : le rond projeté par G (pose du rond de l'image de référence) retombe-t-il sur du noir fort ?
const L=require("./lib.js");const {mul,inv,W,H}=L;const P=require("./pose1.js");
const Gf=process.argv[2]||"C:/Users/xboxl/AppData/Local/Temp/claude/C--Users-xboxl-Desktop-futsal-video-analyzer/6bb1eadf-3e66-4261-a8ec-8e4e399e41cf/scratchpad/glob/sgfull6.json";
const {G,verdict}=L.chargeG(Gf);const C=L.chargeCartes("m4",0.8);const REF=30,FOV=91;
let best=null;for(let s=0;s<150;s++){const q0=[P.r(8,16),P.r(2,6),P.r(0,0.8),P.r(0.3,0.8),P.r(-0.05,0.1)];const o=P.nm(q=>P.cost(q,P.E[REF].e,FOV),q0,[3,1,0.2,0.1,0.03],200);if(!best||o.f<best.f)best=o;}
const q=best.x,Hr=L.poseH([20-q[0],10,q[1],q[2],q[3],q[4]],FOV),Gri=inv(G[16*REF]);
const rows=[];
for(let j=0;j<C.meta.n;j++){const k=16*j;if(k>=G.length){break;}const Hk=mul(mul(G[k],Gri),Hr);let n=0,hit=0,tot=72;
  for(let i=0;i<tot;i++){const X=20+3*Math.cos(2*Math.PI*i/tot),Y=10+3*Math.sin(2*Math.PI*i/tot),w=Hk[6]*X+Hk[7]*Y+Hk[8];if(w<=1e-6)continue;const px=(Hk[0]*X+Hk[1]*Y+Hk[2])/w*L.F480+W/2,py=(Hk[3]*X+Hk[4]*Y+Hk[5])/w*L.F480+H/2;const d=L.sample(C.dts[j],px,py);if(d===null)continue;n++;if(d<=1.5)hit++;}
  rows.push({j,t:4*j,v:verdict[k],inview:n/tot,hit:n?hit/n:0});}
const trace=rows.filter(r=>r.v==="ok"||r.v==="pont");
const testable=trace.filter(r=>r.inview>=0.5);
const bon=testable.filter(r=>r.hit>=0.3),mauv=testable.filter(r=>r.hit<0.3);
console.log("images 4 s:",rows.length,"; tracées (ok/pont):",trace.length,"; rond dans l'image ≥50 % :",testable.length,"; confirmées par le rond (≥30 % des points sur noir fort):",bon.length,"; contredites:",mauv.length);
console.log("contredites (t):",mauv.map(r=>r.t).join(" "));
console.log("rond hors image (non testables):",trace.length-testable.length);
L.fs.writeFileSync("ringaudit_rows.json",JSON.stringify(rows));
