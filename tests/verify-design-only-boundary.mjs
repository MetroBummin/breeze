import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hashes={
  "scripts/reader/gesture.js": "f0e416671606f71fcecbb4d46ba7a554cb9f7313f453f75e9aef804ef8a0cca9",
  "scripts/dictionary/sentence-easy-explanation.js": "c0f3fdd2a97432f22a802ad479fcb7edb0d633e2511124dac08858c43b255651",
  "scripts/sync/sync.js": "46c6c6f2f03f2aba08e05b3e08106a0045d502bb5c95422e1596b9b240a3ec9c",
  "scripts/ui/preferences.js": "17d20ac3f3f38a4b0d93a7ed99b3d0b9b3bf56097432baea482c40db6ba01053",
  "ios/App/App/SceneDelegate.swift": "8b5e8f5caaf93223c2c39cd829118e0b9595b60e529a2a4e552a8b396e8b6e90",
  "ios/App/App/Base.lproj/LaunchScreen.storyboard": "1fe2834a4bb1a7c91026afd9525929324dd45707af88e36976fe4c56ea3387ad",
  "ios/App/App.xcodeproj/project.pbxproj": "23d59b7303fa5b86838829badbb15736e6932adcb1a098233ede1b800759c5b1"
};
for(const [file,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),hash,'Onboarding revision must preserve production: '+file);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.equal(html.includes('id="onboard-welcome"'),true);
assert.equal(html.includes('id="brand-boot"'),false);
assert.equal(html.includes('breeze-flow-'),false);
console.log('Design-only boundary: approved onboarding boundary, Reader/auth ownership, native launch and version/build baseline preserved.');
