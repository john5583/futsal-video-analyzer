/* Écart (px, échelle 1920) entre des points de la ligne médiane de 20261019_212111 lus à la main sur l'image (instants 71, 110, 160, 210 s) et la ligne médiane du modèle projetée par un suivi de caméra (sortie de FutsalPipeline.suiviCamera). Usage : node scripts/mesure/terrain-ligne-mediane.js suivi.json */
const fs=require("fs"),HG=require("../../src/ai/homography");
const GT={71:[[1237,300],[1228,400],[1218,500],[1214,550]],110:[[1236,280],[1230,380],[1224,460]],160:[[1072,220],[1068,300],[1066,400],[1064,480]],210:[[1395,350],[1385,400],[1375,450],[1362,490]],
  /* 2026-10-29 : instants où John voit un tracé faux (lus à la main sur l'image 1920×1080, ± 5 px ; la ligne médiane y est noire, jaune, rouge puis noire sur une même droite) */
  431:[[1188,250],[1174,400],[1160,550],[1147,700]],
  442:[[340,300],[393,450],[446,600],[516,800],[586,1000]],
  516:[[1809,250],[1750,400],[1691,550],[1632,700],[1593,800]]};
const [f,L,W]=[process.argv[2],40,20];const d=JSON.parse(fs.readFileSync(f,"utf8")),r=d.r;
const VW=1920,VH=1080;
function ligne(h){ // ligne médiane x=20, y 0..20 -> pixels 1920
  const Hi=HG.invert(h),pts=[];for(let y=-5;y<=25;y+=0.25){const p=HG.apply(Hi,L/2,y);pts.push([p[0]*VW,p[1]*VH]);}return pts;}
function dist(p,poly){let best=1e9;for(let i=1;i<poly.length;i++){const[a,b]=[poly[i-1],poly[i]],vx=b[0]-a[0],vy=b[1]-a[1],l2=vx*vx+vy*vy;let t=l2?((p[0]-a[0])*vx+(p[1]-a[1])*vy)/l2:0;t=Math.max(0,Math.min(1,t));const q=[a[0]+t*vx,a[1]+t*vy];best=Math.min(best,Math.hypot(p[0]-q[0],p[1]-q[1]));}return best;}
const out=[];let all=[];
Object.keys(GT).forEach(ts=>{const t=+ts;let fr=r.frames.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
  if(Math.abs(fr.t-t)>0.5){out.push(t+" s : pas d'image de suivi");return;}
  const poly=ligne(fr.h),e=GT[ts].map(p=>dist(p,poly));all=all.concat(e);out.push(t+" s (q="+fr.q+") : "+e.map(x=>x.toFixed(0)).join(" ")+" px, moyenne "+(e.reduce((a,b)=>a+b,0)/e.length).toFixed(0));});
console.log(out.join("\n"));console.log("TOUS : moyenne",(all.reduce((a,b)=>a+b,0)/all.length).toFixed(1),"px, max",Math.max(...all).toFixed(0),"px sur",all.length,"points ; lignes essais/acceptés",r.lignes&&r.lignes.essais,"/",r.lignes&&r.lignes.acceptes);
