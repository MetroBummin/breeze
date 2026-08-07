/* ================= 수능·모의고사 문항 분리 =================
   시험지 조판에는 AI를 쓰지 않습니다. 아래 규칙은 기출 10종
   (2026 수능, 2022 대수능 9월, 2025 고3 9월, 고1·고2 3월·9월 2022/2023/2026)의
   읽기 240문항으로 검증했습니다. 측정값은 ROADMAP.md에 있습니다.

   듣기 1~17과 도표·안내문 25~28은 표·삽화에 조판이 얽혀 있어 다루지 않습니다. */

const EXAM_QSTART = /^\s*(\d{1,2})\s*[.．]\s*/;
/* 묶음 문항의 물결표는 수능이 전각(U+FF5E), 교육청 모의고사가 반각을 씁니다.
   전각을 빠뜨리면 수능의 31~34·36~39 발문과 41~45 지문이 통째로 비어 버립니다. */
const EXAM_GROUP = /^\s*\[\s*(\d{1,2})\s*[~∼～〜\-–]\s*(\d{1,2})\s*\]\s*/;
const EXAM_CHOICE_LINE = /^\s*①/;
const EXAM_CHOICE_MARK = /[①②③④⑤]/;
const EXAM_HANGUL = /[가-힣]/;
const EXAM_NOTE = /^\s*\*/;
/* 발문은 물음표로 끝나거나 "~시오"로 끝납니다. 뒤에 [3점]이 붙기도 합니다. */
const EXAM_ASK = /(?:[?？]|시오\s*[.．]?)\s*(?:\[\s*\d+\s*점\s*\])?\s*$/;
const EXAM_HEADER = /영어\s*영역|전국연합학력평가|대학수학능력시험|모의평가|저작권/;

function examQuestionInScope(number){
  return (number >= 18 && number <= 24) || number >= 29;
}

/* 실제 시험 배점 시간에서 뽑은 문항별 제한 시간. 빈칸·장문이 길고
   목적·심경처럼 답이 빨리 보이는 유형이 짧습니다. */
const EXAM_SECONDS = [
  { to:24, seconds:60 },    // 18~24 목적·심경·주장·함의·요지·주제·제목
  { to:30, seconds:80 },    // 29~30 어법·어휘
  { to:34, seconds:100 },   // 31~34 빈칸
  { to:35, seconds:70 },    // 35 무관한 문장
  { to:39, seconds:90 },    // 36~39 순서·문장 삽입
  { to:40, seconds:80 },    // 40 요약
  { to:42, seconds:100 },   // 41~42 장문
  { to:45, seconds:120 },   // 43~45 장문 순서
];
function examSeconds(number){
  const row = EXAM_SECONDS.find(item => number <= item.to);
  return row ? row.seconds : 90;
}

/* 반입기가 단별로 담아 둔 줄을 읽기 순서대로 펴고 잡동사니를 걷어냅니다. */
function examLines(sheets){
  const lines = [];
  const seen = new Set();
  (sheets || []).forEach(sheet => {
    const body = (sheet.lines || []).map(line => String(line.text || '').trim());
    const key = body.join('|').slice(0, 400);
    if(!key || seen.has(key)) return;      // 같은 쪽이 두 번 들어 있는 파일이 있습니다
    seen.add(key);
    (sheet.lines || []).forEach(line => lines.push({
      // 빈칸 자리를 살린 사본이 있으면 그쪽이 문항의 진짜 모습입니다.
      text: String(line.blank || line.text || '').trim(),
      page: sheet.n,
      outdent: Number(line.outdent) || 0,
      rel: Number(line.rel) || 0,
    }));
  });
  /* 머리글·꼬리글은 여러 쪽에 반복되면서 위아래 띠에 있습니다. 문구 목록을
     들고 있으면 출제 기관마다 손봐야 하지만, 반복을 세면 아무것도 필요 없습니다. */
  const sheetCount = new Set(lines.map(line => line.page)).size || 1;
  const normal = text => text.replace(/\d+/g, '#');
  const frequency = {};
  lines.forEach(line => { const key = normal(line.text); frequency[key] = (frequency[key] || 0) + 1; });
  const repeatMin = Math.max(2, Math.round(sheetCount * 0.5));
  return lines.filter(line => line.text
    && !(line.text.length <= 30 && frequency[normal(line.text)] >= repeatMin
         && (line.rel > 0.86 || line.rel < 0.06))
    && !EXAM_HEADER.test(line.text));
}

