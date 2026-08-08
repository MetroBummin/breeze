/* .md 문서를 읽기 좋은 HTML 로 굽습니다.
 *
 *     npm run docs        (npm test 안에도 들어 있습니다)
 *
 * 왜 필요한가: 깃허브에서 마크다운을 읽으면 표·코드가 그럭저럭 나오지만, 폰에서
 * 보기 불편하고 복사해서 다른 데 붙이면 `##` 같은 기호가 그대로 따라갑니다.
 * 여기서 만든 파일은 사이트에 그대로 올라가서 주소만 있으면 누구나 읽고,
 * 브라우저의 인쇄 → PDF 로 저장하면 종이 문서가 됩니다.
 *
 * 파서를 직접 씁니다. 마크다운 라이브러리를 넣으면 빌드 단계가 생기고,
 * 이 프로젝트는 빌드 단계가 없는 것이 규칙입니다. 우리 문서가 쓰는 문법만 봅니다 —
 * 제목, 문단, 목록, 표, 코드 블록, 인용, 구분선, 굵게·기울임·인라인 코드·링크.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'docs');
const BLOB = 'https://github.com/MetroBummin/breeze/blob/main/breeze-refactored/';

/* 굽는 문서. 순서가 곧 목차 순서이고, 첫 번째가 시작 페이지가 됩니다. */
const DOCS = [
  { file: 'README.md',       out: 'index.html',        title: 'Breeze',
    blurb: '이 앱이 무엇이고 어떤 결정을 했는지' },
  { file: 'DICT.md',         out: 'dictionary.html',   title: '사전은 어떻게 움직이나',
    blurb: '낱말을 누르면 벌어지는 일, AI 부하, 서버에 남는 것' },
  { file: 'ARCHITECTURE.md', out: 'architecture.html', title: '파일 구조',
    blurb: '어떤 파일이 무슨 일을 하고 어떤 순서로 실리나' },
  { file: 'ROADMAP.md',      out: 'roadmap.html',      title: '로드맵',
    blurb: '방향 전환과 다음에 만들 것' },
];
const asHtml = new Map(DOCS.map(d => [d.file, d.out]));

/* ── 인라인 ───────────────────────────────────────────────── */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text){
  /* 인라인 코드를 먼저 빼 둡니다. 코드 안의 `**` 나 `_` 를 서식으로 읽으면 안 됩니다.
     자리표를 공백으로 감싸면 안 됩니다 — `a` `b` 처럼 한 칸 띄고 붙은 두 코드에서 앞의
     자리표가 뒤의 여는 공백까지 먹고 뒤쪽이 숫자로 남습니다. 본문에 절대 없는 글자로 감쌉니다. */
  const held = [];
  let s = text.replace(/`([^`]+)`/g, (_, code) => {
    held.push(`<code>${esc(code)}</code>`);
    return `\u0000${held.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    let url = href;
    /* 문서끼리의 링크는 구운 HTML 로, 그 밖의 저장소 파일은 깃허브로 보냅니다.
       안 그러면 사이트에서 눌렀을 때 마크다운 원본이 그대로 내려옵니다. */
    if(!/^(https?:|mailto:|#)/.test(href)){
      const [path, hash = ''] = href.split('#');
      url = (asHtml.get(path) ?? (BLOB + path)) + (hash ? '#' + hash : '');
    }
    const ext = /^https?:/.test(url) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${url}"${ext}>${label}</a>`;
  });
  /* <https://…> 는 깃허브에서 링크가 되는 문법입니다. 여기서도 링크로 만듭니다 —
     안 그러면 꺾쇠까지 글자로 남아 눌러지지 않습니다. esc() 를 지난 뒤라 꺾쇠는 이미 &lt; 입니다. */
  s = s.replace(/&lt;(https?:\/\/[^\s&<>"]+)&gt;/g,
    (_, url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,)]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[+i]);
}

