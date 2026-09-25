/* Home-only crop hints. Work on a tiny canvas once per image/ratio and keep the
   result locally; never delay image display or rerun detection while scrolling. */
const HOME_CROP_CACHE_KEY='breeze.home-crop.v2';
const homeCropJobs=new Map();
const homeCropWaiting=new WeakMap();
const homeCropObserver=typeof IntersectionObserver==='function'
  ?new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
      homeCropObserver.unobserve(entry.target);
      const run=homeCropWaiting.get(entry.target);homeCropWaiting.delete(entry.target);run?.();
    }
  },{rootMargin:'180px'}):null;
let homeCropCache=null;
function homeCropEntries(){
  if(homeCropCache)return homeCropCache;
  try{homeCropCache=JSON.parse(localStorage.getItem(HOME_CROP_CACHE_KEY)||'{}')||{};}
  catch(e){homeCropCache={};}
  return homeCropCache;
}
function homeCropStore(key,value){
  const cache=homeCropEntries();cache[key]=value;
  const keys=Object.keys(cache);
  for(const old of keys.slice(0,Math.max(0,keys.length-160)))delete cache[old];
  try{localStorage.setItem(HOME_CROP_CACHE_KEY,JSON.stringify(cache));}catch(e){}
}
function homeCropPosition(boxes,w,h,ratio){
  if(!boxes.length||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||!Number.isFinite(ratio)||ratio<=0)return null;
  boxes=boxes.filter(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0);
  if(!boxes.length)return null;
  const left=Math.min(...boxes.map(b=>b.x)),right=Math.max(...boxes.map(b=>b.x+b.width));
  const top=Math.min(...boxes.map(b=>b.y)),bottom=Math.max(...boxes.map(b=>b.y+b.height));
  const focusX=(left+right)/2/w,focusY=(top+bottom)/2/h;
  const visibleW=Math.min(w,h*ratio),visibleH=Math.min(h,w/ratio);
  const cropX=Math.max(0,Math.min(w-visibleW,focusX*w-visibleW/2));
  const cropY=Math.max(0,Math.min(h-visibleH,focusY*h-visibleH/2));
  // Preserve known subjects before cosmetic centering.
  const x=w>visibleW?Math.max(0,Math.min(1,cropX/(w-visibleW))):.5;
  const y=h>visibleH?Math.max(0,Math.min(1,cropY/(h-visibleH))):.5;
  return {x,y,fit:right-left>visibleW||bottom-top>visibleH?'contain':'cover',focalX:focusX,focalY:focusY};
}
async function homeCropAnalyze(image,ratio){
  const w=image.naturalWidth,h=image.naturalHeight;
  if(w<60||h<60)return null;
  const Detector=globalThis['FaceDetector'];
  if(typeof Detector==='function'){
    try{
      const faces=await new Detector({fastMode:true,maxDetectedFaces:8}).detect(image);
      if(faces.length){
        const boxes=faces.map(face=>{
          const b=face.boundingBox,pad=Math.max(b.width,b.height)*.2;
          return {x:Math.max(0,b.x-pad),y:Math.max(0,b.y-pad),
            width:Math.min(w-b.x+pad,b.width+pad*2),height:Math.min(h-b.y+pad,b.height+pad*2)};
        });
        return homeCropPosition(boxes,w,h,ratio);
      }
    }catch(e){} // Unsupported or cross-origin image: use the bounded fallback.
  }
  try{
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=Math.max(48,Math.round(96*h/w));
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const {data}=context.getImageData(0,0,canvas.width,canvas.height);
    const cell=8,cols=Math.ceil(canvas.width/cell),rows=Math.ceil(canvas.height/cell);
    const scores=[];
    for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++){
      let score=0;
      for(let y=cy*cell+1;y<Math.min((cy+1)*cell,canvas.height-1);y+=2)
        for(let x=cx*cell+1;x<Math.min((cx+1)*cell,canvas.width-1);x+=2){
          const i=(y*canvas.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
          const right=i+4,below=i+canvas.width*4;
          const edge=Math.abs(r-data[right])+Math.abs(g-data[right+1])+Math.abs(b-data[right+2])
            +Math.abs(r-data[below])+Math.abs(g-data[below+1])+Math.abs(b-data[below+2]);
          // Skin tones and local detail help portraits; saturation helps other subjects.
          const skin=r>70&&g>40&&b>20&&r>g&&g>b&&(r-b)>22;
          score+=Math.min(edge,220)+(skin?32:0)+Math.max(r,g,b)-Math.min(r,g,b);
        }
      scores.push({x:cx*cell,y:cy*cell,score});
    }
    const ranked=[...scores].sort((a,b)=>b.score-a.score).slice(0,Math.max(2,Math.ceil(scores.length*.12)));
    const total=ranked.reduce((sum,item)=>sum+item.score,0);
    if(!total)return null;
    const x=ranked.reduce((sum,item)=>sum+(item.x+cell/2)*item.score,0)/total/canvas.width;
    const y=ranked.reduce((sum,item)=>sum+(item.y+cell/2)*item.score,0)/total/canvas.height;
    return homeCropPosition([{x:x*w-1,y:y*h-1,width:2,height:2}],w,h,ratio);
  }catch(e){return null;} // A tainted cross-origin canvas keeps the center crop.
}
function homeSmartCrop(image,key,ratio,recover){
  if(!image||!key)return;
  const cacheKey=key+'|'+ratio,cache=homeCropEntries();
  const apply=result=>{
    if(image.isConnected&&result?.x!=null){image.style.objectPosition=`${result.x*100}% ${result.y*100}%`;image.style.objectFit=result.fit==='contain'?'contain':'cover';}
  };
  if(Object.prototype.hasOwnProperty.call(cache,cacheKey)){apply(cache[cacheKey]);return;}
  const run=()=>{
    if(!homeCropJobs.has(cacheKey))homeCropJobs.set(cacheKey,homeCropAnalyze(image,ratio).then(async result=>{
      if(!result&&recover){
        const blob=await recover().catch(()=>null);
        if(blob){
          const local=URL.createObjectURL(blob),copy=new Image();
          try{copy.src=local;await copy.decode();result=await homeCropAnalyze(copy,ratio);}
          catch(e){}finally{URL.revokeObjectURL(local);}
        }
      }
      homeCropStore(cacheKey,result);return result;
    }).finally(()=>homeCropJobs.delete(cacheKey)));
    homeCropJobs.get(cacheKey).then(apply);
  };
  const schedule=()=>{
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:1800});
    else setTimeout(run,0);
  };
  if(homeCropObserver){homeCropWaiting.set(image,schedule);homeCropObserver.observe(image);}
  else schedule();
}
