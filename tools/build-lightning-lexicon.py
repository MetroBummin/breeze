#!/usr/bin/env python3
"""Build a source-traceable EN→KO preview dictionary; never invent or pad meanings."""
from __future__ import annotations
import argparse, collections, gzip, hashlib, html, json, re, zipfile
from xml.etree import ElementTree
from pathlib import Path
from urllib.parse import quote

POS = {'noun':'noun','verb':'verb','adj':'adjective','adv':'adverb','prep':'preposition',
       'conj':'conjunction','pron':'pronoun','det':'determiner','article':'article',
       'num':'numeral','intj':'interjection','unknown':'unknown'}
CATEGORY_POS = {'영어 명사':'noun','영어 동사':'verb','영어 자동사':'verb','영어 타동사':'verb',
                '영어 형용사':'adjective','영어 부사':'adverb','영어 전치사':'preposition',
                '영어 접속사':'conjunction','영어 대명사':'pronoun','영어 관사':'article',
                '영어 한정사':'determiner','영어 수사':'numeral','영어 감탄사':'interjection'}
WORD = re.compile(r"[a-z]+(?:['-][a-z]+)*\Z")
HANGUL = re.compile('[가-힣]')
UNSUITABLE = re.compile(r'(?:의 (?:복수(?:형)?|과거(?:형|분사)?|현재분사|분사|변화형|단수형|비교급|최상급|동의어|약자|약어)|음성 듣기|VOA |ISBN|https?://|위키|어원:|발음:|[{}<>]|→|⇒)')
RARE = re.compile(r'드물게|쓰이지 않|쓰이지 않는|옛말|폐어|고어|구식|사어|지금은 안')
SKIP_TAGS = {'form-of','alt-of','no-gloss','archaic','obsolete','rare','misspelling'}
# Reorder an existing matching source gloss only; no contextual WSD/new translations.
PREFERRED = {'close':{'verb':'닫다','adjective':'가까운'},
             'run':{'verb':'달리다'}, 'take':{'verb':'가져가다'},
             'make':{'verb':'만들다'}, 'have':{'verb':'가지다'}}

def short_gloss(raw: str) -> str | None:
    text = html.unescape(raw).strip()
    if not text or RARE.search(text) or UNSUITABLE.search(text): return None
    text = re.sub(r'^\s*(?:\d+[.)]|[①-⑳㉮-㉿])\s*', '', text)
    text = re.sub(r'\[\[([^]|]+)\|([^]]+)\]\]',r'\2',text)
    text = re.sub(r'\[\[([^]]+)\]\]',r'\1',text)
    # Qualifiers stay in provenance, not in the compact pill.
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r'\([^()]*\)|（[^（）]*）', ' ', text)
    text = text.strip()
    text = re.sub(r"^(?:~|–|—|-)\s*(?:(?:sth|sb|someone|something)(?:\s+|$))+", '', text)
    text = re.sub(r'\[([^]\[]+)\]', r', \1', text)
    text = re.sub(r'^[㉮-㉿]+\s*','',text)
    text = re.sub(r'\s+',' ',text).strip(' .,;:')
    # Keep composite definitions such as '연극, 극장의 막' intact.
    text = re.split(r';|\.(?:\s|$)',text,maxsplit=1)[0].strip(' .:')
    parts = [part.strip() for part in text.split(',')]
    if len(parts)>1 and all(re.fullmatch(r'[가-힣…~]+',part) for part in parts):
        text = parts[0]
    if re.search(r'인칭|주격|목적격|조동사|비교급 앞|부정문|의문문|접속사|대명사|알파벳',text):
        quoted = re.findall(r"'([가-힣]+)'",text)
        if len(quoted)==1: text=quoted[0]
        else: return None
    if not HANGUL.search(text) or not 1 <= len(text) <= 40: return None
    if re.search(r'[A-Za-z0-9{}<>]|[\[\]()（）]',text): return None
    if text.endswith(('다음과 같다','의 뜻','에 대하여','을 뜻한다','를 뜻한다')): return None
    if text.count(' ') > 6: return None
    return text

def entry_pos(row: dict) -> tuple[str,str]:
    raw = row.get('pos','unknown')
    if raw not in POS: return 'excluded','excluded'
    if raw != 'unknown': return POS[raw], 'entry'
    candidates = {CATEGORY_POS[c] for c in row.get('categories',[]) if c in CATEGORY_POS}
    if len(candidates)==1: return candidates.pop(), 'category'
    return 'unknown','missing-or-ambiguous'

def read_rows(path: Path):
    opener = gzip.open if path.suffix=='.gz' else open
    with opener(path, 'rt', encoding='utf-8') as f:
        for n,line in enumerate(f,1):
            if not line.strip(): continue
            try: row=json.loads(line)
            except ValueError as e: raise ValueError(f'Invalid JSON at line {n}') from e
            if row.get('lang_code')=='en': yield n,row

