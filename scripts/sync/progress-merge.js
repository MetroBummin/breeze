/* Pure last-write-wins merge for encrypted reading-progress records.
   Keeping this free of DOM/storage/network code makes the two-device and
   active-reader rules executable in Node regression tests. */
const BreezeProgressMerge=(()=>{
  const time=record=>Number(record&&record.updatedAt)||Number(record&&record.position&&record.position.t)||0;
  const same=(left,right)=>JSON.stringify(left||null)===JSON.stringify(right||null);
  function merge(remoteRecords,localRecords,activeIdentity){
    const remote=remoteRecords||{},local=localRecords||{},records={},apply={};
    let serverChanged=false;
    for(const identity of new Set([...Object.keys(remote),...Object.keys(local)])){
      const remoteRecord=remote[identity],localRecord=local[identity];
      /* Equal timestamps keep the server record. That makes repeated sync
         idempotent and avoids two devices rewriting an equivalent winner. */
      const localWins=!!localRecord&&(!remoteRecord||time(localRecord)>time(remoteRecord));
      const winner=localWins?localRecord:remoteRecord;
      if(winner) records[identity]=winner;
      if(localWins&&!same(winner,remoteRecord)) serverChanged=true;
      if(!localWins&&remoteRecord&&identity!==activeIdentity
        &&(!localRecord||time(remoteRecord)>time(localRecord))) apply[identity]=remoteRecord;
    }
    return {records,apply,serverChanged};
  }
  return {merge};
})();