/* ── 블록 ─────────────────────────────────────────────────── */
const slugged = new Map();
function slug(text){
  const base = text.trim().toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-') || 'x';
  const n = (slugged.get(base) ?? 0) + 1;
  slugged.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function convert(markdown){
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html = [], toc = [];
  let i = 0;
  const isTableRule = s => /^\|?[\s:|-]+\|[\s:|-]*$/.test(s) && s.includes('-');
  const cells = row => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  while(i < lines.length){
    const line = lines[i];

    if(!line.trim()){ i++; continue; }

    /* 코드 블록 — 안쪽은 무엇이든 그대로 둡니다 */
    const fence = line.match(/^```\s*(\S*)/);
    if(fence){
      const body = [];
      i++;
      while(i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const lang = fence[1] ? ` data-lang="${esc(fence[1])}"` : '';
      html.push(`<pre${lang}><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    if(/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)){ html.push('<hr>'); i++; continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if(heading){
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slug(text);
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      if(level === 2 || level === 3) toc.push({ level, id, text: text.replace(/[`*]/g, '') });
      i++;
      continue;
    }

    /* 표 — 머리줄 다음 줄이 구분선일 때만 표로 봅니다 */
    if(line.includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1])){
      const head = cells(line);
      i += 2;
      const rows = [];
      while(i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      const th = head.map(c => `<th>${inline(c)}</th>`).join('');
      const tb = rows.map(r => '<tr>' + head.map((_, n) => `<td>${inline(r[n] ?? '')}</td>`).join('') + '</tr>').join('');
      html.push(`<div class="tablewrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
      continue;
    }

    /* 목록. 이어지는 줄(들여쓴 줄)은 같은 항목에 붙습니다 —
       우리 README 는 한 항목이 여러 줄에 걸쳐 있는 곳이 많습니다. */
    const bullet = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if(bullet){
      const ordered = /\d/.test(bullet[2]);
      const items = [];
      while(i < lines.length){
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if(m && m[1].length <= 1){
          items.push([m[3]]);
          i++;
          /* 항목 안의 이어진 줄과 한 단 들어간 하위 목록 */
          while(i < lines.length && lines[i].trim() && !/^(\s{0,1})([-*]|\d+\.)\s/.test(lines[i])
                && !/^#{1,4}\s/.test(lines[i]) && !/^```/.test(lines[i])){
            items[items.length - 1].push(lines[i++]);
          }
          continue;
        }
        break;
      }
      const rendered = items.map(part => {
        const [first, ...rest] = part;
        const nested = rest.filter(r => /^\s{2,}([-*]|\d+\.)\s/.test(r));
        const plain = rest.filter(r => !nested.includes(r)).map(r => r.trim()).join(' ');
        const inner = inline([first, plain].filter(Boolean).join(' '));
        const sub = nested.length
          ? '<ul>' + nested.map(n => `<li>${inline(n.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`).join('') + '</ul>'
          : '';
        return `<li>${inner}${sub}</li>`;
      }).join('');
      html.push(`<${ordered ? 'ol' : 'ul'}>${rendered}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    if(/^>\s?/.test(line)){
      const body = [];
      while(i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${inline(body.join(' '))}</blockquote>`);
      continue;
    }

    /* 그 밖에는 문단. 빈 줄까지 이어 붙입니다. */
    const para = [];
    while(i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*([-*]|\d+\.)\s)/.test(lines[i])
          && !(lines[i].includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1]))){
      para.push(lines[i++]);
    }
    if(para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { body: html.join('\n'), toc };
}

/* ── 껍데기 ───────────────────────────────────────────────── */
/* 스타일을 파일 안에 박습니다. 문서 하나가 그대로 하나의 파일이라,
   메일에 첨부하든 폰에 저장하든 인터넷 없이 그대로 열립니다. */
const STYLE = `
:root{--paper:#FAF8F2;--card:#fff;--ink:#1D3A47;--body:#33505C;--soft:#5F7881;
  --soft2:#8AA0A9;--blue:#2589BE;--sky:#EAF4F8;--line:#E3E9E4;--code:#F4F6F1;}
@media (prefers-color-scheme:dark){
  :root{--paper:#16181B;--card:#1F2327;--ink:#EAF4F8;--body:#C6D3D9;--soft:#9FB1B9;
    --soft2:#7C8C94;--blue:#6FC3E6;--sky:#1D2E36;--line:#2A2E33;--code:#22262B;}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--body);
  font:16px/1.75 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",
  "Malgun Gothic",system-ui,sans-serif;-webkit-text-size-adjust:100%;}
a{color:var(--blue);text-decoration:none;border-bottom:1px solid transparent}
a:hover{border-bottom-color:currentColor}
.top{position:sticky;top:0;z-index:5;background:var(--paper);
  border-bottom:1px solid var(--line);padding:14px 22px;display:flex;align-items:center;
  gap:16px;flex-wrap:wrap;}
.top .brand{display:flex;align-items:center;gap:8px;font-weight:700;color:var(--ink);
  font-size:17px;letter-spacing:-.3px;}
.top .brand svg{width:26px;height:15px;flex:none}
.top nav{display:flex;gap:4px;flex-wrap:wrap}
.top nav a{padding:5px 11px;border-radius:999px;font-size:13.5px;color:var(--soft);border:0}
.top nav a:hover{background:var(--sky);color:var(--blue)}
.top nav a[aria-current]{background:var(--blue);color:#fff}
.wrap{max-width:1080px;margin:0 auto;padding:0 22px 90px;display:grid;
  grid-template-columns:1fr 232px;gap:44px;align-items:start;}
main{min-width:0;padding-top:14px}
aside{position:sticky;top:74px;padding-top:30px;font-size:13px;line-height:1.6}
aside .lbl{font-size:10.5px;font-weight:700;letter-spacing:.1em;color:var(--soft2);
  margin-bottom:9px;text-transform:uppercase}
aside a{display:block;color:var(--soft);padding:4px 0 4px 10px;border:0;
  border-left:2px solid var(--line);}
aside a:hover{color:var(--blue);border-left-color:var(--blue)}
aside a.sub{padding-left:22px;font-size:12.5px}
h1{font-size:clamp(28px,4.4vw,40px);line-height:1.2;letter-spacing:-.9px;color:var(--ink);
  margin:24px 0 10px;font-weight:700}
h2{font-size:22px;line-height:1.35;letter-spacing:-.4px;color:var(--ink);font-weight:700;
  margin:52px 0 12px;padding-top:14px;border-top:1px solid var(--line)}
h3{font-size:17px;color:var(--ink);font-weight:700;margin:32px 0 8px}
h4{font-size:15px;color:var(--ink);font-weight:700;margin:24px 0 6px}
p{margin:0 0 15px}
strong{color:var(--ink);font-weight:700}
ul,ol{margin:0 0 16px;padding-left:22px}
li{margin-bottom:8px}
li>ul,li>ol{margin:8px 0 0}
code{font:13.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);
  color:var(--ink);padding:2px 5px;border-radius:5px;word-break:break-word}
pre{background:var(--code);border:1px solid var(--line);border-radius:12px;
  padding:15px 17px;overflow-x:auto;margin:0 0 18px;position:relative}
pre code{background:none;padding:0;font-size:13px;line-height:1.65;white-space:pre}
pre[data-lang]::after{content:attr(data-lang);position:absolute;top:8px;right:12px;
  font-size:10px;letter-spacing:.08em;color:var(--soft2);text-transform:uppercase}
blockquote{margin:0 0 18px;padding:2px 0 2px 15px;border-left:3px solid var(--blue);
  color:var(--soft)}
hr{border:0;border-top:1px solid var(--line);margin:32px 0}
.tablewrap{overflow-x:auto;margin:0 0 20px;border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:14.5px;background:var(--card)}
th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--sky);color:var(--ink);font-weight:700;font-size:12.5px;
  letter-spacing:.03em;white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
.foot{max-width:1080px;margin:0 auto;padding:26px 22px 70px;color:var(--soft2);font-size:12.5px}
.foot a{color:var(--soft2)}
@media (max-width:860px){
  .wrap{grid-template-columns:1fr;gap:0}
  aside{position:static;padding:0 0 8px;border-bottom:1px solid var(--line);margin-bottom:8px}
  aside a{display:inline-block;border-left:0;padding:4px 10px 4px 0}
  aside a.sub{display:none}
  h2{margin-top:40px}
}
/* 인쇄 → PDF 로 저장하면 그대로 종이 문서가 됩니다. */
@media print{
  :root{--paper:#fff;--card:#fff;--ink:#000;--body:#1a1a1a;--soft:#444;--soft2:#666;
    --blue:#0b5f86;--sky:#f2f5f7;--line:#ccc;--code:#f5f5f5;}
  .top,aside{display:none!important}
  .wrap{display:block;max-width:none;padding:0}
  body{font-size:11pt}
  h1,h2,h3{break-after:avoid}
  pre,table,blockquote{break-inside:avoid}
  a{color:inherit}
  a[href^="http"]::after{content:" (" attr(href) ")";font-size:9pt;color:#666}
}`;

const mark = `<svg viewBox="0 0 100 40" fill="none" aria-hidden="true"><path d="M4 22 C20 7 43 9 51 24 C59 38 42 46 28 37 C15 29 22 8 41 4 C64 -1 88 14 97 33" stroke="#2589BE" stroke-width="7" stroke-linecap="round"/></svg>`;

function page(doc, parts){
  const nav = DOCS.map(d =>
    `<a href="${d.out}"${d.out === doc.out ? ' aria-current="page"' : ''}>${d.title}</a>`).join('');
  const toc = parts.toc.length
    ? `<aside><div class="lbl">이 문서 안</div>` +
      parts.toc.map(t => `<a class="${t.level === 3 ? 'sub' : ''}" href="#${t.id}">${esc(t.text)}</a>`).join('') +
      `</aside>`
    : '<aside></aside>';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} · Breeze 문서</title>
<meta name="description" content="${esc(doc.blurb)}">
<meta name="theme-color" content="#FAF8F2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16181B" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../assets/favicon/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<header class="top">
  <a class="brand" href="../index.html">${mark}<span>Breeze</span></a>
  <nav>${nav}</nav>
</header>
<div class="wrap">
<main>
${parts.body}
</main>
${toc}
</div>
<div class="foot">
  이 문서는 저장소의 <code>${esc(doc.file)}</code> 에서 자동으로 만들어집니다 ·
  <a href="${BLOB}${doc.file}" target="_blank" rel="noopener">원본 보기</a> ·
  인쇄(⌘P)하면 PDF 로 저장됩니다
</div>
</body>
</html>
`;
}

if(!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
let built = 0;
for(const doc of DOCS){
  const path = resolve(root, doc.file);
  if(!existsSync(path)){ console.warn(`문서 없음: ${doc.file}`); continue; }
  slugged.clear();
  writeFileSync(resolve(outDir, doc.out), page(doc, convert(readFileSync(path, 'utf8'))));
  built++;
}
console.log(`Built ${built} doc pages → docs/`);
