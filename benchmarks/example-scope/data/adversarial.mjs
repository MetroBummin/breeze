import { fromParts } from '../passage.mjs';

const circledNumbers = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circledUpper = 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿ';
const circledLower = 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙ';

const choiceBodies = [
  'The glass cracked in the cold',
  'The lid was left open',
  'A nurse called the front desk',
  'The sample stayed on the bench',
  'Nobody signed the chart',
  'The window faced the quay',
  'The lamp burned until dawn',
  'The road was closed by snow',
  'The letter never arrived',
  'The gate was locked at noon',
  'The choir waited in the hall',
  'The map showed the old ford',
  'The soup had gone cold',
  'The ticket was for Tuesday',
  'The horse refused the jump',
  'The bell rang before dawn',
  'The painting hung too high',
  'The cellar smelled of rain',
  'The visitor forgot his hat',
  'The clock stopped at midnight',
];

function markedLines(id, marks, bodies, category){
  return fromParts(id, 'adversarial', bodies.map((text, index) => ({
    text: `${marks[index]} ${text}`,
    category,
  })), '\n');
}

function block(id, parts, joiner = ' '){
  return fromParts(id, 'adversarial', parts, joiner);
}

export function adversarialPassages(){
  const passages = [
    block('adv-titles', [
      { text: 'Dr. Watson called Mr. Holmes before Mrs. Hudson woke Ms. Perry.', category: 'abbrev' },
    ]),
    block('adv-titles-2', [
      { text: 'Prof. Adler met St. John Jr. outside the old college.', category: 'abbrev' },
    ]),
    block('adv-initials', [
      { text: 'The note was signed A. B. Carter and sent to the U.S. desk.', category: 'abbrev' },
    ]),
    block('adv-ampm-continue', [
      { text: 'The train leaves at 9 a.m. and returns at 6 p.m.', category: 'abbrev' },
    ]),
    block('adv-ampm-next', [
      { text: 'Meet me at 9 a.m.', category: 'abbrev' },
      { text: 'The door will be open.', category: 'prose' },
    ]),
    block('adv-eg-lower', [
      { text: 'Bring a pet, e.g. a cat, and a bowl.', category: 'abbrev' },
    ]),
    block('adv-eg-capital', [
      { text: 'See the note, e.g. Cats are fine.', category: 'abbrev' },
      { text: 'Then stop.', category: 'prose' },
    ]),
    block('adv-ie-vs', [
      { text: 'The city, i.e. Rome, was louder than the town vs. the quiet port.', category: 'abbrev' },
    ]),
    block('adv-etc-next', [
      { text: 'Bring pencils, paper, etc.', category: 'abbrev' },
      { text: 'Then sit down.', category: 'prose' },
    ]),
    block('adv-no-digit', [
      { text: 'Read Fig. 2 and answer No. 4 before Vol. 3.', category: 'decimals' },
    ]),
    block('adv-no-sentence', [
      { text: 'No.', category: 'dialogue' },
      { text: 'She refused the offer.', category: 'prose' },
    ]),
    block('adv-yes', [
      { text: 'Yes.', category: 'dialogue' },
      { text: 'He left at once.', category: 'prose' },
    ]),
    block('adv-unknown-title', [
      { text: 'Brig. Hale waved once from the steps.', category: 'abbrev' },
    ]),
    block('adv-decimal', [
      { text: 'The value of pi is 3.14, and the tax is 2.50.', category: 'decimals' },
    ]),
    block('adv-decimal-next', [
      { text: '3.14 is only an approximation.', category: 'decimals' },
      { text: '2.50 is the listed price.', category: 'decimals' },
    ]),
    block('adv-ellipsis-capital', [
      { text: 'He waited...', category: 'ellipsis' },
      { text: 'Then she spoke.', category: 'prose' },
    ]),
    block('adv-ellipsis-lower', [
      { text: 'He waited...and then spoke softly.', category: 'ellipsis' },
    ]),
    block('adv-ellipsis-char', [
      { text: 'She paused…', category: 'ellipsis' },
      { text: 'Mr. Darcy said nothing.', category: 'abbrev' },
    ]),
    block('adv-quote-tag', [
      { text: '“What time is it?” she asked.', category: 'quotes' },
    ]),
    block('adv-quote-new', [
      { text: '“What time is it?”', category: 'quotes' },
      { text: 'She left the room.', category: 'prose' },
    ]),
    block('adv-quote-period', [
      { text: 'He whispered, “Come in.”', category: 'quotes' },
      { text: 'Then he locked the door.', category: 'prose' },
    ]),
    block('adv-quote-dr', [
      { text: '“Stop,” he said.', category: 'quotes' },
      { text: '“Dr. Watson is here.”', category: 'abbrev' },
    ]),
    block('adv-brand', [
      { text: 'The keynote ended.', category: 'prose' },
      { text: 'iPhone sales began the next day.', category: 'brand' },
    ]),
    block('adv-brand-only', [
      { text: 'iPhone sales rose after the announcement even though nobody expected it', category: 'brand' },
    ]),
    block('adv-year', [
      { text: 'The war ended in 1918.', category: 'prose' },
      { text: '1919 brought new maps.', category: 'number-start' },
    ]),
    block('adv-no-period', [
      { text: 'The sample sat on the bench and nobody wrote a period', category: 'no-terminator' },
    ]),
    block('adv-no-period-paras', [
      { text: 'The sample sat on the bench', category: 'no-terminator' },
      { text: 'The nurse wrote nothing down', category: 'no-terminator' },
    ], '\n\n'),
    block('adv-pdf-wrap', [
      { text: 'Dr. Watson walked into the\nroom and closed the door.', category: 'pdf-linebreak' },
    ]),
    block('adv-pdf-wrap-plain', [
      { text: 'The courier crossed the bridge\nand left the parcel on the step', category: 'pdf-linebreak' },
    ]),
    block('adv-inline', [
      { text: 'Places like Little Italy ① exist and people ② do share values in the same street.', category: 'inline' },
    ]),
    block('adv-st-paul', [
      { text: 'They waited near St. Paul\'s until noon.', category: 'abbrev' },
    ]),
    block('adv-jr', [
      { text: 'John Smith Jr. arrived before Jane Smith Sr. left the hall.', category: 'abbrev' },
    ]),
    block('adv-jr-split', [
      { text: 'John Smith Jr. arrived.', category: 'abbrev' },
      { text: 'Jane Smith Sr. left.', category: 'abbrev' },
    ]),
    markedLines('adv-num-lower', ['1.', '2.', '3.', '4.'], [
      'apples are red',
      'bananas are yellow',
      'pears were sold out',
      'plums stayed in the crate',
    ], 'options-lower'),
    markedLines('adv-num-capital', ['1.', '2.', '3.', '4.', '5.'], [
      'Dr. Hale measured the sample',
      'Mr. Hale checked the clock',
      'Mrs. Hale locked the cabinet',
      'The intern copied Fig. 2',
      'Nobody touched No. 4',
    ], 'options'),
    markedLines('adv-paren', ['(A)', '(B)', '(C)', '(D)'], [
      'The answer is 3.14',
      'The answer is 2.71',
      'Call Dr. Rao',
      'Call Mr. Rao',
    ], 'options'),
    markedLines('adv-letter', ['A)', 'B)', 'C)', 'D)'], [
      'The river flooded the road',
      'The bridge held through the night',
      'The ferry stayed at the dock',
      'The mayor closed the school',
    ], 'options'),
    markedLines('adv-circled-num', [...circledNumbers], choiceBodies, 'options'),
    markedLines('adv-circled-upper', [...circledUpper], choiceBodies.slice(0, 10), 'options'),
    markedLines('adv-circled-ends', ['Ⓩ', 'ⓩ'], [
  'The last upper circle is still a choice',
  'The last lower circle is still a choice',
], 'options'),
    markedLines('adv-circled-lower', [...circledLower], [
      'Paris is the capital',
      'Lyon is smaller',
      'Nice faces the sea',
      'Lille is inland',
      'Rouen keeps the old clock',
      'Dijon sits on the wine road',
      'Metz borders the river',
      'Caen lost the old wall',
      'Tours has the long market',
      'Pau faces the mountains',
    ], 'options'),
    markedLines('adv-circled-lower-body', ['①', '②', '③', '④', '⑤'], [
      'the river flooded',
      'the bridge held',
      'the ferry waited',
      'the mayor objected',
      'the school closed early',
    ], 'options-lower'),
    block('adv-same-line-circles', [
      { text: '① Alpha came early', category: 'options' },
      { text: '② Beta stayed home', category: 'options' },
      { text: '③ Gamma missed the train', category: 'options' },
      { text: 'Ⓐ Delta brought the map', category: 'options' },
      { text: 'ⓐ Epsilon locked the gate', category: 'options' },
    ], ' '),
    block('adv-same-line-numbers', [
      { text: '1. Dr. Hale measured 3.14', category: 'options' },
      { text: '2. Mr. Hale measured 2.5', category: 'options' },
      { text: '(A) only the first reading', category: 'options' },
      { text: '(B) only the second reading', category: 'options' },
    ], ' '),
    block('adv-dense', [
      { text: 'Dr. Watson arrived at 3.14 p.m.', category: 'abbrev' },
      { text: 'Mr. Holmes, e.g. the detective, was out.', category: 'abbrev' },
      { text: '“Wait,” said Mrs. Hudson.', category: 'quotes' },
      { text: 'The U.S. envoy came at 8 a.m.', category: 'abbrev' },
    ]),
  ];
  return passages;
}
