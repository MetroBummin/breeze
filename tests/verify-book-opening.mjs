import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const context={};
new Script(readFileSync(new URL('../scripts/reader/book-opening.js',import.meta.url),'utf8')).runInNewContext(context);
const {composeBookOpening,openingRepeatsAuthor}=context;

test('a title-page dedication is one page and the printed verse indent stays',()=>{
  const blocks=[
    {bookRole:'inscription',t:'Once again'},
    {bookRole:'inscription',t:'to'},
    {bookRole:'inscription',t:'Zelda'},
    {bookRole:'verse',t:'Then wear the gold hat',verseIndent:false,verseStanza:true},
    {bookRole:'verse',t:'If you can bounce high',verseIndent:true},
    {bookRole:'verse',t:'Till she cry',verseIndent:false},
    {bookRole:'verse',t:'I must have you!',verseIndent:true},
    {bookRole:'signature',t:'Thomas Parke d’Invilliers'},
    {bookRole:'chapter',t:'Chapter I',before:'page'},
    {bookRole:'verse',t:'Ain’t we got fun',verseIndent:true,verseStanza:false},
  ];
  composeBookOpening(blocks);
  assert.deepEqual(blocks.slice(0,3).map(block=>block.openingDedication),[true,true,true]);
  assert.equal(blocks[0].openingDedicationLead,true);
  assert.equal(blocks[1].openingDedicationLead,false);
  assert.equal(blocks[2].before,undefined);
  assert.deepEqual(blocks.slice(3,7).map(block=>block.verseIndent),[false,true,false,true]);
  assert.equal(blocks[3].before,'page');
  assert.equal(blocks[4].before,undefined);
  assert.equal(blocks[7].openingAttribution,true);
  assert.equal(blocks[8].before,'page');
  assert.equal(blocks[8].openingDedication,undefined);
  assert.equal(blocks[9].verseIndent,true);
  assert.equal(blocks[9].openingAttribution,undefined);
});

test('Holmes front matter and in-chapter poems stay as they are',()=>{
  const hound=[
    {bookRole:'title',t:'THE HOUND OF THE BASKERVILLES'},
    {bookRole:'subtitle',t:'Another Adventure of Sherlock Holmes by A. Conan Doyle'},
    {bookRole:'dedication',t:'My dear Robinson,'},
    {bookRole:'dedication',t:'It was to your account of a West-Country legend that this tale owes its inception.'},
    {bookRole:'signature',t:'Yours most truly,'},
    {bookRole:'signature',t:'A. Conan Doyle.'},
    {bookRole:'contents-heading',t:'Contents'},
    {bookRole:'contents',t:'Chapter 1 Mr. Sherlock Holmes'},
    {bookRole:'chapter',t:'Chapter 1. Mr. Sherlock Holmes',before:'page'},
  ];
  const before=structuredClone(hound);
  composeBookOpening(hound);
  assert.deepEqual(hound,before);
  const alice=[
    {bookRole:'chapter',t:'Chapter I. Down the Rabbit-Hole',before:'page'},
    {bookRole:'verse',t:'How doth the little crocodile',verseIndent:false,verseStanza:true},
    {bookRole:'verse',t:'Improve his shining tail',verseIndent:true},
  ];
  const aliceBefore=structuredClone(alice);
  composeBookOpening(alice);
  assert.deepEqual(alice,aliceBefore);
});

test('the source line repeats an author only when the opening does not already show them',()=>{
  assert.equal(openingRepeatsAuthor({author:'F. Scott Fitzgerald',byline:true,front:['Once again']}),true);
  assert.equal(openingRepeatsAuthor({author:'Jane Austen',byline:true,front:['Chapter 1']}),true);
  assert.equal(openingRepeatsAuthor({author:'Arthur Conan Doyle',byline:true,front:['On glancing over my notes']}),true);
  assert.equal(openingRepeatsAuthor({
    author:'Arthur Conan Doyle', byline:false,
    front:['THE HOUND OF THE BASKERVILLES','Another Adventure of Sherlock Holmes by A. Conan Doyle'],
  }),true);
  assert.equal(openingRepeatsAuthor({author:'DivineAtlas',byline:false,front:['I sat stunned as the police']}),false);
  assert.equal(openingRepeatsAuthor({author:'',byline:true,front:['Once again']}),false);
});
