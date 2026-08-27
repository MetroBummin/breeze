import assert from 'node:assert/strict';
import { conceptKey, lemma, lexicalState, remapRebakeConcepts, tokenizeSentence } from '../server/ready/lexical-core.mjs';

assert.equal(lemma('made'),'make');
assert.equal(lemma('making'),'make');
assert.equal(lemma('students'),'student');
const tokens=tokenizeSentence('They made this problem up for us.');
assert.deepEqual(tokens.map(token=>token.surface),['They','made','this','problem','up','for','us']);

const makeCreate=conceptKey('word','make','create.object');
const makeCause=conceptKey('word','make','cause.state');
const makeUpFor=conceptKey('phrase','make up for','compensate.for');
assert.equal(conceptKey('word','make','create.object'),conceptKey('word','make','create.object'));
assert.notEqual(makeCreate,makeCause,'same lemma with another sense collapsed');

const fixtureTokens=[{id:'made'},{id:'up'},{id:'for'}];
let state=lexicalState(fixtureTokens,[{kind:'word',conceptKey:makeCreate,tokenIds:['made']}],[makeCreate]);
assert(state.get('made').has('saved-word'),'same-sense made was not highlighted from saved make concept');
state=lexicalState(fixtureTokens,[{kind:'word',conceptKey:makeCause,tokenIds:['made']}],[makeCreate]);
assert(!state.get('made').has('saved-word'),'different make sense was highlighted');
state=lexicalState(fixtureTokens,[{kind:'phrase',conceptKey:makeUpFor,tokenIds:['made','up','for']},{kind:'word',conceptKey:makeCreate,tokenIds:['made']}],[makeCreate]);
assert(!state.get('made').has('saved-word'),'unsaved phrase leaked standalone saved-word styling');
state=lexicalState(fixtureTokens,[{kind:'phrase',conceptKey:makeUpFor,tokenIds:['made','up','for']}],[makeUpFor]);
assert(['made','up','for'].every(id=>state.get(id).has('saved-phrase')),'inflected phrase was not highlighted by canonical concept');
state=lexicalState([{id:'took'},{id:'this'},{id:'issue'},{id:'into'},{id:'account'}],[{kind:'phrase',conceptKey:conceptKey('phrase','take into account','consider'),tokenIds:['took','into','account']}],[conceptKey('phrase','take into account','consider')]);
assert(state.get('took').has('saved-phrase')&&state.get('into').has('saved-phrase')&&state.get('account').has('saved-phrase'));
assert(!state.get('this').has('saved-phrase')&&!state.get('issue').has('saved-phrase'),'discontinuous phrase colored intervening tokens');

const rebaked=remapRebakeConcepts(
  [{sentenceId:'s1',occurrenceKey:'word:make:1',conceptKey:makeCreate}],
  [{sentenceId:'s1',occurrenceKey:'word:make:1',conceptKey:conceptKey('word','make','produce.object')}],
);
assert.equal(rebaked[0].conceptKey,makeCreate,'rebake replaced a saved concept solely because the model renamed its sense key');

console.log('READY Reader Intelligence semantics verified.');