def corpus_words(root: Path | None):
    counts=collections.Counter(); files=[]
    if root:
        for path in sorted((root/'assets/classics').glob('*.epub')):
            with zipfile.ZipFile(path) as archive:
                for name in archive.namelist():
                    if not name.endswith(('.html','.xhtml','.htm')): continue
                    try: tree=ElementTree.fromstring(archive.read(name))
                    except ElementTree.ParseError: continue
                    text=' '.join(tree.itertext())
                    counts.update(re.findall(r"[a-z]+(?:['-][a-z]+)*",text.lower()))
            files.append({'path':str(path.relative_to(root)), 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    return counts,files

def build(source: Path, out: Path, count: int, manifest: dict, corpus_root: Path | None=None) -> dict:
    grouped: dict[str,dict] = {}
    aliases = collections.defaultdict(set)
    rejected = collections.Counter()
    for line,row in read_rows(source):
        original=row.get('word','')
        word=original.replace('’',"'") if isinstance(original,str) else ''
        if not WORD.fullmatch(word) or len(word)>40:
            rejected['non-lowercase-single-word']+=1; continue
        pos,pos_source=entry_pos(row)
        if pos=='excluded': rejected['excluded-pos']+=1; continue
        for sense_index,sense in enumerate(row.get('senses',[])):
            if sense.get('form_of') or sense.get('alt_of') or SKIP_TAGS.intersection(sense.get('tags',[])):
                rejected['non-lexical-or-rare-sense']+=1; continue
            glosses=sense.get('glosses',[])
            raw=next((g for g in reversed(glosses) if isinstance(g,str) and g.strip()),'')
            ko=short_gloss(raw)
            if not ko: rejected['unsuitable-gloss']+=1; continue
            group=grouped.setdefault(word,{'pos':{},'sourceWord':row['word']})
            candidates=group['pos'].setdefault(pos,[])
            if not any(c['ko']==ko for c in candidates):
                candidates.append({'ko':ko,'raw':raw,'line':line,'senseIndex':sense_index,'posSource':pos_source})
        for form in row.get('forms',[]):
            raw_form=form.get('form','')
            if not isinstance(raw_form,str): continue
            text=raw_form.replace('’',"'")
            tags=set(form.get('tags',[]))
            if tags.intersection({'romanization','canonical','table-tags','error-unrecognized-form'}): continue
            if WORD.fullmatch(text) and text!=word: aliases[text].add(word)
    if len(grouped)<count:
        raise ValueError(f'Only {len(grouped)} eligible headwords; refusing to pad to {count}')
    frequency,corpora=corpus_words(corpus_root)
    def rank(word):
        known=any(p!='unknown' for p in grouped[word]['pos'])
        return (not bool(frequency[word]), not known, -frequency[word], '-' in word or "'" in word, len(word)>18,
                hashlib.sha256(word.encode()).hexdigest())
    selected=sorted(sorted(grouped,key=rank)[:count])
    entries={}; provenance=[]
    for word in selected:
        group=grouped[word]; senses={}
        for pos,candidates in group['pos'].items():
            preferred=PREFERRED.get(word,{}).get(pos)
            if preferred:
                candidates=sorted(candidates,key=lambda c:not (c['ko']==preferred or c['ko'].startswith(preferred+', ')))
            chosen=candidates[:3]
            senses[pos]=[c['ko'] for c in chosen]
            for c in chosen:
                provenance.append({'lemma':word,'pos':pos,**c,'sourceWord':group['sourceWord'],
                  'url':'https://ko.wiktionary.org/wiki/'+quote(group['sourceWord'],safe='')+'#영어'})
        default_pos=next((p for p in senses if p!='unknown'),next(iter(senses)))
        entries[word]={'default':senses[default_pos][0],'pos':senses}
    forms={f:sorted(w for w in words if w in entries) for f,words in sorted(aliases.items())}
    forms={f:ws for f,ws in forms.items() if ws and f not in entries}
    report={'schema':1,'headwords':len(entries),'senses':sum(len(s) for e in entries.values() for s in e['pos'].values()),
      'multiPosHeadwords':sum(sum(p!='unknown' for p in e['pos'])>1 for e in entries.values()),
      'knownPosHeadwords':sum(any(p!='unknown' for p in e['pos']) for e in entries.values()),
      'unknownOnlyHeadwords':sum(list(e['pos'])==['unknown'] for e in entries.values()),
      'sourceBackedForms':len(forms),'eligibleHeadwords':len(grouped),'rejected':dict(rejected),
      'selection':'bundled-classic surface counts, then source POS; deterministic hash tie-break; NOT general English top-10k',
      'selectionCorpora':corpora,
      'meaningPolicy':'short source gloss (only simple synonym lists reduced); at most 3 per POS; source-first default except documented source-backed preferences',
      'license':'CC-BY-SA-4.0','source':manifest,
      'posCounts':dict(collections.Counter(p for e in entries.values() for p in e['pos']))}
    data={'version':1,'license':'CC-BY-SA-4.0','entries':entries,'forms':forms}
    out.mkdir(parents=True,exist_ok=True)
    packed=(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    (out/'dictionary.json').write_bytes(packed)
    (out/'dictionary.json.gz').write_bytes(gzip.compress(packed,compresslevel=9,mtime=0))
    evidence=''.join(json.dumps(p,ensure_ascii=False,separators=(',',':'))+'\n' for p in provenance).encode()
    (out/'provenance.jsonl.gz').write_bytes(gzip.compress(evidence,compresslevel=9,mtime=0))
    report.update({'dictionaryBytes':len(packed),'gzipBytes':(out/'dictionary.json.gz').stat().st_size,
      'dictionarySha256':hashlib.sha256(packed).hexdigest(),'provenanceRows':len(provenance),
      'provenanceSha256':hashlib.sha256(evidence).hexdigest()})
    (out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--corpus-root',type=Path)
    p.add_argument('--output',type=Path,default=Path('assets/dictionaries/en-ko-10k'));p.add_argument('--count',type=int,default=10000)
    args=p.parse_args()
    if not 1<=args.count<=50000: p.error('count must be between 1 and 50000')
    manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
    expected=manifest.get('sourceGzipSha256') if args.input.suffix=='.gz' else manifest.get('englishJsonlSha256')
    if not expected or hashlib.sha256(args.input.read_bytes()).hexdigest()!=expected:
        raise SystemExit('Input checksum mismatch: verify/review the new source before rebuilding')
    report=build(args.input,args.output,args.count,manifest,args.corpus_root)
    print(json.dumps({k:v for k,v in report.items() if k not in {'source','rejected'}},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
