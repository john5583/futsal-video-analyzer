// Pose depuis l'ellipse du rond (image de référence) : 5 degrés (distance, hauteur, cap, inclinaison, roulis), azimut libre fixé à 0
const L=require("./lib.js");const {W,H}=L;
const E=JSON.parse(L.fs.readFileSync("ells_m4.json","utf8"));
const REF=+process.argv[2]||30,FOV=+process.argv[3]||91;
const e=E[REF].e; // cx,cy,a(moitié axe1),b,ang  : cv2 renvoie (largeur,hauteur) => a=h-axe selon ang ; on teste par distance générique
function resid(Hm,ee){ // Hm : terrain->normalisé ; ee ellipse cv2 (cx,cy,A,B,ang) ; points du rond projetés
  const [cx,cy,A,B,ang]=ee,t=ang*Math.PI/180,c=Math.cos(t),s=Math.sin(t);let tot=0,n=0;
  for(let i=0;i<72;i++){const X=20+3*Math.cos(2*Math.PI*i/72),Y=10+3*Math.sin(2*Math.PI*i/72);
    const w=Hm[6]*X+Hm[7]*Y+Hm[8];if(w<=1e-6)return 1e3;const px=(Hm[0]*X+Hm[1]*Y+Hm[2])/w*L.F480+W/2,py=(Hm[3]*X+Hm[4]*Y+Hm[5])/w*L.F480+H/2;
    const dx=px-cx,dy=py-cy,u=c*dx+s*dy,v=-s*dx+c*dy;const r=Math.sqrt((u/A)**2+(v/B)**2);tot+=Math.abs(r-1)*Math.sqrt(A*B);n++;}
  return tot/n;}
const cost=(q,ee,fov)=>{const [d,h,dp,th,rho]=q;if(h<1.5||h>10||d<4||d>40||th<0.02||th>1.3)return 1e3;return resid(L.poseH([20-d,10,h,dp,th,rho],fov),ee);};
function nm(f,x0,step,it){const n=x0.length;let sx=[x0.slice()];for(let i=0;i<n;i++){const x=x0.slice();x[i]+=step[i];sx.push(x);}let fv=sx.map(f);
 for(let t=0;t<it;t++){const o=fv.map((v,i)=>i).sort((a,b)=>fv[a]-fv[b]);sx=o.map(i=>sx[i]);fv=o.map(i=>fv[i]);const c=Array(n).fill(0);for(let i=0;i<n;i++)for(let d=0;d<n;d++)c[d]+=sx[i][d]/n;
 const xr=c.map((v,d)=>v+(v-sx[n][d])),fr=f(xr);if(fr<fv[0]){const xe=c.map((v,d)=>v+2*(v-sx[n][d])),fe=f(xe);if(fe<fr){sx[n]=xe;fv[n]=fe;}else{sx[n]=xr;fv[n]=fr;}}else if(fr<fv[n-1]){sx[n]=xr;fv[n]=fr;}else{const xc=c.map((v,d)=>v+0.5*(sx[n][d]-v)),fc=f(xc);if(fc<fv[n]){sx[n]=xc;fv[n]=fc;}else{for(let i=1;i<=n;i++){sx[i]=sx[i].map((v,d)=>sx[0][d]+0.5*(v-sx[0][d]));fv[i]=f(sx[i]);}}}}
 const b=fv.indexOf(Math.min(...fv));return {x:sx[b],f:fv[b]};}
let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};const r=(a,b)=>a+(b-a)*rnd();
module.exports={cost,nm,r,rnd,resid,E};
if(require.main===module){
 const res=[];for(let s=0;s<300;s++){const q0=[r(5,30),r(2,8),r(-0.8,0.8),r(0.1,0.9),r(-0.1,0.1)];const o=nm(q=>cost(q,e,FOV),q0,[3,1,0.2,0.1,0.03],250);res.push(o);}
 res.sort((a,b)=>a.f-b.f);const seen=[];for(const o of res){if(seen.some(s=>Math.abs(s.x[0]-o.x[0])<0.5&&Math.abs(s.x[1]-o.x[1])<0.3))continue;seen.push(o);if(seen.length>=6)break;}
 for(const o of seen)console.log("dist %s haut %s cap %s incl %s roulis %s  résidu %s px",...o.x.map(v=>v.toFixed(2)),o.f.toFixed(2));
}
