import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {webcrypto} from 'node:crypto';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const sync=readFileSync(resolve(root,'scripts/sync/sync.js'),'utf8');
const progressCallers=sync+readFileSync(resolve(root,'scripts/core/state.js'),'utf8')+
  readFileSync(resolve(root,'scripts/reader/reader-modes.js'),'utf8');
const progressMergeSource=readFileSync(resolve(root,'scripts/sync/progress-merge.js'),'utf8');

assert.doesNotMatch(sync,/setInterval\([^\n]*doSync/,
  'Idle foreground time still polls the complete sync path');
assert.doesNotMatch(sync,/from\('words'\)\.select\('key,data'\)\.eq\('user_id',sbUser\.id\);/,
  'Normal v2 sync still downloads every words row');
assert.match(sync,/select\('data'\)\.eq\('user_id',sbUser\.id\)\.eq\('key',VAULT_META_ROW\)\.maybeSingle\(\)/,
  'Sync does not use the small metadata row as its first remote check');
assert.match(sync,/select\('data'\)\.eq\('user_id',sbUser\.id\)\.eq\('key',VAULT_ROW\)\.maybeSingle\(\)/,
  'Vault download is not restricted to the encrypted vault key');
assert.match(sync,/vaultMeta\.legacyCleanedAt\|\|vaultMeta\.legacyMigratedAt/,
  'Completed legacy migration does not skip legacy tables');
assert.match(sync,/if\(migrationNeeded\)\{[\s\S]*readLegacyData\(await readLegacyRows\(\)\)/,
  'Legacy reads are not gated behind migration state');
assert.doesNotMatch(sync,/from\('(?:words|books|positions)'\)\.delete\(\)|storage\.from\('books'\)\.list\(/,
  'Emergency hardening still deletes or lists legacy server data');
assert.match(sync,/remoteVersion!==seenVersion/,
  'Remote metadata version is not compared before downloading the vault');
assert.doesNotMatch(sync,/const needsVault=manual\|\|/,
  'Manual sync still downloads an unchanged full vault instead of checking metadata');
assert.match(sync,/if\(!needsVault\)\{[\s\S]{0,260}return true/,
  'An unchanged automatic sync cannot stop before the vault fetch');
assert.match(sync,/syncCooldownUntil=Date\.now\(\)\+delay/,
  'Network and quota failures have no request cooldown');
assert.match(sync,/syncErrorStatus\(error\)===402/,
  'HTTP 402 is not recognized as a quota restriction');
assert.match(sync,/const PROGRESS_ROW='__breeze_progress_v1__'/,
  'Reading progress has no separate encrypted server record');
assert.match(sync,/queueReadingProgressSync\(\)[\s\S]{0,500}doProgressSync\(false,false\)/,
  'Reading progress still schedules the vocabulary sync path');
assert.doesNotMatch(sync,/function queueReadingProgressSync\(\)[\s\S]{0,500}queueSync\(\)/,
  'Progress-only changes still mark the vocabulary vault dirty');
assert.match(sync,/\[sbUser\.id,vaultMeta\.vaultId,'progress'\],'breeze\/progress\/v1'/,
  'Progress payload is not sealed with a distinct authenticated context');
assert.match(sync,/const rawHash=original\.hash\|\|book\.sourceHash\|\|'';[\s\S]{0,700}updatedAt:Math\.max\(book\.renamedAt/,
  'Vault book metadata is not independent from reading position');
assert.doesNotMatch(sync,/updatedAt:Math\.max\([^\n]*position/,
  'Reading position can still advance the vocabulary vault version');
assert.match(sync,/if\(document\.hidden\)[\s\S]{0,500}doProgressSync\(false,false\)/,
  'Backgrounding does not flush pending progress independently');
assert.match(progressCallers,/sameProgressLocation\(previous,candidate\)/,
  'Unchanged reading locations can still schedule server requests');

const mergeContext={};
new Script(progressMergeSource+'\n;globalThis.__merge=BreezeProgressMerge;').runInNewContext(mergeContext);
const merge=mergeContext.__merge.merge;
const position=(p,t)=>({position:{p,t,mode:'text',pi:null,dy:0,original:null},updatedAt:t});
const remote={book:position(.6,200)};
const olderLocal={book:position(.4,100)};
const newerLocal={book:position(.8,300)};
let result=merge(remote,olderLocal,'');
assert.equal(result.records.book.updatedAt,200,'Newest remote progress did not win');
assert.equal(result.apply.book.updatedAt,200,'Inactive reader did not accept newer remote progress');
result=merge(remote,olderLocal,'book');
assert.equal(Object.keys(result.apply).length,0,'Active reader would jump to a remote position');
assert.equal(result.records.book.updatedAt,200,'Active-reader guard changed the LWW server winner');
result=merge(remote,newerLocal,'');
assert.equal(result.records.book.updatedAt,300,'Newest offline local progress did not win after reconnect');
assert.equal(result.serverChanged,true,'Newer offline progress would not upload');
result=merge(remote,remote,'');
assert.equal(result.serverChanged,false,'Identical progress schedules a duplicate upload');
assert.match(sync,/if\(merged\.serverChanged\)\{/,
  'A later-arriving stale device snapshot cannot be repaired on reconnect');

const cryptoContext={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,String,btoa,atob};
new Script(readFileSync(resolve(root,'scripts/sync/vault-crypto.js'),'utf8')+
  '\n;globalThis.__vault=VaultCrypto;').runInNewContext(cryptoContext);
const master=cryptoContext.__vault.random(32),aad=['user','vault','progress'];
const sealed=await cryptoContext.__vault.sealJson(master,{records:{book:position(.7,400)}},aad,'breeze/progress/v1');
const opened=await cryptoContext.__vault.openJson(master,sealed,aad,'breeze/progress/v1');
assert.equal(opened.records.book.position.p,.7,'Encrypted progress did not round-trip');
assert.equal(JSON.stringify(sealed).includes('"p":0.7'),false,'Progress position leaked outside its ciphertext');

console.log('Sync egress hardening checks passed');
