// Complete received HTML representations; no network or original article prose.
const url='https://publisher.example/news/item';
const head=content=>'<html><head>'+content+'</head><body></body></html>';
const photo='https://images.example/cover.jpg';
export const coverDocumentCases=[
  {name:'uppercase tag and attributes',url,html:head(`<META PROPERTY='OG:IMAGE' CONTENT='${photo}'>`),photo},
  {name:'mixed-case Twitter attribute/value',url,html:head(`<MeTa NaMe='TwItTeR:ImAgE' CoNtEnT='${photo}'>`),photo},
  {name:'first duplicate attribute wins case-insensitively',url,html:head(`<meta PROPERTY='og:image' property='twitter:image' CONTENT='${photo}' content='https://images.example/second.jpg'>`),photo},
  {name:'uppercase metadata fragment',url,html:`<META PROPERTY='og:image' CONTENT='${photo}'>`,photo},
  {name:'public absolute base directory',url,html:head(`<BASE HREF='https://images.example/assets/'><META PROPERTY='og:image' CONTENT='cover.jpg'>`),photo:'https://images.example/assets/cover.jpg'},
  {name:'public relative base directory',url,html:head(`<base href='../assets/'><meta property='og:image' content='cover.jpg'>`),photo:'https://publisher.example/assets/cover.jpg'},
  {name:'first base href wins; target-only base ignored',url,html:head(`<base target='_blank'><base HREF='https://images.example/one/'><base href='https://images.example/two/'><meta property='og:image' content='cover.jpg'>`),photo:'https://images.example/one/cover.jpg'},
  {name:'empty base uses final public URL',url,html:head(`<base HREF=''><meta property='og:image' content='cover.jpg'>`),photo:'https://publisher.example/news/cover.jpg'},
  {name:'valueless base uses final public URL',url,html:head(`<base HREF><meta property='og:image' content='cover.jpg'>`),photo:'https://publisher.example/news/cover.jpg'},
  {name:'protocol-relative public base',url,html:head(`<base href='//images.example/assets/'><meta property='og:image' content='cover.jpg'>`),photo:'https://images.example/assets/cover.jpg'},
  {name:'encoded entity base and image query',url,html:head(`<base href='https://images.example/assets&#47;'><META PROPERTY='og&#58;image' CONTENT='cover.jpg?a=1&amp;b=2'>`),photo:'https://images.example/assets/cover.jpg?a=1&b=2'},
  {name:'public absolute URL independent of unsafe base',url,html:head(`<base href='http://127.0.0.1/'><meta property='og:image' content='${photo}'>`),photo},
  {name:'safe alternative to ambiguous relative declaration',url,html:head(`<base href='http://127.0.0.1/'><meta property='og:image' content='cover.jpg'><meta name='twitter:image' content='${photo}'>`),photo},
  ...['http://127.0.0.1/','http://[::1]/','https://host.lan/','https://person:secret@images.example/assets/',
    'https://images.example/assets/?token=secret','https://images.example:8443/assets/','javascript:alert(1)'].map(base=>({
      name:'reject ambiguous base '+base,url,html:head(`<base HREF='${base}'><meta PROPERTY='og:image' CONTENT='cover.jpg'>`),error:'cover_base_unsafe'})),
  {name:'unsafe first base cannot be bypassed by second base',url,html:head(`<base href='http://127.0.0.1/'><base href='https://images.example/assets/'><meta property='og:image' content='cover.jpg'>`),error:'cover_base_unsafe'},
  {name:'uppercase lazy image and dimensions',url,html:head(`<base href='https://images.example/assets/'>`)+`<IMG SRC='https://images.example/tiny.jpg' WIDTH='1' HEIGHT='1'><IMG DATA-ORIGINAL='cover.jpg' WIDTH='800' HEIGHT='600'>`,photo:'https://images.example/assets/cover.jpg'},
  {name:'uppercase responsive attribute',url,html:`<IMG SRC='/small.jpg' SRCSET='https://images.example/small.jpg 400w, ${photo} 1200w, https://images.example/large.jpg 2400w' WIDTH='800' HEIGHT='600'>`,photo},
  {name:'entities in full head',url,html:head(`<META PROPERTY='og:image' CONTENT='https://images.example/cover.jpg?a=1&#38;b=2'>`),photo:'https://images.example/cover.jpg?a=1&b=2'},
  {name:'malformed unclosed metadata tag',url,html:`<html><head><meta property='og:image' content='${photo}'`,photo:''},
  {name:'malformed unclosed quoted value',url,html:`<html><head><meta property='og:image' content='https://images.example/a>b.jpg`,photo:''},
  {name:'valid metadata before malformed trailing tag',url,html:head(`<meta property='og:image' content='${photo}'>`)+`<meta content='unfinished`,photo},
  {name:'hidden uppercase template candidate',url,html:`<TEMPLATE><IMG SRC='${photo}' WIDTH='800' HEIGHT='600'></TEMPLATE>`,photo:''},
  {name:'unsafe base with no image candidates is actual absence',url,html:head(`<base href='http://127.0.0.1/'>`),photo:''},
];
