import { fromParts } from '../passage.mjs';

function page(id, stem, choices, choiceJoiner){
  const stemPassage = fromParts(`${id}-stem`, 'mock-exam', stem, ' ');
  const choicePassage = fromParts(`${id}-choices`, 'mock-exam', choices, choiceJoiner);
  const sep = choiceJoiner;
  const text = `${stemPassage.text}${sep}${choicePassage.text}`;
  const shift = stemPassage.text.length + sep.length;
  return {
    id,
    dataset: 'mock-exam',
    text,
    spans: [
      ...stemPassage.spans,
      ...choicePassage.spans.map(span => ({
        ...span,
        start: span.start + shift,
        end: span.end + shift,
      })),
    ],
  };
}

const questions = [
  {
    id: 'exam-purpose',
    stem: [
      { text: 'The harbor master closed the port before dark.', category: 'prose' },
      { text: 'Which result follows from the notice?', category: 'prose' },
    ],
    choices: ['Ships stayed in port', 'The market opened early', 'The bridge was painted', 'The choir left town', 'The clock was repaired'],
    marks: ['①', '②', '③', '④', '⑤'],
  },
  {
    id: 'exam-doctor',
    stem: [
      { text: 'Dr. Hale checked the chart at 7 a.m. and called Mr. Ortiz.', category: 'abbrev' },
      { text: 'What did the clinic decide?', category: 'prose' },
    ],
    choices: ['Dr. Hale kept the patient overnight', 'Mr. Ortiz cancelled the visit', 'Mrs. Hale opened a second ward', 'The intern ignored Fig. 2', 'Nobody answered No. 4'],
    marks: ['(A)', '(B)', '(C)', '(D)', '(E)'],
  },
  {
    id: 'exam-lower',
    stem: [
      { text: 'Which sentence matches the graph?', category: 'prose' },
    ],
    choices: ['the temperature fell after noon', 'the temperature rose after noon', 'the temperature never changed', 'the sensor was unplugged'],
    marks: ['1.', '2.', '3.', '4.'],
    category: 'options-lower',
  },
  {
    id: 'exam-decimal',
    stem: [
      { text: 'The beaker held 3.14 liters before the spill.', category: 'decimals' },
      { text: 'Which reading is correct?', category: 'prose' },
    ],
    choices: ['The final volume was 2.50 liters', 'The final volume was 3.14 liters', 'The final volume was 9 a.m. sharp', 'The scale used U.S. ounces only'],
    marks: ['A)', 'B)', 'C)', 'D)'],
  },
  {
    id: 'exam-circled-upper',
    stem: [
      { text: 'A letter arrived from the council.', category: 'prose' },
      { text: 'Why was it sent?', category: 'prose' },
    ],
    choices: ['The road needed repair', 'The fair changed its date', 'The library closed on Monday', 'The river flooded the field'],
    marks: ['Ⓐ', 'Ⓑ', 'Ⓒ', 'Ⓓ'],
  },
  {
    id: 'exam-circled-lower',
    stem: [
      { text: 'Choose the best summary.', category: 'prose' },
    ],
    choices: ['The ferry waited for the tide', 'The captain sailed at dawn', 'The cargo was left on the dock', 'The lighthouse lamp went out', 'The crew repaired the sail'],
    marks: ['ⓐ', 'ⓑ', 'ⓒ', 'ⓓ', 'ⓔ'],
  },
  {
    id: 'exam-teens',
    stem: [
      { text: 'The guide stopped at the old wall.', category: 'prose' },
      { text: 'What happened next?', category: 'prose' },
    ],
    choices: ['The group entered the tower', 'The group returned to the bus', 'The group ate on the grass', 'The group missed the bell', 'The group photographed the gate'],
    marks: ['⑯', '⑰', '⑱', '⑲', '⑳'],
  },
  {
    id: 'exam-wrap',
    stem: [
      { text: 'The archivist carried the brittle letters\ninto the reading room.', category: 'pdf-linebreak' },
      { text: 'Which statement is true?', category: 'prose' },
    ],
    choices: ['The letters were moved indoors', 'The letters were thrown away', 'The room was locked all day', 'The archivist missed the train'],
    marks: ['①', '②', '③', '④'],
  },
  {
    id: 'exam-inline',
    stem: [
      { text: 'Places like Little Italy ① exist and people ② do share values, even when the street is crowded.', category: 'inline' },
      { text: 'Which choice names the point?', category: 'prose' },
    ],
    choices: ['Neighbors can share a custom', 'The street has no residents', 'Travel is impossible there', 'The crowd erased the name'],
    marks: ['(A)', '(B)', '(C)', '(D)'],
  },
  {
    id: 'exam-no-period-stem',
    stem: [
      { text: 'Which heading fits the paragraph', category: 'no-terminator' },
    ],
    choices: ['A market day in the rain', 'A train that never left', 'A doctor who missed the call', 'A map of the old canal'],
    marks: ['1.', '2.', '3.', '4.'],
  },
  {
    id: 'exam-brand',
    stem: [
      { text: 'The keynote ended.', category: 'prose' },
      { text: 'iPhone sales began the next morning.', category: 'brand' },
      { text: 'What is the main result?', category: 'prose' },
    ],
    choices: ['Sales started the next day', 'The keynote was cancelled', 'The store closed for a week', 'The price fell to 3.14'],
    marks: ['①', '②', '③', '④'],
  },
  {
    id: 'exam-year',
    stem: [
      { text: 'The treaty was signed in 1918.', category: 'prose' },
      { text: '1919 brought a new border survey.', category: 'number-start' },
      { text: 'Which fact matches the passage?', category: 'prose' },
    ],
    choices: ['A survey followed the treaty', 'The treaty was signed in 1922', 'The border never changed', 'The survey happened in 1910'],
    marks: ['Ⓐ', 'Ⓑ', 'Ⓒ', 'Ⓓ'],
  },
  {
    id: 'exam-quotes',
    stem: [
      { text: '“Come in,” said Dr. Moss.', category: 'quotes' },
      { text: 'What did Dr. Moss do?', category: 'abbrev' },
    ],
    choices: ['He invited the visitor inside', 'He locked the office door', 'He left before noon', 'He called Mrs. Moss at 6 p.m.'],
    marks: ['(A)', '(B)', '(C)', '(D)'],
  },
  {
    id: 'exam-ellipsis',
    stem: [
      { text: 'She opened the letter...', category: 'ellipsis' },
      { text: 'Then she sat down.', category: 'prose' },
      { text: 'What happened after the letter?', category: 'prose' },
    ],
    choices: ['She sat down', 'She burned the letter', 'She left the house', 'She called Dr. Kim'],
    marks: ['1.', '2.', '3.', '4.'],
  },
  {
    id: 'exam-same-mood',
    stem: [
      { text: 'The class compared four headlines.', category: 'prose' },
      { text: 'Which headline is supported?', category: 'prose' },
    ],
    choices: ['Alpha came early', 'Beta stayed home', 'Gamma missed the train', 'Delta brought the map', 'Epsilon locked the gate'],
    marks: ['①', '②', '③', '④', '⑤'],
    joiner: ' ',
  },
];

export function mockExamPassages(){
  const passages = [];
  for (const question of questions){
    const choices = question.choices.map((text, index) => ({
      text: `${question.marks[index]} ${text}`,
      category: question.category || 'options',
    }));
    const lineJoiner = question.joiner || '\n';
    passages.push(page(`${question.id}-lines`, question.stem, choices, lineJoiner));
    if (lineJoiner !== ' ')
      passages.push(page(`${question.id}-pdf`, question.stem, choices, ' '));
  }
  return passages;
}
