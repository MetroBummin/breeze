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

/* 사진 주소를 만들 때 쓰는 가짜 바탕 주소.
   기사 반입기는 http(s) 주소만 사진으로 인정합니다(`articleAbsolute`). 앱이 어디서
   도는지에 따라 진짜 바탕 주소는 https 였다가 breeze:// 였다가 하므로, 그대로
   쓰면 네이티브 셸에서만 사진이 통째로 사라집니다. 여기서 정한 주소는 어디서든
   같고, 사진 저장 열쇠(`articleImageKey`)도 따라서 어디서든 같습니다.
   이 주소로 실제로 무언가를 받아 오지는 않습니다 — 파일은 바로 아래에서
   앱 번들에서 직접 읽습니다. */
const SAMPLE_BASE = 'https://samples.breeze.local/assets/samples/';

/* 사진은 앱과 함께 옵니다. 그래서 기사 반입기의 `attachArticleImages` 대신
   여기서 직접 담습니다 — 그쪽은 남의 서버에서 받아 오는 길이라 중계와 인터넷이
   필요한데, 맛보기 글은 비행기 안에서 처음 열어도 똑같아야 합니다.
   사진 파일이 아직 없으면(assets/samples/README.md) 그 자리는 조용히 빠지고
   글만 뜹니다. */
async function attachSamplePhotos(parsed){
  const wanted = [];
  if(parsed.cover) wanted.push(parsed.cover);
  parsed.blocks.forEach(block => {
    if(block.r === 'img' && wanted.indexOf(block.t) < 0) wanted.push(block.t);
  });

  const stored = new Set();
  for(const address of wanted){
    if(address.indexOf(SAMPLE_BASE) !== 0) continue;
    try{
      const response = await fetch('assets/samples/' + address.slice(SAMPLE_BASE.length));
      if(!response.ok) continue;
      const blob = await response.blob();
      if(!blob.size || !/^image\//.test(blob.type)) continue;
      await imgPut(articleImageKey(address), blob);
      stored.add(address);
    }catch(error){ /* 사진 한 장 때문에 글을 통째로 못 읽으면 손해입니다 */ }
  }

  parsed.blocks = parsed.blocks.filter(block => block.r !== 'img' || stored.has(block.t));
  parsed.cover = stored.has(parsed.cover) ? articleImageKey(parsed.cover) : '';
  Object.assign(parsed, articleAssemble(parsed.title, parsed.blocks));
}

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
      const parsed = parseArticleHtml(await response.text(), SAMPLE_BASE + sample.id + '.html');
      if(!parsed || !parsed.paras || parsed.paras.length < 3) continue;
      await attachSamplePhotos(parsed);
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
        cover: parsed.cover || '',
        /* 사진을 다시 받아 올 주소는 적지 않습니다. 앱과 함께 오는 파일이라
           받아 올 곳이 없고, 없는 주소를 적어 두면 다른 기기가 그걸 한 번씩
           두드려 보게 됩니다. */
        imgSrc: null,
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
