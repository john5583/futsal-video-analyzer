// pixel (1920x1080) à l'instant t -> coordonnées du terrain (repère du rond), FOV donné
const L=require("./lib.js");const {mul,inv}=L;const P=require("./pose1.js");
const S="C:/Users/xboxl/AppData/Local/Temp/claude/C--Users-xboxl-Desktop-futsal-video-analyzer/6bb1eadf-3e66-4261-a8ec-8e4e399e41cf/scratchpad/glob/sgfull6.json";
const {G}=L.chargeG(S);const REF=30,FOV=+process.argv[2]||91;
let best=null;for(let s=0;s<150;s++){const q0=[P.r(8,16),P.r(2,6),P.r(0,0.8),P.r(0.3,0.8),P.r(-0.05,0.1)];const o=P.nm(q=>P.cost(q,P.E[REF].e,FOV),q0,[3,1,0.2,0.1,0.03],200);if(!best||o.f<best.f)best=o;}
const q=best.x,Hr=L.poseH([20-q[0],10,q[1],q[2],q[3],q[4]],FOV),Hri=inv(Hr),Gri=inv(G[16*REF]);
function toCourt(t,px,py){const k=Math.round(4*t),nk=L.pixN(px/4,py/4),nr=L.HG.apply(mul(Gri.map?inv(Gri):0,inv(G[k])),nk[0],nk[1]);const c=L.HG.apply(Hri,nr[0],nr[1]);return [c[0]-20,c[1]-10];}
function toPix(t,X,Y){const k=Math.round(4*t),n=L.HG.apply(mul(G[k],Gri.length?inv(G[16*REF]):0),0,0);return null;}
module.exports={toCourt,Hr,q};
if(require.main===module){const args=process.argv.slice(3);for(let i=0;i+2<args.length+0;i+=3){const t=+args[i],x=+args[i+1],y=+args[i+2];const c=toCourt(t,x,y);console.log(`t=${t} pixel(${x},${y}) -> ΔX ${c[0].toFixed(2)} ΔY ${c[1].toFixed(2)}`);}}
