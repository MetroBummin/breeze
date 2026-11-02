/* Page-coordinate geometry only; never reads or mutates the DOM or stored ink. */
const BreezeInkGeometry = (()=>{
  const epsilon=1e-8;
  const strokeBounds=new WeakMap();
  // Display text only. Two decimals of a PDF unit is far below a device pixel;
  // stored stroke points keep full precision.
  const round2=v=>Math.round(v*100)/100;
  const svgPoint=p=>round2(p[0])+','+round2(p[1]);
  // Stored `pressure` is the effective pressure after the sensitivity curve,
  // so a later sensitivity change never alters saved strokes. Only a pen
  // varies width. A saved pencil stroke stays at its stored width.
  // A normal Apple Pencil force of about 0.1–0.4 becomes effective pressure
  // near 0.32–0.65 after the sqrt map. The selected width is the floor.
  // The previous 0.3+1.4e curve put that width at 0.5, so ordinary writing
  // rendered thinner than the constant-width pen from before 필압.
  const penWidthFactor=e=>1+1.05*Math.max(0,(e??0.5)-0.32);
  const pressured=stroke=>Array.isArray(stroke.pressure)&&(stroke.tool===undefined||stroke.tool==='pen');
  function widthAt(stroke,i){
    return pressured(stroke)?stroke.width*penWidthFactor(stroke.pressure[i]??0.5):stroke.width;
  }
  function circleInterval(p,q,center,radius){
    const dx=q[0]-p[0],dy=q[1]-p[1],x=p[0]-center[0],y=p[1]-center[1];
    const a=dx*dx+dy*dy,c=x*x+y*y-radius*radius;
    if(a<epsilon)return c<0?[0,1]:null;
    const b=2*(x*dx+y*dy),disc=b*b-4*a*c;
    if(disc<=0)return null;
    const root=Math.sqrt(disc),lo=Math.max(0,(-b-root)/(2*a)),hi=Math.min(1,(-b+root)/(2*a));
    return hi-lo>epsilon?[lo,hi]:null;
  }
  function capsuleInterval(p,q,a,b,radius){
    const intervals=[circleInterval(p,q,a,radius),circleInterval(p,q,b,radius)].filter(Boolean);
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length>epsilon){
      const local=v=>[(v[0]-a[0])*dx/length+(v[1]-a[1])*dy/length,
        -(v[0]-a[0])*dy/length+(v[1]-a[1])*dx/length];
      const start=local(p),end=local(q),bounds=[[0,length],[-radius,radius]];
      let lo=0,hi=1;
      for(let axis=0;axis<2;axis++){
        const delta=end[axis]-start[axis],[min,max]=bounds[axis];
        if(Math.abs(delta)<epsilon){if(start[axis]<min||start[axis]>max){hi=-1;break;}}
        else{
          const t1=(min-start[axis])/delta,t2=(max-start[axis])/delta;
          lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
        }
      }
      if(hi-lo>epsilon)intervals.push([lo,hi]);
    }
    // A capsule is convex: all intersected intervals form one contiguous cut.
    return intervals.length?[Math.min(...intervals.map(i=>i[0])),Math.max(...intervals.map(i=>i[1]))]:null;
  }
  function eraseStroke(stroke,a,b,radius){
    const points=stroke.points,pressure=pressured(stroke)||Array.isArray(stroke.pressure)?stroke.pressure:null;
    let bounds=strokeBounds.get(stroke);
    if(!bounds){
      bounds=[Infinity,Infinity,-Infinity,-Infinity,0];
      points.forEach((p,i)=>{bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);bounds[4]=Math.max(bounds[4],widthAt(stroke,i));});
      strokeBounds.set(stroke,bounds);
    }
    const r=radius+bounds[4]/2;
    if(bounds[2]<Math.min(a[0],b[0])-r||bounds[0]>Math.max(a[0],b[0])+r
      ||bounds[3]<Math.min(a[1],b[1])-r||bounds[1]>Math.max(a[1],b[1])+r)return [stroke];
    if(points.length===1)return capsuleInterval(points[0],points[0],a,b,r)?[]:[stroke];
    const chunks=[];let current=[],currentPressure=[],changed=false;
    const add=(p,e)=>{
      const last=current.at(-1);
      if(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>epsilon){current.push(p);if(pressure)currentPressure.push(e);}
    };
    const finish=()=>{
      if(current.length)chunks.push(pressure?{...stroke,points:current,pressure:currentPressure}:{...stroke,points:current});
      current=[];currentPressure=[];
    };
    for(let i=1;i<points.length;i++){
      const p=points[i-1],q=points[i],segment=radius+Math.max(widthAt(stroke,i-1),widthAt(stroke,i))/2;
      const cut=capsuleInterval(p,q,a,b,segment),ep=pressure?.[i-1],eq=pressure?.[i];
      if(!cut){add(p,ep);add(q,eq);continue;}
      changed=true;
      const at=t=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
      const pressureAt=t=>pressure?round2(ep+(eq-ep)*t):undefined;
      if(cut[0]>epsilon){add(p,ep);add(at(cut[0]),pressureAt(cut[0]));}
      finish();
      if(cut[1]<1-epsilon){add(at(cut[1]),pressureAt(cut[1]));add(q,eq);}
    }
    if(!changed)return [stroke];
    finish();return chunks;
  }
  // Incremental midpoint quadratics. Only the unsettled tail changes when a
  // sample arrives; the visible tip always reaches the latest real sample.
  // Flatten once in PDF coordinates, then display/save/erase the SAME points.
  // Optional per-point pressure follows the same curve (de Casteljau).
  function createCurve(first,firstPressure){
    const points=[first.slice()],pressures=firstPressure==null?null:[round2(firstPressure)];
    let previous=null,last=first.slice(),lastPressure=firstPressure,text=svgPoint(first);
    const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
    function append(p,e){
      const end=points.at(-1);
      if(Math.hypot(p[0]-end[0],p[1]-end[1])<=epsilon)return;
      points.push(p);text+=' '+svgPoint(p);
      if(pressures)pressures.push(round2(e));
    }
    function flatten(a,b,c,e,depth=0){
      // The quadratic's departure from its chord is bounded by half the
      // control-point distance. 0.04 PDF units is below a pixel at reader zoom.
      const dx=c[0]-a[0],dy=c[1]-a[1],length=Math.hypot(dx,dy);
      const deviation=length?Math.abs(dx*(b[1]-a[1])-dy*(b[0]-a[0]))/length:Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(deviation<=0.08||depth>=10){append(c,e?.[2]);return;}
      const ab=midpoint(a,b),bc=midpoint(b,c),center=midpoint(ab,bc);
      const ea=e&&[e[0],(e[0]+e[1])/2,((e[0]+e[1])/2+(e[1]+e[2])/2)/2],eb=e&&[ea[2],(e[1]+e[2])/2,e[2]];
      flatten(a,ab,center,ea,depth+1);flatten(center,bc,c,eb,depth+1);
    }
    return {
      points,pressures,
      get last(){return last;},
      get lastPressure(){return lastPressure;},
      setFirstPressure(e){if(pressures&&points.length===1){pressures[0]=round2(e);lastPressure=e;}},
      add(p,e){
        if(Math.hypot(p[0]-last[0],p[1]-last[1])<=epsilon)return;
        p=p.slice();
        if(previous){
          const a=[last[0]-previous[0],last[1]-previous[1]],b=[p[0]-last[0],p[1]-last[1]];
          const dot=a[0]*b[0]+a[1]*b[1],length=Math.hypot(...a)*Math.hypot(...b);
          const end=midpoint(last,p),endPressure=pressures?(lastPressure+e)/2:undefined;
          // Preserve deliberate corners/reversals instead of rounding letters
          // such as ㄱ into arcs. Quadratics stay inside the input convex hull.
          if(dot<=0.25*length){append(last,lastPressure);append(end,endPressure);}
          else flatten(points.at(-1),last,end,pressures?[pressures.at(-1),lastPressure,endPressure]:null);
        }
        previous=last;last=p;lastPressure=e;
      },
      text(){return text;},
      finish(){append(last,lastPressure);}
    };
  }
  const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  function turn(u,v){
    const lu=Math.hypot(...u),lv=Math.hypot(...v);
    if(lu<epsilon||lv<epsilon)return 0;
    return Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(lu*lv))))*180/Math.PI;
  }
  // Direction of the stroke body just before index `end`, over at least `span`.
  function bodyBefore(points,end,span){
    let length=0,start=end;
    while(start>0&&length<span){length+=distance(points[start-1],points[start]);start--;}
    return {vector:[points[end][0]-points[start][0],points[end][1]-points[start][1]],length,start};
  }
  const pathLength=(points,from,to)=>{let length=0;for(let i=from+1;i<=to;i++)length+=distance(points[i-1],points[i]);return length;};
  const vector=(points,a,b)=>[points[b][0]-points[a][0],points[b][1]-points[a][1]];
  const bodySpan=3; // CSS px of body measured just before a candidate tail.
  /* How sharply points[start..end] turns away from the body before it. The
     body direction uses only samples up to points[start], never the tail.
     `baseline` is the body's own turn just before that: a curve that keeps
     turning (small o, c) has it large, a hook turns only at the end. */
  function endTurn(points,start,end,unit){
    const span=bodySpan*unit,body=bodyBefore(points,start,span);
    if(body.start===start)return null;
    const before=bodyBefore(points,body.start,Math.max(span,body.length)),tail=pathLength(points,start,end);
    // A sparse body can be one long straight segment. Its far end is a
    // corner, not curvature next to the tail, so it sets no baseline.
    const straight=body.start===start-1&&body.length>=Math.max(8*unit,2*tail);
    return {tail,prefix:pathLength(points,0,start),
      angle:turn(body.vector,vector(points,start,end)),
      first:turn(body.vector,vector(points,start,start+1)),
      baseline:before.start===body.start||straight?0:turn(before.vector,body.vector)};
  }
  const sudden=(t,angle)=>t.angle>=angle&&t.angle>=2.5*t.baseline;
  /* Samples to drop at one end (points ordered toward that end): a tail of
     at most 3 segments and 12 CSS px whose first segment already leaves the
     body (>=25 deg) and whose chord turns >=45 deg, suddenly. The longest
     such tail wins. A deliberate arm drawn at writing speed spans more than
     3 samples or 12 px, so ㄱ/ㄴ corners with longer arms are kept. */
  function hookLength(points,unit,{flick=false}={}){
    const n=points.length;
    if(n<4)return 0;
    for(let segments=3;segments>=1;segments--){
      const start=n-1-segments;if(start<1)continue;
      const t=endTurn(points,start,n-1,unit);
      if(!t||t.prefix<Math.max(2*t.tail,8*unit))continue;
      if(t.tail<=12*unit&&t.first>=25&&sudden(t,45))return segments;
    }
    if(flick&&n>=6){
      // A flick: one last segment much faster than the body that turns.
      const t=endTurn(points,n-2,n-1,unit);
      const lengths=[1,2,3].map(j=>distance(points[n-2-j],points[n-1-j])).sort((x,y)=>x-y);
      if(t&&t.prefix>=Math.max(2*t.tail,8*unit)&&t.tail>=4*unit&&t.tail>=2.5*lengths[1]&&sudden(t,30))return 1;
    }
    return 0;
  }
  /* Lift-time 삐침 removal on raw samples. Mid-stroke samples are never
     touched: only wobble around the resting point, a short sudden hook, or a
     fast turned final segment is dropped. Thresholds are CSS pixels (`unit`
     PDF units each). Returns the number of samples kept. */
  function trimTail(samples,unit){
    const points=samples.map(s=>s.p),n=points.length;
    if(n<4)return n;
    const rest=2*unit;
    // The earliest resting sample k that every later sample stays near.
    let k=n-1;
    for(let i=n-2,path=0;i>0&&path<=4*rest;i--){
      path+=distance(points[i],points[i+1]);
      if(points.slice(i+1).every(p=>distance(points[i],p)<=rest))k=i;
    }
    if(k<n-1&&k>=2){
      const t=endTurn(points,k,n-1,unit),net=distance(points[k],points[n-1]);
      if(t&&t.prefix>=2*rest&&(t.tail>1.5*net+epsilon||sudden(t,45)))return k+1;
    }
    return n-hookLength(points,unit,{flick:true});
  }
  /* Pen-down skid. If the landing point lies on the body's backward line
     (within 1.5 px) and only the next 1-3 samples (<=12 px out) wander 2 px
     or more off it, drop just those:
     the stroke still starts where the pen landed. Otherwise apply the same
     short sudden-hook rule as at lift, read from the start. Returns
     {skip:[from,to)} sample indices to drop. */
  function trimHead(samples,unit){
    const points=samples.map(s=>s.p),n=points.length;
    for(let k=3;k>=1;k--){
      if(n<k+4)continue;
      const anchor=points[k+1];let ahead=k+1;
      while(ahead<n-1&&distance(anchor,points[ahead])<bodySpan*unit)ahead++;
      const u=vector(points,k+1,ahead),length=Math.hypot(...u);
      if(length<bodySpan*unit||pathLength(points,k+1,n-1)<8*unit)continue;
      const along=p=>((p[0]-anchor[0])*u[0]+(p[1]-anchor[1])*u[1])/length;
      const off=p=>Math.abs((p[0]-anchor[0])*u[1]-(p[1]-anchor[1])*u[0])/length;
      if(along(points[0])>0||off(points[0])>1.5*unit||pathLength(points,0,k)>12*unit)continue;
      if(Math.max(...points.slice(1,k+1).map(off))>=2*unit)return {skip:[1,k+1]};
    }
    return {skip:[0,hookLength(points.slice().reverse(),unit)]};
  }
  /* Stroke input: a dead zone at pen-down, smoothed pressure, the curve above,
     and optional lift-time end stabilization. `unit` is PDF units per CSS pixel.
     `force` is the raw contact pressure (0..1, missing/0 = unknown); `map`
     turns it into stored effective pressure. Without `pressure:true` no
     pressure is recorded and the geometry is unchanged.
     `ends:true` trims a short hook, rest wobble, or lift flick and rebuilds
     the curve, which moves the tail after the pen lifts. The product default
     is off (`ends:false`): finish() commits the live curve unchanged. The
     pen-down dead zone stays either way; those samples were never geometry.
     @param {number[]} first
     @param {{unit?:number,pressure?:boolean,force?:number,map?:(v:number)=>number,ends?:boolean}} [options] */
  function createSmoother(first,{unit=1,pressure=false,force=undefined,map=v=>v,ends=false}={}){
    const dead=2*unit,raw=[];
    const forces=[];
    let sawForce=false,current=0.5,anchored=false,tip=first.slice(),tipPressure;
    const valid=f=>typeof f==='number'&&Number.isFinite(f)&&f>0;
    const clamp=v=>Math.max(0,Math.min(1,v));
    const effective=f=>valid(f)?clamp(map(Math.min(1,f))):undefined;
    if(pressure){const e=effective(force);if(e!==undefined){forces.push(e);sawForce=true;current=e;}}
    let curve=createCurve(first,pressure?current:null);
    raw.push({p:first.slice(),e:pressure?current:undefined});
    tipPressure=pressure?current:undefined;
    function smooth(e){
      // Ignore missing samples and limit each step: down/up spikes and
      // per-sample noise cannot make the line width flicker.
      if(e===undefined)return current;
      const target=current+(e-current)*0.35;
      current+=Math.max(-0.08,Math.min(0.08,target-current));
      return current;
    }
    return {
      add(p,f){
        if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))return;
        const e=pressure?effective(f):undefined;
        if(e!==undefined)sawForce=true;
        if(!anchored){
          // Pen-down jitter inside the dead zone is shown live (the tip still
          // reaches the latest sample) but never becomes stroke geometry.
          if(e!==undefined)forces.push(e);
          tip=p.slice();
          if(distance(first,p)<=dead)return;
          anchored=true;
          if(pressure){
            // The first contact sample often spikes; start from the median
            // of the later samples instead.
            const sample=(forces.length>1?forces.slice(1):forces).slice().sort((a,b)=>a-b);
            if(sample.length)current=sample[Math.floor((sample.length-1)/2)];
            curve.setFirstPressure(current);raw[0].e=current;
          }
          raw.push({p:p.slice(),e:pressure?current:undefined});
          curve.add(p,pressure?current:undefined);tipPressure=pressure?current:undefined;
          return;
        }
        if(distance(curve.last,p)<=epsilon)return;
        const value=pressure?smooth(e):undefined;
        raw.push({p:p.slice(),e:value});
        curve.add(p,value);tip=p.slice();tipPressure=value;
      },
      svgPoints(){return curve.text()+' '+svgPoint(anchored?curve.last:tip);},
      snapshot(){return curve.points.concat([anchored?curve.last:tip]);},
      // Settled points (read-only) plus the live tip, for incremental previews.
      live(){return {points:curve.points,pressures:curve.pressures,tip:anchored?curve.last:tip,tipPressure:anchored?curve.lastPressure:tipPressure};},
      finish(){
        if(!anchored&&pressure&&forces.length){
          const sample=forces.slice().sort((a,b)=>a-b);curve.setFirstPressure(sample[Math.floor((sample.length-1)/2)]);
        }
        if(ends&&anchored){
          let samples=raw;
          const end=trimTail(samples,unit);samples=samples.slice(0,end);
          const [from,to]=trimHead(samples,unit).skip;
          if(to>from)samples=samples.slice(0,from).concat(samples.slice(to));
          // Rebuilding is what moves the tail: the live stroke was the previous
          // curve plus a straight tip, and a trimmed sample list is a new curve.
          if(samples.length!==raw.length&&samples.length){
            const rebuilt=createCurve(samples[0].p,pressure?samples[0].e:null);
            for(const s of samples.slice(1))rebuilt.add(s.p,s.e);
            curve=rebuilt;
          }
        }
        curve.finish();
        return curve.points.slice();
      },
      // Per-point effective pressure for the last finish(), or null when the
      // contact reported no usable force (stored exactly like a plain pen).
      pressures(){return pressure&&sawForce?curve.pressures.slice():null;}
    };
  }
  /* Pressure pen outline: the union of a circle at each end/bend and the
     tangent quad between neighbouring circles, all wound the same way so the
     nonzero fill never leaves holes at self-overlaps. Appends only. */
  function createOutline(){
    const state={text:'',prev:null,dir:null};
    const n=round2;
    function circle(s,p,r){
      s.text+=`M${n(p[0]+r)},${n(p[1])}A${n(r)},${n(r)} 0 1 1 ${n(p[0]-r)},${n(p[1])}A${n(r)},${n(r)} 0 1 1 ${n(p[0]+r)},${n(p[1])}Z`;
    }
    function quad(s,a,ra,b,rb){
      const d=distance(a,b);
      if(d<=Math.abs(ra-rb)+epsilon){circle(s,rb>ra?b:a,Math.max(ra,rb));return;}
      const u=[(b[0]-a[0])/d,(b[1]-a[1])/d],v=[-u[1],u[0]],sin=(ra-rb)/d,cos=Math.sqrt(Math.max(0,1-sin*sin));
      const m=side=>[-sin*u[0]+side*cos*v[0],-sin*u[1]+side*cos*v[1]];
      const at=(c,r,k)=>[c[0]-r*k[0],c[1]-r*k[1]];
      const plus=m(1),minus=m(-1);
      let corners=[at(a,ra,plus),at(b,rb,plus),at(b,rb,minus),at(a,ra,minus)];
      let area=0;for(let i=0;i<4;i++){const p=corners[i],q=corners[(i+1)%4];area+=p[0]*q[1]-q[0]*p[1];}
      if(area<0)corners=corners.reverse();
      s.text+='M'+corners.map(p=>n(p[0])+','+n(p[1])).join('L')+'Z';
    }
    function push(s,p,r){
      if(!s.prev){s.prev={p,r};circle(s,p,r);return;}
      const d=[p[0]-s.prev.p[0],p[1]-s.prev.p[1]];
      if(Math.hypot(...d)<=epsilon)return;
      // Gentle bends need no joint circle; the gap is far below a pixel.
      if(s.dir&&turn(s.dir,d)>10)circle(s,s.prev.p,s.prev.r);
      quad(s,s.prev.p,s.prev.r,p,r);
      s.dir=d;s.prev={p,r};
    }
    return {
      push(p,r){push(state,p,r);},
      text(extra=[]){
        const s={...state};
        for(const [p,r] of extra)push(s,p,r);
        if(s.dir)circle(s,s.prev.p,s.prev.r);
        return s.text;
      }
    };
  }
  function outlinePath(stroke){
    const outline=createOutline();
    stroke.points.forEach((p,i)=>outline.push(p,widthAt(stroke,i)/2));
    return outline.text();
  }
  return {eraseStroke,createSmoother,createOutline,outlinePath,svgPoint,widthAt,penWidthFactor,pressured};
})();
