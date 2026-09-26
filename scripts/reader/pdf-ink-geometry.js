/* Page-coordinate geometry only; never reads or mutates the DOM or stored ink. */
const BreezeInkGeometry = (()=>{
  const epsilon=1e-8;
  const strokeBounds=new WeakMap();
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
    const points=stroke.points,r=radius+stroke.width/2;
    let bounds=strokeBounds.get(stroke);
    if(!bounds){
      bounds=[Infinity,Infinity,-Infinity,-Infinity];
      for(const p of points){bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);}
      strokeBounds.set(stroke,bounds);
    }
    if(bounds[2]<Math.min(a[0],b[0])-r||bounds[0]>Math.max(a[0],b[0])+r
      ||bounds[3]<Math.min(a[1],b[1])-r||bounds[1]>Math.max(a[1],b[1])+r)return [stroke];
    if(points.length===1)return capsuleInterval(points[0],points[0],a,b,r)?[]:[stroke];
    const chunks=[];let current=[],changed=false;
    const add=p=>{const last=current.at(-1);if(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>epsilon)current.push(p);};
    const finish=()=>{if(current.length)chunks.push({...stroke,points:current});current=[];};
    for(let i=1;i<points.length;i++){
      const p=points[i-1],q=points[i],cut=capsuleInterval(p,q,a,b,r);
      if(!cut){add(p);add(q);continue;}
      changed=true;
      const at=t=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
      if(cut[0]>epsilon){add(p);add(at(cut[0]));}
      finish();
      if(cut[1]<1-epsilon){add(at(cut[1]));add(q);}
    }
    if(!changed)return [stroke];
    finish();return chunks;
  }
  return {eraseStroke};
})();
