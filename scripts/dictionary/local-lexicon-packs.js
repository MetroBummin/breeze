/* Additive, display-only packs. The established 10K resolver stays unchanged.
 * Kengdic is deliberately opt-in: its source has no sense-level POS labels.
 * Load before taps. This module never calls AI, writes vocabulary, or prefetches.
 */
(function(root){
  'use strict';
  const core=root.BreezeLocalLexicon || (typeof require==='function' ? require('./local-lexicon.js') : null);
  const HTTPS=/^https:\/\//;
  const BASE=Object.freeze({id:'base-10k',license:'CC-BY-SA-4.0',experimental:false,
    sourceUrlPrefix:'https://ko.wiktionary.org/wiki/',sourceAnchor:'영어'});
  function create(packs,options={}){
    if(!core || !Array.isArray(packs) || !packs.length)throw new TypeError('Missing local lexicon packs');
    const ids=new Set(),words=new Set(),engines=[];
    for(const pack of packs){
      const {data,meta}=pack || {};
      if(!meta || typeof meta.id!=='string' || ids.has(meta.id) || !HTTPS.test(meta.sourceUrlPrefix || '')
        || !['CC-BY-SA-4.0','MPL-2.0'].includes(meta.license) || data?.license!==meta.license)
        throw new TypeError('Invalid local lexicon pack metadata');
      ids.add(meta.id);
      if(meta.experimental && options.allowExperimentalFallback!==true)continue;
      for(const word of Object.keys(data?.entries || {})){
        if(words.has(word))throw new TypeError('Duplicate headword across local lexicon packs');
        words.add(word);
      }
      const resolver=core.create(data,options);
      engines.push({resolver,meta:Object.freeze({...meta})});
    }
    if(!engines.length)throw new TypeError('No enabled local lexicon packs');
    let lookups=0,hits=0,misses=0,experimentalHits=0;
    function lookup(input){
      lookups++;
      // Pack precedence preserves ALL existing 10K results, including inflection
      // candidates. New packs are used only after higher-priority local misses.
      for(const {resolver,meta} of engines){
        const result=resolver.lookup(input);if(!result)continue;
        hits++;if(meta.experimental)experimentalHits++;
        const sourceUrl=meta.sourceAnchor ? meta.sourceUrlPrefix+encodeURIComponent(result.lemma)+'#'+meta.sourceAnchor
          :meta.sourceUrlPrefix;
        return Object.freeze({...result,sourceUrl,license:meta.license,pack:meta.id,
          quality:meta.experimental?'experimental-fallback':'source-backed-preview'});
      }
      misses++;return null;
    }
    return Object.freeze({lookup,
      stats:()=>({lookups,localHits:hits,localMisses:misses,experimentalHits,headwords:words.size,
        packs:engines.map(({resolver,meta})=>({id:meta.id,license:meta.license,...resolver.stats()}))}),
      resetStats:()=>{lookups=hits=misses=experimentalHits=0;engines.forEach(x=>x.resolver.resetStats());}});
  }
  async function readJson(url,expectedSha256,signal){
    const response=await fetch(url,{signal});
    if(!response.ok)throw new Error('Local lexicon asset unavailable: '+response.status);
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>6000000)throw new Error('Local lexicon asset exceeds limit');
    if(expectedSha256){
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const actual=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      if(actual!==expectedSha256)throw new Error('Local lexicon checksum mismatch');
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function load(manifestUrl,options={}){
    const url=new URL(manifestUrl,options.baseUrl || root.location?.href);
    const manifest=await readJson(url,options.expectedManifestSha256,options.signal);
    if(manifest?.schema!==1 || !manifest.baseline || !Array.isArray(manifest.packs)
       || manifest.packs.length>8)throw new TypeError('Invalid local lexicon manifest');
    const definitions=[{...BASE,...manifest.baseline},...manifest.packs]
      .filter(meta=>!meta.experimental || options.allowExperimentalFallback===true);
    const packs=await Promise.all(definitions.map(async meta=>{
      if(typeof meta.file!=='string' || !/^[a-f0-9]{64}$/.test(meta.sha256 || ''))throw new TypeError('Invalid pack path/checksum');
      const asset=new URL(meta.file,url);
      if(asset.origin!==url.origin || asset.protocol!==url.protocol)throw new TypeError('Cross-origin lexicon asset');
      return {meta,data:await readJson(asset,meta.sha256,options.signal)};
    }));
    return create(packs,options);
  }
  const api=Object.freeze({create,load,baseMetadata:BASE});
  root.BreezeLocalLexiconPacks=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(globalThis);
