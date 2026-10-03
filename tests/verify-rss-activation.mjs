import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {evaluateCohortItem,operatorAuthorized} from '../server/rss-quality/operator.mjs';
import {VERSION} from '../server/rss-quality/jev.mjs';
const cohort=JSON.parse(readFileSync(new URL('../server/rss-quality/cohort.json',import.meta.url)));
test('cohort has exact archived106 URLs and no observations or prior answers',()=>{
 const baseline=JSON.parse(readFileSync(new URL('../docs/qa/rss-106-20261002/results.json',import.meta.url)));
 assert.equal(cohort.length,106);assert.equal(new Set(cohort.map(r=>r.url)).size,106);
 assert.deepEqual(cohort.map(r=>r.url),baseline.map(r=>r.url));
 for(const r of cohort)assert.deepEqual(Object.keys(r),['id','url','source','title']);
});
test('operator requires exact existing service JWT and rejects anon/missing credentials',()=>{
 const req=value=>new Request('https://example.test',{headers:value?{Authorization:value}:{}});
 assert.equal(operatorAuthorized(req('Bearer service-fixture'),'service-fixture'),true);
 for(const value of [null,'Bearer anon-fixture','service-fixture','Bearer service-fixture extra'])assert.equal(operatorAuthorized(req(value),'service-fixture'),false);
 assert.equal(operatorAuthorized(req('Bearer undefined'),undefined),false);
});
test('durable evaluation is off by default, expires, caps concurrency2 and never reclaims a slot',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(readFileSync(new URL('../server/rss-quality/schema/rss_article_quality.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../server/rss-quality/schema/activation.sql',import.meta.url),'utf8'));
 const claim=async id=>(await db.query('select claim_rss_eval($1) as token',[id])).rows[0].token;
 assert.equal(await claim('RSS-001'),null);
 await db.exec("update rss_quality_control set mode='shadow',evaluation_until=now()+interval '6 hours'");
 const first=await claim('RSS-001');assert.ok(first);assert.ok(await claim('RSS-002'));
 assert.equal(await claim('RSS-003'),null);
 await db.exec("update rss_quality_eval set status='done' where id='RSS-001'");
 assert.equal(await claim('RSS-001'),null);assert.ok(await claim('RSS-003'));
 await db.exec("update rss_quality_eval set status='done';update rss_quality_control set evaluation_until=now()-interval '1 second'");
 assert.equal(await claim('RSS-004'),null);
 const perms=await db.query("select has_function_privilege('anon','claim_rss_eval(text)','execute') a,has_table_privilege('authenticated','rss_quality_control','update') b");
 assert.deepEqual(perms.rows[0],{a:false,b:false});
 assert.equal((await db.query('select count(*)::integer n from rss_quality_eval')).rows[0].n,106);
 }finally{await db.close();}
});
test('same canonical content shares a durable valid verdict without another paid call',async()=>{
 let calls=0,verdict=null,slots=0;
 const store={async claimEvaluation(){return verdict?{verdict}:{token:'lease'};},async finishEvaluation(k,t,v){verdict=v;},async retryEvaluation(){throw Error('unexpected retry');}};
 const jobs={async claim(){return ++slots<=2?'job':null;},async finish(){}};
 const prose='A coastal community studies the changing ocean and how its residents adapt to new conditions. '.repeat(30);
 const options={store,jobs,key:'test-fixture',fetchDoc:async()=>({url:'https://example.com/article',html:`<html><title>Coastal study</title><body><article><h1>Coastal study</h1><p>${prose}</p></article></body></html>`}),evaluate:async()=>{calls++;return {status:'approved',version:VERSION};}};
 const item={id:'RSS-001',url:'https://example.com/article',title:'Coastal study'};
 assert.equal((await evaluateCohortItem(item,options)).status,'approved');
 assert.equal((await evaluateCohortItem(item,options)).status,'approved');assert.equal(calls,1);
 assert.equal((await evaluateCohortItem(item,options)).status,'not_claimed');assert.equal(calls,1);
});
test('failure finishes fixed slot once and never retries inside an evaluation request',async()=>{
 let finished,calls=0;
 const result=await evaluateCohortItem(cohort[0],{key:'fixture',store:{},jobs:{claim:async()=> 'job',finish:async(i,t,r)=>{finished=r;}},fetchDoc:async()=>{calls++;throw Error('source_unavailable');}});
 assert.equal(calls,1);assert.equal(result.status,'error');assert.equal(finished.diagnostic.code,'source_unavailable');
});
