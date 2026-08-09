/* ================= 첫 화면에 놓아 두는 읽을거리 =================
   처음 앱을 연 사람에게 빈 서가를 보여 주면, 할 일이 "무언가를 구해 오는 것"이
   됩니다. 그런데 Breeze 가 무엇을 잘하는지는 글을 읽어 봐야만 알 수 있습니다 —
   낱말을 누르면 이 문장에서의 뜻이 뜬다는 것을, 누르기 전에는 설명할 방법이
   없습니다. 그래서 누를 것을 먼저 놓아 둡니다.

   이 글들의 사전 답은 앱과 함께 옵니다(assets/samples/dict-seed.json). 그래서
   로그인하지 않아도, 인터넷이 없어도, 어느 낱말을 눌러도 바람 한 번 불고 뜻이
   뜹니다. 첫 열 번이 어떤 앱인지를 정합니다.

   한 번만 넣습니다. 지운 사람에게 다시 밀어 넣지 않습니다 — 지웠다는 것은
   보고 싶지 않다는 뜻이고, 서가는 그 사람 것입니다. */

const SAMPLES = [
  { id:'starship',  file:'assets/samples/starship.html'  },
  { id:'berkshire', file:'assets/samples/berkshire.html' },
];
const LS_SAMPLES_DONE = 'breeze.samples-seeded';

async function seedSampleArticles(){
  if(load(LS_SAMPLES_DONE, false)) return;
  /* 이미 자기 글이 있는 서가에는 끼워 넣지 않습니다. 다른 기기에서 쓰던 사람이
     로그인해 받아 온 경우, 샘플이 자기 글 사이에 섞여 들어오면 남의 물건입니다. */
  if(books.length){ save(LS_SAMPLES_DONE, true); return; }

  let added = 0;
  for(const sample of SAMPLES){
    try{
      const response = await fetch(sample.file);
      if(!response.ok) continue;
      const parsed = parseArticleHtml(await response.text(), '');
      if(!parsed || !parsed.paras || parsed.paras.length < 3) continue;
      const id = bookHash(parsed.paras);
      if(books.some(book => book.id === id)) continue;
      const book = {
        id, title:parsed.title, kind:'article', paras:parsed.paras,
        addedAt: Date.now() - added * 1000,     // 넣은 순서가 화면 순서가 되도록
        fingerprint: bookContentFingerprint(parsed.paras),
        textAvailable:true, sourceMap:null, layoutSignals:null,
        formatting: parsed.formatting || null, original:null,
        localSourceAt: Date.now(),
        site: parsed.site || '', sourceUrl:'',
        /* 샘플이라는 표시. 지웠는지 보려고가 아니라, 사전 씨앗이 어느 글의
           것인지 도구가 알아볼 수 있게 하기 위해서입니다. */
        sampleId: sample.id,
      };
      await bookPut(book);
      books.unshift(book);
      added++;
    }catch(error){
      console.warn('샘플 글을 넣지 못했습니다:', sample.id, error && error.message);
    }
  }
  save(LS_SAMPLES_DONE, true);
  return added;
}
