import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const root=new URL('../',import.meta.url);
// Auth extraction must keep the existing onboarding, Reader and release config.
const protectedHashes={
  "scripts/ui/onboarding.js": "04236e7a190a2d45d71092741b9342b871f06d1783a36c01c6a6dfc3aa95a2ec",
  "styles/onboarding.css": "e80ba10b32e4afcd43a60e1243fc72709e0762ad0f1019d8330a2f37f05e940d",
  "scripts/reader/gesture.js": "f0e416671606f71fcecbb4d46ba7a554cb9f7313f453f75e9aef804ef8a0cca9",
  "scripts/dictionary/sentence-easy-explanation.js": "c0f3fdd2a97432f22a802ad479fcb7edb0d633e2511124dac08858c43b255651",
  "ios/App/App/Base.lproj/LaunchScreen.storyboard": "1fe2834a4bb1a7c91026afd9525929324dd45707af88e36976fe4c56ea3387ad",
  "ios/App/App.xcodeproj/project.pbxproj": "23d59b7303fa5b86838829badbb15736e6932adcb1a098233ede1b800759c5b1",
  "ios/App/App/Info.plist": "bfaf78d7791b2fa998ab24105e98d7c5ba01aca4dcb8c9c1dd407a689bed4032",
  "capacitor.config.json": "b683b0f29a86c568be9af28fa58f4c5de5b8864fdd69aad82a1f78a1219dcbbb",
  "config.js": "1ca8e0a56a31e5e4a1881591d34008c8d04a58d1babc9f1c485cda686cb4c0d9"
};
for(const [file,expected] of Object.entries(protectedHashes))assert.equal(hash(readFileSync(new URL(file,root))),expected,'Auth-only extraction changed '+file);
const html=readFileSync(new URL('index.html',root),'utf8').replace(/\?v=[a-f0-9]+/g,'');
assert.equal(hash(html),'6773f4fc7d80a80498e9a8b724398a022c42b06089a2e998bcecb2d3715e3dff','Only existing resource version hashes may change in index.html');
const css=readFileSync(new URL('styles/home-shell.css',root),'utf8').split('/* Settings sign-in choices.')[0].trimEnd();
assert.equal(hash(css),'c0825d32b320a70ac83bbf7ce87e1802fdd3eafe6a008ff4243b21d41a14bfbe','Existing Home/Memory/brand CSS must be preserved');
console.log('Auth-only boundary: existing onboarding DOM/script/style, Reader, Home/Memory and release config preserved.');
