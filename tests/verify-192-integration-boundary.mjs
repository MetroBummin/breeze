import {readFileSync} from 'node:fs';
import {verify192Boundary,verifyHistorical191} from '../tools/record-192-integration-boundary.mjs';

const receipt=JSON.parse(readFileSync(new URL('../docs/qa/breeze-192-integration/boundary.json',import.meta.url)));
verify192Boundary(receipt);
// Run every historical assertion, unchanged, on the exact historical release.
// The current tree has already been independently checked against that release
// plus the two immutable owners and the explicit version/integration delta.
verifyHistorical191();
console.log('1.9.2 boundary passed: exact PR143/144 sources, all other baseline bytes protected, historical 1.9.1 assertions unchanged.');
