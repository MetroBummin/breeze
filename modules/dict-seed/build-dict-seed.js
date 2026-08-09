/* ================= 사전 씨앗 만들기 =================
 *
 * 맛보기 글에 나오는 낱말의 답을 미리 받아 `assets/samples/dict-seed.json` 으로
 * 내려받습니다. 그 파일을 앱과 함께 배포하면, 처음 온 사람이 로그인 전에도
 * 인터넷 없이도 어느 낱말을 눌러든 기다리지 않습니다.
 *
 * ── 지금은 접어 두었습니다 (2026-08-09) ────────────────────
 * 쓰는 법, 왜 접었는지, 그리고 되살리기 전에 반드시 고쳐야 하는 CORS 함정은
 * 옆의 `README.md` 에 있습니다. 앱은 이 파일을 읽지 않습니다.
 *
 * ── 왜 Node 스크립트가 아니라 콘솔인가 ─────────────────────
 * 캐시 열쇠는 `l:<낱말>|<문장해시>` 인데, 이 셋 — 낱말을 어디서 끊는지, 문장을
 * 어디서 자르는지, 해시를 어떻게 내는지 — 이 전부 앱 안의 함수입니다. Node 에서
 * 다시 구현하면 언젠가 미세하게 어긋나고, 어긋나면 씨앗이 통째로 죽습니다.
 * 그래서 앱이 실제로 그리는 화면에서, 사용자가 실제로 누르는 그 조각을 걸어
 * 열쇠를 만듭니다. 어긋날 수가 없습니다.
 *
 * 앱 번들에는 이 파일이 들어가지 않습니다.
 */

async function buildDictSeed(seedToken, options){
  options = options || {};
  const concurrency = options.concurrency || 6;

  if(!seedToken){ console.error('SEED_TOKEN 을 넘겨주세요.'); return; }
  if(!window.SB_URL && typeof SB_URL === 'undefined'){ console.error('Supabase 설정이 없습니다.'); return; }

  const samples = books.filter(b => b.sampleId);
  if(!samples.length){ console.error('샘플 글이 서가에 없습니다. 앱을 한 번 새로 열어 주세요.'); return; }
  console.info(`샘플 ${samples.length}편: ${samples.map(b=>b.title).join(', ')}`);

  /* ── 1) 화면을 실제로 그려서 누를 수 있는 낱말을 전부 걷는다 ── */
  const jobs = new Map();          // 열쇠 → {word, sentence, raw}
  const wasOpen = curBook;
  for(const book of samples){
    openBook(book);
    await new Promise(r => setTimeout(r, 300));      // 렌더가 끝나기를 기다립니다
    const spans = document.querySelectorAll('#rtext .w');
    console.info(`  ${book.title}: 낱말 조각 ${spans.length}개`);
    for(const span of spans){
      const raw = span.textContent.replace(/’/g, "'");
      const sentence = sentenceOf(span);
      if(!sentence) continue;
      /* loadCachedLook 은 entryKeys(w) 를 모두 훑습니다. lemmaCands(raw)[0] 은
         그 안에 반드시 들어 있으므로, 여기에 담아 두면 확실히 걸립니다. */
      const word = lemmaCands(raw)[0];
      const key = lookKey(word, sentence);
      if(!jobs.has(key)) jobs.set(key, { word, sentence, raw, cands: lemmaCands(raw) });
    }
  }
  show('home');
  if(wasOpen) console.info('(읽던 책에서 나왔습니다)');

  const total = jobs.size;
  const won = Math.round(total * 1.7);
  console.info(`받아야 할 답 ${total}개 — 대략 ${won.toLocaleString()}원, ${Math.ceil(total/concurrency*2/60)}분쯤 걸립니다.`);

  /* ── 2) 서버에 물어본다 ── */
  const url = SB_URL.replace(/\/$/, '') + '/functions/v1/dict';
  const entries = {};
  const failed = [];
  let done = 0;

  const list = [...jobs.entries()];
  async function worker(){
    while(list.length){
      const [key, job] = list.shift();
      try{
        const response = await fetch(url, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'apikey': SB_KEY,
                    'Authorization':'Bearer '+SB_KEY, 'x-seed-token': seedToken },
          body: JSON.stringify({ op:'seed', word: job.word, clicked: job.raw,
                                 cands: job.cands, sentence: job.sentence, book:'' })
        });
        const answer = await response.json();
        if(!answer || answer.error || !answer.ko){ failed.push([key, (answer||{}).error || response.status]); }
        else{
          /* 앱이 저장하는 모양 그대로. provider 는 씨앗에 필요 없어 뺍니다. */
          entries[key] = { lemma:answer.lemma||'', pos:answer.pos||'', ko:answer.ko,
                           gloss:answer.gloss||'', note:answer.note||'',
                           alts:answer.alts||[], colloc:answer.colloc||[] };
        }
      }catch(error){ failed.push([key, String(error && error.message || error)]); }
      if(++done % 50 === 0) console.info(`  ${done}/${total} …`);
    }
  }
  await Promise.all(Array.from({length: concurrency}, worker));

  /* ── 3) 내려받는다 ── */
  const missingGloss = Object.values(entries).filter(e => !e.gloss).length;
  const seed = { version: (options.version || 1), built: new Date().toISOString().slice(0,10),
                 entries };
  const blob = new Blob([JSON.stringify(seed)], {type:'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'dict-seed.json';
  link.click();

  console.info(`끝났습니다 — ${Object.keys(entries).length}개 받음, 실패 ${failed.length}개, ` +
               `gloss 빈 것 ${missingGloss}개, 파일 ${(blob.size/1024).toFixed(0)}KB`);
  if(failed.length) console.warn('실패한 것들:', failed.slice(0, 20));
  console.info('받은 파일을 assets/samples/dict-seed.json 에 넣고 배포하세요.');
  return { total, ok: Object.keys(entries).length, failed };
}
