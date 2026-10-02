// Static hosting and native bundles use the exact pinned upstream UMD bytes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const pkg=JSON.parse(read('node_modules/ts-fsrs/package.json'));
assert.equal(pkg.version,'5.4.2');assert.equal(pkg.license,'MIT');
assert.deepEqual(read('scripts/vendor/ts-fsrs-5.4.2.js'),read('node_modules/ts-fsrs/dist/index.umd.js'));
assert.deepEqual(read('scripts/vendor/ts-fsrs-LICENSE.txt'),read('node_modules/ts-fsrs/LICENSE'));
console.log('Pinned ts-fsrs 5.4.2 UMD and MIT license match npm distribution');
