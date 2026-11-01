// Cartes de traits NOIRS (480x270) pour une image toutes les 4 s : maps_noir.bin (Float32, n x 480x270) + masque sol
const cp=require("child_process"),fs=require("fs");
const R="C:/Users/xboxl/Desktop/futsal-trace/src/ai/";
const CF=require(R+"court-fit"),SG=require(R+"sol-global");
const video=process.argv[2],out=process.argv[3],T=+process.argv[4]||830,DT=+process.argv[5]||4;
const W=480,H=270,FS=W*H*4;
const ff=cp.spawnSync("ffmpeg",["-v","error","-t",String(T),"-i",video,"-vf",`fps=1/${DT},scale=${W}:${H}`,"-f","rawvideo","-pix_fmt","rgba","-"],{maxBuffer:1e9});
const n=Math.floor(ff.stdout.length/FS);console.log("images",n);
const maps=new Float32Array(n*W*H), fl=new Uint8Array(n*W*H);
for(let k=0;k<n;k++){
  const rgba=ff.stdout.subarray(k*FS,(k+1)*FS);
  const work=CF.prepare({data:rgba,width:W,height:H},W), rm=CF.ridgeMap(work,"black");
  const fm=SG.masqueSolBleu(rgba,W,H);
  for(let i=0;i<W*H;i++){maps[k*W*H+i]=fm[i]?rm.R[i]:0; fl[k*W*H+i]=fm[i];}
}
fs.writeFileSync(out+"_noir.bin",Buffer.from(maps.buffer));fs.writeFileSync(out+"_sol.bin",Buffer.from(fl.buffer));
fs.writeFileSync(out+"_meta.json",JSON.stringify({n,W,H,DT}));
