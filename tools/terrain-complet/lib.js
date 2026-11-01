// Outils communs : chargement de G, cartes noires, transformée en distance, pose -> homographie, projection
const fs=require("fs");
const R="C:/Users/xboxl/Desktop/futsal-trace/src/ai/";
const HG=require(R+"homography"),SG=require(R+"sol-global"),CF=require(R+"court-fit");
const W=480,H=270,Nm=SG.Nm,Ni=HG.invert(Nm),F480=SG.F480;
const mul=HG.mul3,inv=HG.invert;
function chargeG(f){const g=JSON.parse(fs.readFileSync(f,"utf8"));return {G:g.G,verdict:g.verdict};}
function chargeCartes(pref,thr){
  const meta=JSON.parse(fs.readFileSync(pref+"_meta.json","utf8"));
  const b=fs.readFileSync(pref+"_noir.bin"),m=new Float32Array(b.buffer,b.byteOffset,b.length/4);
  const s=fs.readFileSync(pref+"_sol.bin");
  const dts=[];
  for(let k=0;k<meta.n;k++){const mask=new Uint8Array(W*H);for(let i=0;i<W*H;i++)mask[i]=m[k*W*H+i]>=thr?1:0;dts.push(CF.distanceTransform(mask,W,H));}
  return {meta,m,sol:s,dts};
}
// pose caméra -> homographie terrain(m) -> normalisé ; fov en degrés
function poseH(p,fov){
  const [cx,cy,h,psi,th,rho]=p, s=Math.tan(45.5*Math.PI/180)/Math.tan(fov*Math.PI/360);
  const f=[Math.cos(th)*Math.cos(psi),Math.cos(th)*Math.sin(psi),-Math.sin(th)];
  let rt=[Math.sin(psi),-Math.cos(psi),0];
  let dn=[f[1]*rt[2]-f[2]*rt[1],f[2]*rt[0]-f[0]*rt[2],f[0]*rt[1]-f[1]*rt[0]];
  const c=Math.cos(rho),sn=Math.sin(rho);
  const rt2=rt.map((v,i)=>c*v+sn*dn[i]),dn2=dn.map((v,i)=>-sn*rt[i]+c*dn[i]);
  const C=[cx,cy,h],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const M=[rt2[0],rt2[1],-dot(rt2,C),dn2[0],dn2[1],-dot(dn2,C),f[0],f[1],-dot(f,C)];
  return [s*M[0],s*M[1],s*M[2],s*M[3],s*M[4],s*M[5],M[6],M[7],M[8]];
}
const pixN=(x,y)=>[(x-W/2)/F480,(y-H/2)/F480];
function sample(dt,x,y){const xi=Math.round(x),yi=Math.round(y);if(xi<1||yi<1||xi>=W-1||yi>=H-1)return null;return dt[yi*W+xi]/3;}
module.exports={fs,HG,SG,CF,W,H,Nm,Ni,F480,mul,inv,chargeG,chargeCartes,poseH,sample,pixN};