/* 빈칸 표시는 지문에만 뜻이 있습니다. 선택지는 격자로 조판돼 칸 사이가
   넓고, 발문은 [3점]을 오른쪽 끝에 붙입니다 — 둘 다 빈칸이 아닙니다. */
function examWithoutBlanks(text){
  return String(text || '').replace(/\s*_{4,}\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildExamQuestion(item, groups){
  const group = groups.find(entry => item.n >= entry.from && item.n <= entry.to) || null;
  const notes = item.lines.filter(line => EXAM_NOTE.test(line));
  const kept = item.lines.filter(line => !EXAM_NOTE.test(line));

  /* 선택지는 ①로 "시작하는" 마지막 줄부터 끝까지입니다. 어법(29)·흐름(35)
     문제처럼 ①~⑤가 지문 안에 박힌 경우는 줄 시작이 아니라 지문이 안 잘립니다. */
  let cut = -1;
  for(let index = kept.length - 1; index >= 0; index--){
    if(EXAM_CHOICE_LINE.test(kept[index])){ cut = index; break; }
  }
  const body = cut >= 0 ? kept.slice(0, cut) : kept.slice();
  const choiceText = cut >= 0 ? kept.slice(cut).join(' ') : '';

  // 문항 첫 줄이 한글 발문이면 그 문항 것, 없으면 묶음 지시문을 씁니다.
  let prompt = '';
  if(body.length && EXAM_HANGUL.test(body[0])){
    if(EXAM_ASK.test(body[0])) prompt = body.shift();
    else if(body[1] && EXAM_ASK.test(body[0] + ' ' + body[1])) prompt = body.shift() + ' ' + body.shift();
  }

  const shared = group && group.passage.length ? group.passage.join(' ') + ' ' : '';
  // 밑줄 뒤에 마침표가 오면 "not ______ ." 대신 "not ______." 로 붙입니다.
  const passage = (shared + body.join(' ')).replace(/_{4,}\s+([.,;:?!])/g, '______$1').trim();
  const choices = choiceText.split(EXAM_CHOICE_MARK).map(part => part.trim()).filter(Boolean);
  return {
    n: item.n,
    page: item.page,
    prompt: examWithoutBlanks(prompt || (group ? group.instruction : '')),
    passage,
    choices: choices.length === 5 ? choices.map(examWithoutBlanks) : [],
    /* 지문 안에 ①~⑤가 박힌 유형은 별도 선택지 목록이 없는 것이 정상입니다. */
    inline: choices.length !== 5 && /①[\s\S]*⑤/.test(passage),
    notes: examWithoutBlanks(notes.join(' ')),
    seconds: examSeconds(item.n),
  };
}

function sliceExamQuestions(lines){
  const questions = [], groups = [];
  let current = null, group = null;
  lines.forEach(line => {
    const groupMatch = EXAM_GROUP.exec(line.text);
    if(groupMatch){
      group = { from:+groupMatch[1], to:+groupMatch[2],
                instruction: examWithoutBlanks(line.text.replace(EXAM_GROUP, '')), passage: [] };
      groups.push(group);
      current = null;
      return;
    }
    const startMatch = EXAM_QSTART.exec(line.text);
    /* 본문 속 숫자가 아니라 문항 번호인지는 내어쓰기가 가릅니다.
       시험지는 문항 번호 줄만 본문보다 왼쪽으로 내어 조판합니다. */
    if(startMatch && line.outdent > 2){
      current = { n:+startMatch[1], page: line.page, lines: [] };
      questions.push(current);
      const rest = line.text.replace(EXAM_QSTART, '').trim();
      if(rest) current.lines.push(rest);
      return;
    }
    if(current) current.lines.push(line.text);
    else if(group) group.passage.push(line.text);   // 묶음의 공용 지문 (41~42, 43~45)
  });
  return questions.map(item => buildExamQuestion(item, groups));
}

/* 시험지가 아니면 null. 읽기 문항이 충분히 온전하게 나와야만 인정합니다. */
function parseExam(sheets){
  const questions = sliceExamQuestions(examLines(sheets))
    .filter(question => examQuestionInScope(question.n))
    .filter(question => question.passage.replace(/\s/g, '').length >= 40
                     && (question.choices.length === 5 || question.inline));
  const unique = [];
  questions.forEach(question => {
    if(!unique.some(item => item.n === question.n)) unique.push(question);
  });
  unique.sort((a, b) => a.n - b.n);
  return unique.length >= 12 ? unique : null;
}
