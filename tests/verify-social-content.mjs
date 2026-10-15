import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {DOMParser} from 'linkedom';

const root=new URL('../',import.meta.url),url='https://x.com/writer/status/123456789';
const document=new DOMParser().parseFromString('<html></html>','text/html');
const context=vm.createContext({DOMParser,document,URL,IMG_MARK:'[[IMG]]:',AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout});
vm.runInContext(['scripts/importers/article.js','scripts/importers/social.js'].map(path=>readFileSync(new URL(path,root),'utf8')).join('\n'),context);
const {parseSocialHtml,parseSocialOembed,socialSavedNeedsRefresh}=context;
const copy=value=>JSON.parse(JSON.stringify(value));
const embed=body=>({url,html:`<blockquote class="twitter-tweet"><p>${body}</p><a href="${url}">Date</a></blockquote>`});
const ld=(text,extra={})=>'<script type="application/ld+json">'+JSON.stringify({'@type':'SocialMediaPosting',url,articleBody:text,...extra})+'</script>';
const article=()=>readFileSync(new URL('tests/fixtures/x-public-article.html',root),'utf8').replaceAll('{{POST}}',url).replaceAll('{{ARTICLE}}','https://x.com/writer/article/123456789');
const truncatedArticle=()=>article().replace('class="x-article-body"','class="x-article-body" data-truncated="true"');
const post=(text,extra='')=>`<article><a href="${url}"><time>Date</time></a><div data-testid="tweetText">${text}</div>${extra}</article>`;
const incomplete=fn=>assert.throws(fn,error=>error.code==='social_incomplete');

