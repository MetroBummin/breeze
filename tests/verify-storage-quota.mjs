import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function install(){
  const memory=new Map();
  let failures=0;
  class Storage{}
  Storage.prototype.getItem=key=>memory.has(String(key))?memory.get(String(key)):null;
  Storage.prototype.setItem=function(key,value){
    if(failures>0){failures--;throw new DOMException('The quota has been exceeded.','QuotaExceededError');}
    memory.set(String(key),String(value));
  };
  Storage.prototype.removeItem=key=>memory.delete(String(key));
  Storage.prototype.key=index=>[...memory.keys()][index]??null;
  const localStorage=new Storage();
  Object.defineProperty(localStorage,'length',{get(){return memory.size;}});
  const context={Storage,localStorage,globalThis:null,console,DOMException,Promise};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../scripts/core/storage-quota.js',import.meta.url),'utf8'),context,{filename:'storage-quota.js'});
  return {context,memory,fail(count){failures=count;}};
}

test('a quota failure drops disposable caches, retries, and keeps the word record',()=>{
  const {context,memory,fail}=install();
  memory.set('breeze.rss-public.v1','{"feeds":"synthetic cache"}');
  memory.set('breeze.word-item.keep',JSON.stringify({word:'keep',ko:'보존'}));
  fail(1);
  context.localStorage.setItem('breeze.study-set-tests.v1','{"version":1,"sets":{}}');
  assert.equal(memory.has('breeze.rss-public.v1'),false);
  assert.equal(JSON.parse(memory.get('breeze.word-item.keep')).ko,'보존');
  assert.equal(memory.get('breeze.study-set-tests.v1'),'{"version":1,"sets":{}}');
});

test('word records stay when pruning cannot free enough space',()=>{
  const {context,memory,fail}=install();
  memory.set('breeze.word-item.keep',JSON.stringify({word:'keep',ko:'보존'}));
  fail(5);
  assert.throws(()=>context.localStorage.setItem('breeze.word-item.new','{"word":"new"}'),/quota/i);
  assert.equal(JSON.parse(memory.get('breeze.word-item.keep')).ko,'보존');
  assert.equal(memory.has('breeze.word-item.new'),false);
});

test('a word snapshot is removed only when the same scope already has every word item',()=>{
  const {context,memory}=install();
  memory.set('breeze.words',JSON.stringify({keep:{word:'keep',ko:'보존'}}));
  memory.set('breeze.word-item.keep',JSON.stringify({word:'keep',ko:'보존'}));
  memory.set('breeze.account.v1.user%3AA.breeze.words',JSON.stringify({only:{word:'only',ko:'오직'}}));
  context.breezeRecoverStorageQuota();
  assert.equal(memory.has('breeze.words'),false);
  assert.equal(JSON.parse(memory.get('breeze.word-item.keep')).ko,'보존');
  assert.equal(JSON.parse(memory.get('breeze.account.v1.user%3AA.breeze.words')).only.ko,'오직');
});
