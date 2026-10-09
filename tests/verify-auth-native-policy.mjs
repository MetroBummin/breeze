import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('ios/App/App/SceneDelegate.swift',root),'utf8');
const policy=source.match(/\/\/ BEGIN AUTH_CALLBACK_POLICY\n([\s\S]*?)\/\/ END AUTH_CALLBACK_POLICY/)?.[1];
assert.ok(policy,'Missing production native callback policy');
assert.match(source,/BreezeAuthCallbackPolicy\.authorize\(url, request: request\)/);
assert.match(source,/BreezeAuthCallbackPolicy\.callback\(callback, request: request\)/);
const applePolicy=source.match(/\/\/ BEGIN APPLE_TOKEN_POLICY\n([\s\S]*?)\/\/ END APPLE_TOKEN_POLICY/)?.[1];
assert.ok(applePolicy,'Missing production Apple identity binding policy');
assert.match(source,/SHA256\.hash\(data: Data\(nonce\.utf8\)\)/);
assert.match(source,/controller === appleAuthController/);
assert.match(source,/credential\.state == request/);
const checks=readFileSync(new URL('tests/auth-native-policy-checks.swift',root),'utf8');
const work=mkdtempSync(join(tmpdir(),'breeze-auth-policy-'));
try{
 execFileSync('swiftc',['-frontend','-parse',new URL('ios/App/App/SceneDelegate.swift',root).pathname],{stdio:'inherit'});
 const file=join(work,'AuthChecks.swift'),executable=join(work,'checks');
 writeFileSync(file,'import Foundation\n'+policy+'\n'+applePolicy+'\n'+checks);
 execFileSync('swiftc',['-swift-version','5','-parse-as-library',file,'-o',executable],{stdio:'inherit'});
 execFileSync(executable,[],{stdio:'inherit'});
}finally{rmSync(work,{recursive:true,force:true});}