// Synthetic reproduction of the supplied Reader screenshot, not its unknown URL.
for(const suffix of [
  'pic.twitter.com/media',
  '<a href="https://t.co/media">pic.twitter.com/media</a>',
  '<a href="https://t.co/media">pic.x.com/media</a>',
  '<br><a href="https://t.co/media">pic.twitter.com/media</a>',
  '\n<a href="https://t.co/media">pic.twitter.com/media</a> https://t.co/second',
])for(const dots of ['...','&#8230;'])test('excerpt cannot hide behind media label: '+dots+' '+suffix,()=>{
  incomplete(()=>parseSocialOembed(embed('A synthetic post stops here'+dots+' '+suffix),url));
});
test('complete short post keeps media links, Unicode and HTML entities',()=>{
  const result=parseSocialOembed(embed('Café &amp; 책 📚.<br>A complete second line. <a href="https://t.co/media">pic.twitter.com/media</a>'),url);
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['Café & 책 📚.','A complete second line. pic.twitter.com/media']);
  assert.equal(result.blocks[1].marks[0].href,'https://t.co/media');
});
test('media-only labels are not a post body',()=>{
  incomplete(()=>parseSocialOembed(embed('<a href="https://t.co/media">pic.x.com/media</a>'),url));
});
for(const teaser of ['A complete-looking teaser.','A teaser stops here…'])test('owned full Article beats JSON-LD teaser: '+teaser,()=>{
  const result=parseSocialHtml(ld(teaser)+article(),url);
  assert.equal(result.social.scope,'article');
  assert.equal(result.social.extraction,'x-article-dom');
  assert.match(result.blocks.at(-1).t,/^The final paragraph/);
  assert(!result.blocks.some(block=>block.t===teaser));
});
test('an incomplete structured candidate does not hide a later complete owned post',()=>{
  const result=parseSocialHtml(ld('A teaser stops here…')+post('The complete first line.<br>The actual final line.'),url);
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['The complete first line.','The actual final line.']);
});
test('complete owned post DOM takes precedence over complete-looking shorter metadata',()=>{
  const result=parseSocialHtml(ld('A complete-looking share teaser.')+post('The complete first line.<br>The actual final line.'),url);
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['The complete first line.','The actual final line.']);
});
test('owned DOM text retains metadata author/date and excludes a quoted author',()=>{
  const result=parseSocialHtml(ld('A share teaser.',{author:{name:'Target writer'},datePublished:'2026-10-15'})
    +post('The complete post.','<div data-testid="quoteTweet"><span data-testid="User-Name">Quoted writer</span></div>'),url);
  assert.equal(result.author,'Target writer');assert.equal(result.publishedAt,'2026-10-15');
});
test('photo-only DOM does not replace complete structured prose',()=>{
  const result=parseSocialHtml(ld('The actual complete post.')+post('','<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/test.jpg"></div>'),url);
  assert.equal(result.blocks[0].t,'The actual complete post.');
});
for(const nested of [
  '<div data-testid="quoteTweet"><a data-testid="tweet-text-show-more-link">Show more</a></div>',
  '<article><a data-testid="tweet-text-show-more-link">Show more</a></article>',
  '<div hidden><a data-testid="tweet-text-show-more-link">Show more</a></div>',
])test('another or hidden post cutoff does not reject the requested post: '+nested,()=>{
  const result=parseSocialHtml(post('The requested post is complete.',nested),url);
  assert.equal(result.blocks[0].t,'The requested post is complete.');
});
test('the requested post own cutoff still rejects',()=>{
  incomplete(()=>parseSocialHtml(post('A teaser.', '<a data-testid="tweet-text-show-more-link">Show more</a>'),url));
});
test('a restricted Article remains restricted even with usable structured text',()=>{
  assert.throws(()=>parseSocialHtml(ld('A tempting short body.')+article().replace('content="true"','content="false"'),url),error=>error.code==='social_restricted');
});
test('restricted target metadata is terminal even when full Article DOM is present',()=>{
  assert.throws(()=>parseSocialHtml(ld('Restricted body.',{isAccessibleForFree:false})+article(),url),error=>error.code==='social_restricted');
});
test('Article metadata at a status URL still requires a full Article body',()=>{
  incomplete(()=>parseSocialHtml(ld('A short share teaser.',{'@type':'Article'}),url));
});
test('an incomplete owned Article cannot downgrade to short posting JSON-LD',()=>{
  incomplete(()=>parseSocialHtml(ld('This is only a short share teaser.')+truncatedArticle(),url));
});
test('an owned post show-more cannot be hidden by short posting JSON-LD',()=>{
  const teaser='This is only a short share teaser.';
  incomplete(()=>parseSocialHtml(ld(teaser)+post(teaser,'<a data-testid="tweet-text-show-more-link">Show more</a>'),url));
});
test('an incomplete owned Article cannot downgrade to its outer tweet text',()=>{
  const html=truncatedArticle().replace('<article>','<article><div data-testid="tweetText">This is only a short share teaser.</div>');
  incomplete(()=>parseSocialHtml(html,url));
});
for(const body of ['<div>','<div class="x-article-body" hidden>'])test('an owned Article with missing or hidden body cannot downgrade: '+body,()=>{
  incomplete(()=>parseSocialHtml(ld('A tempting share teaser.')+article().replace('<div class="x-article-body">',body),url));
});
test('an empty declared Article cannot downgrade to a posting body',()=>{
  incomplete(()=>parseSocialHtml(ld(' ',{'@type':'Article'})+ld('A tempting share teaser.'),url));
});
test('a later complete owned Article can recover an incomplete Article candidate',()=>{
  assert.match(parseSocialHtml(truncatedArticle()+article(),url).blocks.at(-1).t,/^The final paragraph/);
});
test('the owned post prose cutoff cannot be hidden by shorter JSON-LD',()=>{
  incomplete(()=>parseSocialHtml(ld('A tempting share teaser.')+post('The visible excerpt... pic.twitter.com/media'),url));
});
test('short Article metadata cannot downgrade to later posting JSON-LD',()=>{
  incomplete(()=>parseSocialHtml(ld('Tiny Article teaser.',{'@type':'Article'})+ld('This is only a short share teaser.'),url));
});
for(const provided of [false,true])test('an incomplete HTML Article never falls back to a short oEmbed response, provided='+provided,async()=>{
  const calls=[];
  const isolated=vm.createContext({
    DOMParser,document,URL,IMG_MARK:'[[IMG]]:',AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout,
    SB_URL:'https://relay.example',SB_KEY:'public-test-key',
    fetch:async target=>{
      const isEmbed=new URL(target).searchParams.get('as')==='x-oembed';calls.push(isEmbed?'oembed':'html');
      return new Response(JSON.stringify(isEmbed?embed('This is only a short share teaser.'):{url,html:truncatedArticle()}),{status:200});
    }
  });
  vm.runInContext(['scripts/importers/article.js','scripts/importers/social.js'].map(path=>readFileSync(new URL(path,root),'utf8')).join('\n'),isolated);
  await assert.rejects(isolated.loadSocialArticle(url,provided?truncatedArticle():undefined),error=>error.code==='social_incomplete');
  assert.deepEqual(calls,provided?[]:['html']);
});
test('a quoted cutoff inside the Article does not reject its owned full body',()=>{
  const html=article().replace('<div class="x-article-body">','<div class="x-article-body"><div data-testid="quoteTweet"><a data-testid="tweet-text-show-more-link">Show more</a></div>');
  assert.match(parseSocialHtml(html,url).blocks.at(-1).t,/^The final paragraph/);
});
test('no full candidate means an incomplete response, not a saved excerpt',()=>{
  incomplete(()=>parseSocialHtml(ld('A teaser…')+post('Another teaser…'),url));
});
test('known old oEmbed media-suffix excerpt is eligible only for explicit source refresh',()=>{
  const book={sourceUrl:url,social:{platform:'x',id:'123456789',scope:'single-post',extraction:'x-oembed'},paras:['Title','A teaser... pic.twitter.com/media']};
  assert.equal(socialSavedNeedsRefresh(book),true);
  assert.equal(socialSavedNeedsRefresh({...book,paras:['Title','A complete post. pic.twitter.com/media']}),false);
  assert.equal(socialSavedNeedsRefresh({...book,social:{...book.social,extraction:'public-html'}}),false);
  assert.equal(socialSavedNeedsRefresh({...book,sourceUrl:'https://x.com/other/status/987'}),false);
});
