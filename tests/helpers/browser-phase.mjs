// Playwright's default timeout does not bound a promise returned by evaluate.
// Keep the deadline in Node so a blocked page cannot silence the CI job.
export async function browserPhase(name,run,{timeoutMs=30000,report=()=>{}}={}){
  const started=Date.now();let timer;
  report({name,status:'started',started});
  try{
    const value=await Promise.race([
      Promise.resolve().then(run),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${name} exceeded ${timeoutMs}ms`)),timeoutMs);}),
    ]);
    report({name,status:'passed',durationMs:Date.now()-started});return value;
  }catch(error){
    report({name,status:'failed',durationMs:Date.now()-started,error:String(error)});throw error;
  }finally{clearTimeout(timer);}
}
